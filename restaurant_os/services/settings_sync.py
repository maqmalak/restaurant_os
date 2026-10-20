"""Push Restaurant Settings onto the counters (POS Profiles) of the company: sales tax, invoice mode, payment modes.

Sales tax: one "Restaurant Sales Tax" template per company (On Net Total at the set rate, booked to "Sales Tax Payable"),
flagged included-in-price or added on top; POS Awesome's own posa_tax_inclusive switch is kept in step so its invoice hook
agrees. Unticking Apply Sales Tax removes the template from the counters (the template itself stays for old invoices).
"""

import frappe
from frappe import _
from frappe.utils import cint, flt

TAX_TITLE = "Restaurant Sales Tax"


def _abbr(company):
	return frappe.get_cached_value("Company", company, "abbr")


def _tax_account(company):
	abbr = _abbr(company)
	name = f"Sales Tax Payable - {abbr}"
	if not frappe.db.exists("Account", name):
		parent = frappe.db.get_value("Account", {"company": company, "account_name": "Duties and Taxes", "is_group": 1}, "name") \
			or frappe.db.get_value("Account", {"company": company, "root_type": "Liability", "is_group": 1}, "name", order_by="lft desc")
		frappe.get_doc({"doctype": "Account", "account_name": "Sales Tax Payable", "parent_account": parent, "company": company,
						"account_type": "Tax", "is_group": 0}).insert(ignore_permissions=True)
	return name


def _fee_account(company):
	name = f"FBR POS Fee Payable - {_abbr(company)}"
	if not frappe.db.exists("Account", name):
		parent = frappe.db.get_value("Account", f"Sales Tax Payable - {_abbr(company)}", "parent_account")
		frappe.get_doc({"doctype": "Account", "account_name": "FBR POS Fee Payable", "parent_account": parent, "company": company,
						"account_type": "Tax", "is_group": 0}).insert(ignore_permissions=True)
	return name


def ensure_tax_template(company, rate, inclusive, fbr_fee=0):
	"""The counter template: sales tax (when rate > 0) and the FBR POS service fee (when > 0, a fixed amount per invoice)."""
	name = f"{TAX_TITLE} - {_abbr(company)}"
	account = _tax_account(company)
	rows = []
	if flt(rate) > 0:
		frappe.db.set_value("Account", account, "tax_rate", flt(rate))
		rows.append({"charge_type": "On Net Total", "account_head": account, "description": f"Sales Tax {flt(rate):g}%",
					 "rate": flt(rate), "included_in_print_rate": 1 if inclusive else 0})
	if flt(fbr_fee) > 0:
		rows.append({"charge_type": "Actual", "account_head": _fee_account(company), "description": "FBR POS Service Fee",
					 "tax_amount": flt(fbr_fee)})
	if not rows:
		return None
	doc = frappe.get_doc("Sales Taxes and Charges Template", name) if frappe.db.exists("Sales Taxes and Charges Template", name) \
		else frappe.get_doc({"doctype": "Sales Taxes and Charges Template", "title": TAX_TITLE, "company": company})
	doc.set("taxes", rows)
	doc.save(ignore_permissions=True)
	return doc.name


def _mode_account(mode, company):
	"""The company's ledger for a payment mode: the mode's own, else Cash / a bank ledger made for it."""
	acc = frappe.db.get_value("Mode of Payment Account", {"parent": mode, "company": company}, "default_account")
	if acc:
		return acc
	abbr = _abbr(company)
	typ = frappe.db.get_value("Mode of Payment", mode, "type") or "Bank"
	if typ == "Cash":
		return f"Cash - {abbr}"
	name = f"{mode} Clearing - {abbr}"
	if not frappe.db.exists("Account", name):
		parent = frappe.db.get_value("Account", {"company": company, "account_name": "Bank Accounts", "is_group": 1}, "name")
		frappe.get_doc({"doctype": "Account", "account_name": f"{mode} Clearing", "parent_account": parent, "company": company,
						"account_type": "Bank", "is_group": 0}).insert(ignore_permissions=True)
	return name


def ensure_payment_modes(settings, company):
	"""Each listed mode exists, is enabled and has the company's account; returns the modes in counter order."""
	modes = []
	for row in settings.payment_modes:
		mop = frappe.get_doc("Mode of Payment", row.mode_of_payment)
		account = row.account or _mode_account(row.mode_of_payment, company)
		if not any(a.company == company for a in mop.accounts):
			mop.append("accounts", {"company": company, "default_account": account})
		mop.enabled = 1
		mop.save(ignore_permissions=True)
		modes.append(row.mode_of_payment)
	return modes


def sync(settings=None):
	settings = settings or frappe.get_single("Restaurant Settings")
	company = settings.company
	if not company:
		return
	inclusive = settings.tax_included_in_price == "Tax included in item price"
	if cint(settings.apply_sales_tax) and flt(settings.sales_tax_rate) <= 0:
		frappe.throw(_("Set the sales tax rate, or untick Apply Sales Tax."))
	fee = flt(settings.fbr_service_fee) if cint(settings.fbr_enabled) else 0
	template = ensure_tax_template(company, settings.sales_tax_rate if cint(settings.apply_sales_tax) else 0, inclusive, fee)
	if settings.sales_tax_template != template:
		frappe.db.set_single_value("Restaurant Settings", "sales_tax_template", template)
	modes = ensure_payment_modes(settings, company)
	use_pi = 1 if settings.invoice_mode == "POS Invoice" else 0
	if frappe.get_meta("POS Settings").has_field("invoice_type"):   # ERPNext v16 also has a site-wide switch
		frappe.db.set_single_value("POS Settings", "invoice_type", settings.invoice_mode)
	for name in frappe.get_all("POS Profile", {"company": company, "disabled": 0}, pluck="name"):
		prof = frappe.get_doc("POS Profile", name)
		prof.taxes_and_charges = template
		prof.set("taxes", [])
		prof.posa_tax_inclusive = 1 if (template and inclusive) else 0
		prof.create_pos_invoice_instead_of_sales_invoice = use_pi
		if modes:
			keep = {p.mode_of_payment: p for p in prof.payments}
			prof.set("payments", [])
			for i, mode in enumerate(modes):
				old = keep.get(mode)
				prof.append("payments", {"mode_of_payment": mode, "default": 1 if i == 0 else 0,
										 "allow_in_returns": old.allow_in_returns if old else 1})
		prof.flags.ignore_permissions = True
		prof.save()
