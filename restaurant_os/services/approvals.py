"""Manager approval for risky counter actions (spec: voids and discounts above a threshold need a manager).

The cashier's request carries `approval = {"user", "password"}` of a manager standing at the counter; the server checks the
password and the role, records who approved what on the document (comment + Version via track changes), and throttles
wrong passwords. A manager doing the action themselves needs no second sign-in.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt

MANAGER_ROLES = {"System Manager", "Sales Manager", "Accounts Manager"}
MAX_FAILURES, WINDOW = 5, 600                                     # wrong passwords per cashier per 10 minutes


class ApprovalRequired(frappe.ValidationError):
	"""The terminal asks for a manager's sign-in and retries with `approval`."""


def is_manager(user=None):
	user = user or frappe.session.user
	return user == "Administrator" or bool(MANAGER_ROLES & set(frappe.get_roles(user)))


def require(reason, approval=None):
	"""Return the approving user (the caller when they are a manager); raise ApprovalRequired otherwise."""
	if is_manager():
		return frappe.session.user
	a = json.loads(approval) if isinstance(approval, str) else (approval or {})
	user, password = (a.get("user") or "").strip(), a.get("password") or ""
	if not user or not password:
		frappe.throw(_("{0} — a manager must approve.").format(reason), ApprovalRequired, title=_("Manager approval"))
	key = f"ros:approval_fail:{frappe.session.user}"
	if cint(frappe.cache.get_value(key)) >= MAX_FAILURES:
		frappe.throw(_("Too many wrong manager passwords. Try again in 10 minutes."), frappe.AuthenticationError)
	from frappe.utils.password import check_password

	try:
		user = frappe.db.get_value("User", {"name": user}, "name") or frappe.db.get_value("User", {"username": user}, "name")
		if not user:
			raise frappe.AuthenticationError
		check_password(user, password)
	except frappe.AuthenticationError:
		frappe.cache.set_value(key, cint(frappe.cache.get_value(key)) + 1, expires_in_sec=WINDOW)
		frappe.clear_messages()
		frappe.throw(_("Wrong manager sign-in."), ApprovalRequired, title=_("Manager approval"))
	if not is_manager(user):
		frappe.throw(_("{0} is not a manager.").format(frappe.utils.get_fullname(user)), ApprovalRequired, title=_("Manager approval"))
	return user


def record(doctype, name, text, approver):
	"""Audit trail: who approved what, on the document's timeline."""
	if approver == frappe.session.user:
		return
	frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": doctype, "reference_name": name,
					"content": _("{0} — approved by {1} (cashier {2})").format(text, frappe.utils.get_fullname(approver),
																		   frappe.utils.get_fullname(frappe.session.user))}).insert(ignore_permissions=True)


def manual_discount_pct(inv, manual_rows, data):
	"""Share of the bill the cashier took off by hand: line discounts / changed rates on their rows plus a bill discount
	they typed (POS Offers and coupons don't count — they are pre-approved promotions)."""
	gross = sum(flt(r.price_list_rate or r.rate) * flt(r.qty) for r in inv.items if not r.is_free_item)
	if gross <= 0:
		return 0
	line = sum(max(flt(r.price_list_rate) - flt(r.rate), 0) * flt(r.qty) for r in inv.items if r.idx in manual_rows) / gross * 100
	bill = 0.0                                                # the bill discount, as a share of what it was taken off
	if flt(data.get("discount_percentage")) > 0 and not flt(data.get("discount_amount")):
		bill = flt(data["discount_percentage"])
	elif flt(data.get("discount_amount")) > 0:
		base = (flt(inv.grand_total) if inv.apply_discount_on == "Grand Total" else flt(inv.net_total)) + flt(inv.discount_amount)
		bill = flt(inv.discount_amount) / base * 100 if base else 0
	return round(line + bill * (1 - line / 100), 2)


def discount_limit():
	return flt(frappe.db.get_single_value("Restaurant Settings", "discount_approval_pct"))
