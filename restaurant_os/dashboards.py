"""Connections for standard ERPNext and POS Awesome doctypes (hooks → override_doctype_dashboards): the desk's
Connections and the React form's Connections tab both read these."""

from frappe import _


def _add(data, label, items, nonstd=None, internal=None):
	data = data or {}
	data.setdefault("transactions", [])
	data.setdefault("non_standard_fieldnames", {}).update(nonstd or {})
	data.setdefault("internal_links", {}).update(internal or {})
	have = {dt for t in data["transactions"] for dt in t.get("items") or []}
	items = [dt for dt in items if dt not in have]
	if items:
		data["transactions"].append({"label": label, "items": items})
	return data


def pos_invoice(data):
	data = _add(data, _("Restaurant"), ["Restaurant Order", "Integration Request"],
				{"Restaurant Order": "invoice", "Integration Request": "reference_docname"})
	return _add(data, _("Shift"), ["POS Opening Shift", "Sales Invoice"], internal={"POS Opening Shift": "posa_pos_opening_shift", "Sales Invoice": "consolidated_invoice"})


def sales_invoice(data):
	data = _add(data, _("Restaurant"), ["Restaurant Order", "Integration Request"],
				{"Restaurant Order": "invoice", "Integration Request": "reference_docname"})
	return _add(data, _("Shift"), ["POS Opening Shift"], internal={"POS Opening Shift": "posa_pos_opening_shift"})


def pos_opening_shift(data):
	data = data or {}
	data["fieldname"] = "pos_opening_shift"
	data = _add(data, _("Sales"), ["POS Invoice", "Sales Invoice"], {"POS Invoice": "posa_pos_opening_shift", "Sales Invoice": "posa_pos_opening_shift"})
	data = _add(data, _("Cash"), ["POS Cash Movement", "Payment Entry"], {"Payment Entry": "reference_no"})
	return _add(data, _("Closing"), ["POS Closing Shift", "POS Profile"], internal={"POS Profile": "pos_profile"})


def pos_closing_shift(data):
	data = _add(data, _("Shift"), ["POS Opening Shift", "POS Profile"], internal={"POS Opening Shift": "pos_opening_shift", "POS Profile": "pos_profile"})
	return _add(data, _("Sales"), ["Sales Invoice", "POS Invoice"], internal={"Sales Invoice": ["pos_transactions", "sales_invoice"],
																			 "POS Invoice": ["pos_transactions", "pos_invoice"]})


def pos_profile(data):
	data = _add(data, _("Shifts"), ["POS Opening Shift", "POS Closing Shift", "POS Cash Movement"])
	return _add(data, _("Restaurant"), ["Restaurant Branch", "POS Offer"])


def pos_offer(data):
	data = data or {}
	data["fieldname"] = "pos_offer"
	return _add(data, _("Coupons"), ["POS Coupon"])


def pos_coupon(data):
	return _add(data, _("Offer"), ["POS Offer"], internal={"POS Offer": "pos_offer"})


def pos_cash_movement(data):
	return _add(data, _("Related"), ["POS Opening Shift", "Journal Entry"], internal={"POS Opening Shift": "pos_opening_shift", "Journal Entry": "journal_entry"})


def customer(data):
	return _add(data, _("Restaurant"), ["Restaurant Order"])


def item(data):
	return _add(data, _("Restaurant"), ["Restaurant Order", "Wastage Log", "Kitchen Station", "Menu Modifier Group"])


def employee(data):
	return _add(data, _("Restaurant"), ["Rider"])
