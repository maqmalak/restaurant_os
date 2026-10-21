"""Public marketing site (/ros/): demo / trial requests become ERPNext Leads for the sales team."""

import re

import frappe
from frappe import _

from restaurant_os.utils.rate_limit import rate_limit

PLANS = ("Starter", "Growth", "Enterprise", "Not sure")


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=600)
def request_demo(name: str, phone: str, restaurant: str, city: str | None = None, email: str | None = None,
				 branches: str | None = None, plan: str | None = None, message: str | None = None) -> dict:
	name, phone, restaurant = (name or "").strip()[:80], (phone or "").strip()[:20], (restaurant or "").strip()[:120]
	email = (email or "").strip()[:120] or None
	if not name or not restaurant:
		frappe.throw(_("Please give your name and your restaurant's name."))
	if len(re.sub(r"\D", "", phone)) < 10:
		frappe.throw(_("Please give a mobile number we can call."))
	if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
		frappe.throw(_("That email address doesn't look right."))
	plan = plan if plan in PLANS else "Not sure"
	note = "\n".join(x for x in (f"Plan: {plan}", f"Branches: {(branches or '').strip()[:20] or '—'}", f"City: {(city or '').strip()[:60] or '—'}",
								 (message or "").strip()[:1000]) if x)
	from restaurant_os.session import as_system

	with as_system():
		lead = frappe.get_doc({"doctype": "Lead", "first_name": name, "company_name": restaurant, "mobile_no": phone, "email_id": email,
							   "city": (city or "").strip()[:60] or None,
							   "status": "Lead"})
		lead.flags.ignore_mandatory = True
		lead.insert(ignore_permissions=True)
		lead.add_comment("Comment", f"MicroMax POS demo request from the website\n{note}")
	return {"ok": 1}
