"""Reviews: after an order is delivered / collected the customer rates it (tracking page, or the WhatsApp link sent
Restaurant Settings → review delay later); a low overall rating alerts the managers (bell + realtime)."""

import json

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, now_datetime

DONE = ("Delivered", "Completed")


def _phone(order):
	return order.delivery_phone or (frappe.db.get_value("Customer", order.customer, "mobile_no") if order.customer else None)


def request_due():
	"""Scheduler (every 10 min): send the review link to customers whose order finished at least `review_delay` ago."""
	from restaurant_os.integrations.messaging.whatsapp import send
	from restaurant_os.services.loyalty import anonymous

	s = frappe.get_cached_doc("Restaurant Settings")
	cutoff = add_to_date(now_datetime(), minutes=-(cint(s.review_delay_minutes) or 30))
	sent = 0
	for o in frappe.get_all("Restaurant Order", {"status": ["in", DONE], "review": ["is", "not set"], "review_requested_at": ["is", "not set"],
												  "completed_at": ["<=", cutoff]}, ["name"], limit=100):
		order = frappe.get_doc("Restaurant Order", o.name)
		phone = _phone(order)
		if not phone or order.customer in anonymous():
			continue
		if not order.tracking_key:
			order.db_set("tracking_key", frappe.generate_hash(length=12))
		company = frappe.get_cached_value("Restaurant Branch", order.branch, "company")
		link = f"{frappe.utils.get_url()}/ros/track/{order.tracking_key}"
		send(phone, f"Thanks for ordering from {company}! How was order #{order.order_no}? Rate it here: {link}", reference=("Restaurant Order", order.name))
		order.db_set("review_requested_at", now_datetime(), update_modified=False)
		sent += 1
	return sent


def submit(key, data):
	order_name = frappe.db.get_value("Restaurant Order", {"tracking_key": key}, "name") if key and len(key) >= 10 else None
	if not order_name:
		frappe.throw(_("Order not found."), frappe.DoesNotExistError)
	order = frappe.get_doc("Restaurant Order", order_name)
	if order.status not in DONE:
		frappe.throw(_("You can rate the order once it has been delivered."))
	if order.review:
		frappe.throw(_("Thanks — this order has already been rated."))
	d = data if isinstance(data, dict) else json.loads(data)

	def stars(v, required=False):
		v = cint(v)
		if required and not 1 <= v <= 5:
			frappe.throw(_("Choose 1 to 5 stars."))
		return min(max(v, 0), 5) or None

	names = {r.item_code: r.item_name for r in order.items}
	items = [{"item_code": i["item_code"], "item_name": names.get(i["item_code"]), "rating": stars(i.get("rating")),
			  "comment": (i.get("comment") or "").strip()[:140] or None}
			 for i in d.get("items") or [] if i.get("item_code") in names and (i.get("rating") or i.get("comment"))]
	review = frappe.get_doc({
		"doctype": "Order Review", "order": order.name, "branch": order.branch, "channel": order.channel, "order_type": order.order_type,
		"customer": order.customer, "customer_name": order.customer_name, "source": d.get("source") or "Tracking Page",
		"rating_overall": stars(d.get("rating_overall"), True), "rating_food": stars(d.get("rating_food")),
		"rating_delivery": stars(d.get("rating_delivery")) if order.order_type == "Delivery" else None,
		"comment": (d.get("comment") or "").strip()[:1000] or None, "items": items,
	})
	review.insert(ignore_permissions=True)
	order.db_set({"review": review.name, "rating": review.rating_overall}, update_modified=False)
	alert_if_low(review)
	frappe.publish_realtime("ros_review", {"review": review.name, "branch": order.branch, "rating": review.rating_overall}, after_commit=True)
	return review.name


def alert_if_low(review):
	limit = cint(frappe.db.get_single_value("Restaurant Settings", "low_rating_alert")) or 2
	if cint(review.rating_overall) > limit:
		return
	users = set(frappe.get_all("Has Role", {"role": ["in", ["Sales Manager", "System Manager"]], "parenttype": "User"}, pluck="parent"))
	users = [u for u in users if u not in ("Guest",) and frappe.db.get_value("User", u, "enabled")]
	order_no = frappe.db.get_value("Restaurant Order", review.order, "order_no")
	subject = (f"⭐ {review.rating_overall}/5 from {frappe.utils.escape_html(review.customer_name or 'a customer')} on order #{order_no}"
			   f"{' — ' + frappe.utils.escape_html(review.comment[:80]) if review.comment else ''}")
	for u in users:
		frappe.get_doc({"doctype": "Notification Log", "for_user": u, "type": "Alert", "document_type": "Order Review",
						"document_name": review.name, "subject": subject}).insert(ignore_permissions=True)
	review.db_set("alerted", 1, update_modified=False)
