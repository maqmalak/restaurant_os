"""Delivery orders: their invoice and the dispatch steps (until the rider app, phase 7).

Kitchen: … → Ready → Picked Up (food leaves; ingredients are deducted) → Out for Delivery (own riders) → Delivered.
Foodpanda's rider collects and Foodpanda collects the money, so a Foodpanda order goes Picked Up → Delivered.

Invoice (owner's choice, 2026-10-21): every delivery order is invoiced when it is Delivered. An aggregator order goes to
the aggregator customer (Restaurant Settings → Invoice Foodpanda Orders To) at the Foodpanda price list — a receivable from
Foodpanda, settled by its payout; an order cancelled before delivery never reaches the books. An own delivery (cash on
delivery) goes to the order's customer; the rider's cash is then received at the counter (POS → Receive payment, which
allocates it to this invoice). Both are Sales Invoices outside the cashier's shift and are reported to FBR.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, nowdate

AGGREGATORS = ("Foodpanda",)


def next_status(order):
	if order.status == "Picked Up":
		return "Delivered" if order.channel in AGGREGATORS else "Out for Delivery"
	if order.status == "Out for Delivery":
		return "Delivered"
	return None


def invoice_for_order(order):
	"""A submitted Sales Invoice for a delivery / aggregator / online order (once); linked back to the order."""
	if isinstance(order, str):
		order = frappe.get_doc("Restaurant Order", order)
	if order.invoice:
		return order.invoice
	si = build_sales_invoice(order)
	si.flags.ignore_permissions = True
	si.flags.ros_report_fbr = True                            # outside a POS shift, but still a sale FBR must see
	si.insert()
	si.submit()
	order.db_set({"invoice_doctype": "Sales Invoice", "invoice": si.name, "grand_total": si.rounded_total or si.grand_total})
	if order.get("payment_status") == "Paid":
		from restaurant_os.services.payments import book_on_invoice

		book_on_invoice(order, si.name)                       # paid online at checkout
	return si.name


def _counter_profile(branch):
	return next((r.pos_profile for r in frappe.get_cached_doc("Restaurant Branch", branch).pos_profiles), None)


def build_sales_invoice(order, apply_offers=False, coupon=None, redeem_points=0):
	"""The (unsaved) Sales Invoice for an order — also the online quote, so the quote is what gets invoiced.

	Quote (apply_offers): the POS Offers engine runs on it (auto offers, the coupon, free items, bill discounts) and the
	points to redeem are applied. Real order: its lines are re-created exactly — rates as charged, free items at 0 — with
	the order's bill discount, coupon and redeemed points; the customer's loyalty program is set so the invoice earns points."""
	s = frappe.get_single("Restaurant Settings")
	branch = frappe.get_cached_doc("Restaurant Branch", order.branch)
	aggregator = order.channel in AGGREGATORS
	customer = (s.aggregator_customer if aggregator else None) or order.customer
	if not customer:
		profile = _counter_profile(order.branch)
		customer = frappe.get_cached_value("POS Profile", profile, "customer") if profile else None
	if not customer:
		frappe.throw(_("Set the customer to invoice {0} orders to (Restaurant Settings).").format(order.channel))
	price_list = "Foodpanda" if aggregator and frappe.db.exists("Price List", "Foodpanda") else \
		s.online_price_list or frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
	si = frappe.new_doc("Sales Invoice")
	si.update({"company": order.company, "customer": customer, "posting_date": nowdate(), "due_date": nowdate(),
			   "ros_channel": order.channel, "ros_order": order.name, "ignore_pricing_rule": 1,
			   "selling_price_list": price_list, "update_stock": 1, "set_warehouse": branch.kitchen_warehouse,
			   "cost_center": branch.cost_center, "taxes_and_charges": s.sales_tax_template,
			   "remarks": f"{order.channel} order #{order.order_no or ''} ({order.name or 'quote'})"
						  f"{f' · {order.channel} id {order.external_order_id}' if order.external_order_id else ''}"
						  f"{f' · {order.customer_name}' if order.customer_name and aggregator else ''}"})
	live = [r for r in order.items if r.get("kds_status") != "Void" and flt(r.qty) > 0]
	for r in live:
		row = {"item_code": r.item_code, "qty": r.qty, "warehouse": branch.kitchen_warehouse, "cost_center": branch.cost_center}
		if r.get("is_free_item"):
			row.update({"is_free_item": 1, "posa_is_offer": 1})
		si.append("items", row)
	si.set_missing_values()
	if s.sales_tax_template and not si.taxes:
		si.set_taxes()
	for r, it in zip(live, si.items):                         # line by line: the order's prices win over the price list
		if r.get("is_free_item"):
			it.discount_percentage, it.rate = 100, 0
		elif flt(r.rate):
			it.rate = it.price_list_rate = flt(r.rate)
	si.calculate_taxes_and_totals()
	profile = _counter_profile(order.branch)
	if apply_offers and profile:
		from restaurant_os.api.pos import _apply_offers

		si.ignore_pricing_rule = 0                            # only for the offers engine; a quote is never saved
		_apply_offers(si, frappe.get_doc("POS Profile", profile), {"coupon_code": coupon}, set())
		si.ignore_pricing_rule = 1
	elif not apply_offers:
		if flt(order.get("discount_amount")):
			si.additional_discount_percentage = 0
			si.discount_amount = flt(order.discount_amount)
		if order.get("coupon_code"):
			from restaurant_os.api.pos import _coupon

			c = _coupon(order.coupon_code)
			si.append("posa_coupons", {"coupon": c.name, "coupon_code": c.coupon_code, "pos_offer": c.pos_offer, "type": c.coupon_type,
									   "customer": c.customer, "applied": 1})   # POS Awesome counts the use on submit
		for name in [x for x in (order.get("offers_applied") or "").split("\n") if x and frappe.db.exists("POS Offer", x)]:
			o = frappe.get_cached_value("POS Offer", name, ["offer", "apply_on", "coupon_based"], as_dict=True)
			si.append("posa_offers", {"offer_name": name, "offer": o.offer, "apply_on": o.apply_on, "offer_applied": 1, "coupon_based": o.coupon_based})
	si.calculate_taxes_and_totals()
	from restaurant_os.api.pos import _apply_loyalty

	_apply_loyalty(si, {"redeem_points": redeem_points if apply_offers else cint(order.get("loyalty_points_redeemed"))})
	si.calculate_taxes_and_totals()
	return si


def invoice_quietly(order_name):
	"""Invoice an order without ever failing the caller (a webhook, a KDS tap); a failure is logged for the back office."""
	try:
		frappe.db.savepoint("ros_invoice")
		return invoice_for_order(order_name)
	except Exception:
		frappe.db.rollback(save_point="ros_invoice")
		frappe.clear_messages()
		frappe.log_error(title=f"Invoice for Restaurant Order {order_name} failed")
		return None
