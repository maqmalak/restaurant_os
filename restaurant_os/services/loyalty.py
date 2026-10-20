"""Loyalty across channels (ERPNext Loyalty Program, Restaurant Settings → Loyalty Program).

Named customers — created online / by phone, or picked at the counter — are enrolled; walk-in, kiosk and aggregator sales
are not. Every invoice for an enrolled customer earns points when submitted (POS Invoice at the counter, Sales Invoice for
delivery / online — ERPNext's own loyalty entries; a shift's merged invoice earns nothing, so nothing is counted twice).
Points are spent at the counter (POS terminal) and online at checkout.
"""

import frappe
from frappe.utils import cint, flt


def program():
	return frappe.db.get_single_value("Restaurant Settings", "loyalty_program")


def anonymous():
	names = set(frappe.get_all("POS Profile", pluck="customer")) | {frappe.db.get_single_value("Restaurant Settings", "aggregator_customer")}
	return {n for n in names if n}


def enroll(customer):
	"""Put a named customer in the program (no-op for walk-in / aggregator customers or when none is set)."""
	p = program()
	if not p or not customer or customer in anonymous():
		return None
	if not frappe.db.get_value("Customer", customer, "loyalty_program"):
		frappe.db.set_value("Customer", customer, "loyalty_program", p)
	return p


def balance(customer, company=None):
	"""{points, value, conversion} for a customer (0 when not enrolled)."""
	p = frappe.db.get_value("Customer", customer, "loyalty_program") if customer else None
	if not p:
		return {"points": 0, "value": 0, "conversion": 0, "program": None}
	from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details_with_points

	company = company or frappe.db.get_single_value("Restaurant Settings", "company")
	lp = get_loyalty_program_details_with_points(customer, p, company=company, silent=True)
	pts = cint(lp.get("loyalty_points"))
	conv = flt(lp.get("conversion_factor"))
	return {"points": pts, "value": flt(pts * conv, 2), "conversion": conv, "program": p,
			"earn_per": flt(frappe.db.get_value("Loyalty Program Collection", {"parent": p}, "collection_factor", order_by="min_spent"))}


def earned_on(invoice):
	return cint(frappe.db.sql("select sum(loyalty_points) from `tabLoyalty Point Entry` where invoice = %s and loyalty_points > 0", invoice)[0][0]) if invoice else 0
