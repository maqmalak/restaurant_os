"""Campaigns: a message (WhatsApp / SMS adapter — mock until live) to a customer segment, optionally with a coupon."""

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_url, getdate, now_datetime, nowdate

from restaurant_os.services.loyalty import anonymous


def recipients(c):
	anon = list(anonymous()) or [""]
	base = """select o.customer, max(c.customer_name) as name, max(c.mobile_no) as mobile, max(o.placed_at) as last_order,
			min(o.placed_at) as first_order, sum(o.grand_total) as spend
		from `tabRestaurant Order` o join tabCustomer c on c.name = o.customer
		where o.status not in ('Cancelled', 'Rejected') and ifnull(c.mobile_no, '') != '' and o.customer not in %(anon)s
		group by o.customer"""
	rows = frappe.db.sql(base, {"anon": anon}, as_dict=True)
	if c.segment == "Lapsed customers":
		cutoff = getdate(add_days(nowdate(), -(cint(c.lapsed_days) or 30)))
		rows = [r for r in rows if getdate(r.last_order) < cutoff]
	elif c.segment == "New this month":
		start = getdate(nowdate()).replace(day=1)
		rows = [r for r in rows if getdate(r.first_order) >= start]
	elif c.segment == "Top spenders":
		rows = sorted(rows, key=lambda r: -(r.spend or 0))[: cint(c.top_n) or 20]
	return rows


def send(campaign):
	from restaurant_os.integrations.messaging.whatsapp import send as whatsapp

	c = frappe.get_doc("Restaurant Campaign", campaign)
	if c.status == "Sent":
		frappe.throw(_("This campaign has already been sent."))
	coupon = frappe.db.get_value("POS Coupon", c.pos_coupon, "coupon_code") if c.pos_coupon else ""
	company = frappe.db.get_single_value("Restaurant Settings", "company")
	link = f"{get_url()}/ros/order"
	c.set("recipients", [])
	for r in recipients(c):
		text = (c.message or "").replace("{name}", (r.name or "there").split(" ")[0]).replace("{restaurant}", company or "") \
			.replace("{coupon}", coupon or "").replace("{link}", link)
		try:
			whatsapp(r.mobile, text, reference=("Restaurant Campaign", c.name))
			status = "Sent"
		except Exception:
			frappe.log_error(title=f"Campaign {c.name}: message to {r.customer} failed")
			status = "Failed"
		c.append("recipients", {"customer": r.customer, "customer_name": r.name, "mobile": r.mobile, "status": status})
	c.status, c.sent_on, c.recipients_count = "Sent", now_datetime(), len(c.recipients)
	c.flags.ignore_permissions = True
	c.save()
	return {"sent": sum(1 for r in c.recipients if r.status == "Sent"), "failed": sum(1 for r in c.recipients if r.status == "Failed")}
