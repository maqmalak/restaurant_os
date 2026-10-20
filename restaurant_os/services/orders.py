"""Restaurant Order: the operational order behind every sale, and its state machine.

Placed → Accepted → Preparing → Ready → Completed (counter / dine-in / takeaway) — or → Picked Up → Out for Delivery →
Delivered for delivery orders (rider app, phase 7); Cancelled / Rejected / Returned on the side. Each step stamps its
time, publishes `ros_kds` over Socket.IO (KDS screens refresh) and triggers what follows automatically: the kitchen
tickets on Accepted, recipe stock deduction on Completed / Delivered (or on invoice submit — Restaurant Settings).

A counter sale (POS Invoice / Sales Invoice with a POS Profile) creates its order on submit, lines routed to the branch's
Kitchen Stations; lines no station makes (bottled drinks…) start Ready.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

STAMP = {"Placed": "placed_at", "Accepted": "accepted_at", "Preparing": "preparing_at", "Ready": "ready_at",
		 "Completed": "completed_at", "Delivered": "completed_at", "Cancelled": "cancelled_at", "Rejected": "cancelled_at"}
DONE = ("Completed", "Delivered")
STOCK_AT = ("Completed", "Picked Up", "Delivered")             # the food has left the kitchen
OPEN = ("Placed", "Accepted", "Preparing", "Ready")


def settings():
	return frappe.get_cached_doc("Restaurant Settings")


def publish(order, event="update"):
	frappe.publish_realtime("ros_kds", {"event": event, "order": order.name, "branch": order.branch, "status": order.status},
							after_commit=True)


def enqueue(method, **kwargs):
	"""A background job — or right away when Restaurant Settings say no worker runs (a dev bench)."""
	if cint(settings().run_jobs_inline) or frappe.flags.in_test:
		frappe.get_attr(method)(**kwargs)
	else:
		frappe.enqueue(method, queue="short", enqueue_after_commit=True, **kwargs)


def _next_order_no(branch):
	today = frappe.db.count("Restaurant Order", {"branch": branch, "creation": [">=", nowdate()]})
	return str(today + 1)


def set_status(order, status, save=True):
	if order.status == status:
		return order
	order.status = status
	field = STAMP.get(status)
	if field and not order.get(field):
		order.set(field, now_datetime())
	# flags first: RestaurantOrder.on_update acts on them when this save (or the caller's, with save=False) lands
	if status in STOCK_AT and settings().stock_deduction_moment == "On Order Completion":
		order.flags.ros_deduct = True                         # issue the recipe ingredients
	if order.order_type == "Delivery":
		from restaurant_os.services import riders

		if status == "Ready" and riders.offer_due(order):
			order.flags.ros_assign = True                     # offer it to a rider
	if save:
		order.flags.ignore_permissions = True
		order.save()
	publish(order)
	if order.order_type == "Delivery":
		from restaurant_os.services import riders

		riders.aggregator_rider_update(order)
	return order


def refresh_status(order):
	"""Order status from its kitchen lines: any started → Preparing; every one ready / served → Ready. Lines no station
	makes (delivery fee, …) don't count — an order of only such lines is Ready at once."""
	live = [r for r in order.items if r.kds_status != "Void"]
	if order.status not in OPEN or not live:
		return
	live = [r for r in live if r.station] or live
	if all(r.kds_status in ("Ready", "Served") for r in live):
		set_status(order, "Ready", save=False)
	elif any(r.kds_status in ("Preparing", "Ready") for r in live):
		set_status(order, "Preparing", save=False)
	else:
		set_status(order, "Accepted", save=False)


def create_order(branch, items, channel="POS", order_type=None, customer=None, customer_name=None, table=None, notes=None,
				 invoice_doctype=None, invoice=None, grand_total=0, external_order_id=None, client_order_uuid=None, priority=0, delivery=None,
				 await_payment=False):
	"""A Restaurant Order from any channel, accepted straight away, its lines routed to the branch's kitchen stations."""
	from restaurant_os.restaurant_os.doctype.kitchen_station.kitchen_station import station_for_item

	if client_order_uuid:
		existing = frappe.db.get_value("Restaurant Order", {"client_order_uuid": client_order_uuid}, "name")
		if existing:
			return frappe.get_doc("Restaurant Order", existing)
	company = frappe.db.get_value("Restaurant Branch", branch, "company")
	order = frappe.get_doc({
		"doctype": "Restaurant Order", "branch": branch, "company": company, "channel": channel,
		"order_type": order_type or settings().kds_default_order_type or "Takeaway", "customer": customer,
		"customer_name": customer_name or customer, "table": table, "notes": notes, "invoice_doctype": invoice_doctype,
		"invoice": invoice, "grand_total": grand_total, "external_order_id": external_order_id,
		"client_order_uuid": client_order_uuid, "priority": priority, "order_no": _next_order_no(branch),
		"status": "Placed", "placed_at": now_datetime(), **(delivery or {}),
	})
	for it in items:
		station = it.get("station") or station_for_item(branch, it["item_code"])
		order.append("items", {**it, "station": station, "kds_status": "Queued" if station else "Ready"})
	order.flags.ignore_permissions = True
	if await_payment:                                         # paid online: off the KDS until the gateway confirms
		order.status = "Awaiting Payment"
		order.insert()
		return order
	order.insert()
	set_status(order, "Accepted", save=False)
	refresh_status(order)
	order.save()
	publish(order, "new")
	return order


def counter_channel(doc):
	"""A counter invoice's channel: a self-order kiosk sale the cashier completed keeps its "Kiosk K<n> · name · Eat in"
	note (online.kiosk_order) → Kiosk, Dine-in / Takeaway; anything else rung up at the counter → POS."""
	note = doc.get("remarks") or ""
	if note.startswith("Kiosk K"):
		return "Kiosk", ("Dine-in" if note.rstrip().endswith("Eat in") else "Takeaway")
	return "POS", None


def tag_channel(doc, method=None):
	"""Sales Invoice before_submit: the order channel for the invoice list (counter sales and merged shift invoices = POS)."""
	if doc.doctype == "Sales Invoice" and not doc.get("ros_channel") and (doc.get("is_pos") or doc.get("is_consolidated")):
		doc.ros_channel = counter_channel(doc)[0]


def order_from_invoice(doc, method=None):
	"""POS Invoice / Sales Invoice on_submit: the kitchen order for a counter sale (once per invoice)."""
	if not (doc.get("is_pos") and doc.get("pos_profile")) or doc.get("is_return") or doc.get("is_consolidated"):
		return
	if doc.flags.get("ros_order"):                            # settling a dine-in sitting: link, don't cook again
		frappe.db.set_value("Restaurant Order", doc.flags.ros_order, {"invoice_doctype": doc.doctype, "invoice": doc.name,
																	   "grand_total": doc.rounded_total or doc.grand_total})
		order = frappe.get_doc("Restaurant Order", doc.flags.ros_order)
		publish(order)
		if settings().stock_deduction_moment == "On Invoice Submit":
			enqueue("restaurant_os.services.stock_deduction.post_for_order", order=order.name)
		return
	if doc.doctype == "Sales Invoice" and frappe.db.exists("POS Invoice", {"consolidated_invoice": doc.name}):
		return                                                # the merged invoice of a shift — its POS Invoices have orders
	if frappe.db.exists("Restaurant Order", {"invoice_doctype": doc.doctype, "invoice": doc.name}):
		return
	from restaurant_os.restaurant_os.doctype.restaurant_branch.restaurant_branch import branch_for_pos_profile

	branch = branch_for_pos_profile(doc.pos_profile) or settings().default_branch
	if not branch:
		return
	channel, order_type = counter_channel(doc)
	extra = {"order_type": order_type} if order_type else {}
	try:
		create_order(branch, [{"item_code": i.item_code, "item_name": i.item_name, "qty": i.qty, "uom": i.uom, "rate": i.rate,
							   "amount": i.amount, "is_free_item": i.is_free_item, "notes": i.get("posa_notes")} for i in doc.items],
					 channel=channel, **extra, customer=doc.customer, customer_name=doc.customer_name, notes=doc.get("posa_notes") or None,
					 invoice_doctype=doc.doctype, invoice=doc.name, grand_total=doc.rounded_total or doc.grand_total,
					 client_order_uuid=f"{doc.doctype}:{doc.name}")
	except Exception:
		frappe.log_error(title=f"Restaurant Order for {doc.name} failed")   # never block the sale
		return
	if settings().stock_deduction_moment == "On Invoice Submit":
		name = frappe.db.get_value("Restaurant Order", {"invoice_doctype": doc.doctype, "invoice": doc.name}, "name")
		enqueue("restaurant_os.services.stock_deduction.post_for_order", order=name)


def cancel_from_invoice(doc, method=None):
	"""Invoice cancelled: its order is cancelled and any ingredient issue reversed."""
	for name in frappe.get_all("Restaurant Order", {"invoice_doctype": doc.doctype, "invoice": doc.name}, pluck="name"):
		order = frappe.get_doc("Restaurant Order", name)
		if order.stock_entry and frappe.db.get_value("Stock Entry", order.stock_entry, "docstatus") == 1:
			se = frappe.get_doc("Stock Entry", order.stock_entry)
			se.flags.ignore_permissions = True
			se.cancel()
			order.stock_status = "Pending"
			order.flags.ros_stock_reset = True                  # the issue was reversed: let this save clear it
		for r in order.items:
			r.kds_status = "Void"
		set_status(order, "Cancelled")
