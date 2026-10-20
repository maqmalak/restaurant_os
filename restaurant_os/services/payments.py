"""Online payment of web / app orders.

place_order(payment = Online) → the order waits as "Awaiting Payment" (off the KDS) → a payment session (Integration
Request) and the gateway's checkout URL → paid: the order goes to the kitchen (Accepted), nothing to collect on delivery;
failed / cancelled: it keeps waiting and the customer can retry from the tracking page. When the order is delivered /
collected and invoiced, the online payment is booked against that invoice (Payment Entry, Restaurant Settings → Mode of
Payment, the gateway's clearing account).
"""

import json

import frappe
from frappe import _
from frappe.utils import flt, now_datetime, nowdate

from restaurant_os.integrations.payments.gateway import gateway


def start(order):
	"""A payment session for the order; returns the URL to send the customer to."""
	if isinstance(order, str):
		order = frappe.get_doc("Restaurant Order", order)
	if order.payment_status == "Paid":
		frappe.throw(_("Order #{0} is already paid.").format(order.order_no))
	gw = gateway()
	ir = frappe.get_doc({"doctype": "Integration Request", "integration_request_service": f"Payment {gw.name}", "is_remote_request": 0,
						 "status": "Queued", "reference_doctype": "Restaurant Order", "reference_docname": order.name,
						 "data": json.dumps({"order": order.name, "order_no": order.order_no, "amount": flt(order.grand_total) - flt(order.loyalty_amount),
											 "currency": frappe.get_cached_value("Company", order.company, "default_currency")})})
	ir.insert(ignore_permissions=True)
	order.db_set({"payment_request": ir.name, "payment_status": "Awaiting", "payment_method": "Online"})
	return gw.checkout_url(ir.name, flt(order.grand_total) - flt(order.loyalty_amount), order)


def mark_paid(session, reference=None):
	"""The gateway confirmed the payment: release the order to the kitchen."""
	from restaurant_os.services import orders as svc

	ir = frappe.get_doc("Integration Request", session)
	if ir.status == "Completed":
		return ir.reference_docname
	data = json.loads(ir.data or "{}")
	order = frappe.get_doc("Restaurant Order", ir.reference_docname)
	order.flags.ignore_permissions = True
	ir.db_set({"status": "Completed", "output": json.dumps({"reference": reference, "paid_at": str(now_datetime())})})
	order.payment_status, order.paid_amount, order.payment_reference = "Paid", flt(data.get("amount")), reference or session
	order.cod_amount = 0
	if order.status == "Awaiting Payment":
		svc.set_status(order, "Accepted", save=False)
		svc.refresh_status(order)
	order.save()
	svc.publish(order, "new")                                 # the KDS rings
	return order.name


def mark_failed(session, reason=None):
	ir = frappe.get_doc("Integration Request", session)
	if ir.status == "Completed":
		return
	ir.db_set({"status": "Failed", "error": reason or "Payment failed / cancelled"})
	frappe.db.set_value("Restaurant Order", ir.reference_docname, "payment_status", "Failed")


def book_on_invoice(order, invoice):
	"""Invoice made for an order paid online: a Payment Entry against it into the gateway's account."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	if order.payment_status != "Paid" or not flt(order.paid_amount):
		return None
	mode = frappe.db.get_single_value("Restaurant Settings", "online_payment_mode") or "Online Payment"
	outstanding = flt(frappe.db.get_value("Sales Invoice", invoice, "outstanding_amount"))
	amount = min(flt(order.paid_amount), outstanding)
	if amount <= 0:
		return None
	pe = get_payment_entry("Sales Invoice", invoice, party_amount=amount)
	pe.update({"mode_of_payment": mode, "paid_to": get_bank_cash_account(mode, order.company).get("account"), "paid_amount": amount,
			   "received_amount": amount, "reference_no": order.payment_reference or order.name, "reference_date": nowdate(),
			   "custom_remarks": 1, "remarks": f"Paid online — order #{order.order_no} ({order.name})"})
	for ref in pe.references:
		ref.allocated_amount = min(flt(ref.outstanding_amount), amount)
	pe.set_amounts()
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name
