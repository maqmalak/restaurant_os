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
from frappe.utils import flt, nowdate

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
	return si.name


def build_sales_invoice(order):
	"""The (unsaved) Sales Invoice for an order — also used to quote online orders, so the quote is what gets invoiced."""
	s = frappe.get_single("Restaurant Settings")
	branch = frappe.get_cached_doc("Restaurant Branch", order.branch)
	aggregator = order.channel in AGGREGATORS
	customer = (s.aggregator_customer if aggregator else None) or order.customer
	if not customer:
		profile = next((r.pos_profile for r in branch.pos_profiles), None)
		customer = frappe.get_cached_value("POS Profile", profile, "customer") if profile else None
	if not customer:
		frappe.throw(_("Set the customer to invoice {0} orders to (Restaurant Settings).").format(order.channel))
	price_list = "Foodpanda" if aggregator and frappe.db.exists("Price List", "Foodpanda") else \
		s.online_price_list or frappe.db.get_single_value("Selling Settings", "selling_price_list") or "Standard Selling"
	si = frappe.new_doc("Sales Invoice")
	si.update({"company": order.company, "customer": customer, "posting_date": nowdate(), "due_date": nowdate(),
			   "selling_price_list": price_list, "update_stock": 1, "set_warehouse": branch.kitchen_warehouse,
			   "cost_center": branch.cost_center, "taxes_and_charges": s.sales_tax_template,
			   "remarks": f"{order.channel} order #{order.order_no or ''} ({order.name or 'quote'})"
						  f"{f' · {order.channel} id {order.external_order_id}' if order.external_order_id else ''}"
						  f"{f' · {order.customer_name}' if order.customer_name and aggregator else ''}"})
	for r in order.items:
		if r.kds_status == "Void" or flt(r.qty) <= 0:
			continue
		row = {"item_code": r.item_code, "qty": r.qty, "warehouse": branch.kitchen_warehouse, "cost_center": branch.cost_center}
		if flt(r.rate):
			row.update({"rate": flt(r.rate), "price_list_rate": flt(r.rate)})
		si.append("items", row)
	si.set_missing_values()
	if s.sales_tax_template and not si.taxes:
		si.set_taxes()
	for r in si.items:                                        # the order's prices win over the price list
		src = next((x for x in order.items if x.item_code == r.item_code and flt(x.rate)), None)
		if src:
			r.rate = r.price_list_rate = flt(src.rate)
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
