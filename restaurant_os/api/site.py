"""Public marketing site (/ros/): demo / trial requests become ERPNext Leads for the sales team."""

import re

import frappe
from frappe import _

from restaurant_os.utils.rate_limit import rate_limit

DEFAULT_PLANS = [
	{"plan_name": "Starter", "monthly_price": 4999, "cta": "Start free trial", "blurb": "One counter, everything to sell and cook.",
	 "features": "Counter POS with offline mode\nKitchen display (KDS)\nFBR / PRA invoice reporting + QR receipt\nSales tax, discounts, returns, shifts & Z-report\nTable map for dine-in\nDaily sales & shift reports"},
	{"plan_name": "Growth", "monthly_price": 9999, "popular": 1, "cta": "Start free trial", "blurb": "Sell online and deliver with your own riders.",
	 "features": "Everything in Starter, up to 3 counters\nOnline ordering site & self-order kiosk\nRider app, dispatch map & live tracking\nFoodpanda integration\nCustomer display, loyalty points & reviews\nRecipe stock deduction & wastage"},
	{"plan_name": "Enterprise", "monthly_price": 0, "cta": "Talk to sales", "blurb": "Many branches, central kitchen, your own processes.",
	 "features": "Everything in Growth, unlimited counters\nMulti-branch & central store procurement\nIngredient variance & menu engineering\nOnline payments (JazzCash, Easypaisa, cards)\nCustom reports & integrations\nDedicated onboarding manager"},
]


def ensure_defaults():
	"""First run: fill POS Site Settings with the launch prices and texts (never overwrites what the owner changed)."""
	s = frappe.get_single("POS Site Settings")
	if s.plans:
		return
	for k, v in {"brand_name": "MicroMax POS", "hero_title": "Run your whole restaurant from one screen.", "trial_days": 14, "yearly_months": 10,
				 "pricing_note": "Prices in PKR per branch. Taxes extra where applicable."}.items():
		if not s.get(k):
			s.set(k, v)
	if not frappe.db.sql("select 1 from tabSingles where doctype = 'POS Site Settings' and field = 'site_enabled'"):
		s.update({"site_enabled": 1, "show_pricing": 1})
	for p in DEFAULT_PLANS:
		s.append("plans", p)
	s.save(ignore_permissions=True)


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=60)
def content() -> dict:
	"""What the public website shows (prices, plans, contact). Empty fields fall back to the built-in texts."""
	s = frappe.get_cached_doc("POS Site Settings")
	plans = [{"key": p.plan_name, "price": float(p.monthly_price or 0), "popular": int(p.popular or 0), "cta": p.cta or ("Talk to sales" if not p.monthly_price else "Start free trial"),
			  "blurb": p.blurb or "", "features": [f.strip() for f in (p.features or "").splitlines() if f.strip()]} for p in s.plans]
	return {"brand": s.brand_name or "MicroMax POS", "hero_title": s.hero_title or None, "hero_subtitle": s.hero_subtitle or None,
			"enabled": int(s.site_enabled if s.site_enabled is not None else 1), "show_pricing": int(s.show_pricing if s.show_pricing is not None else 1),
			"trial_days": int(s.trial_days or 14), "yearly_months": int(s.yearly_months or 10), "setup_fee": float(s.setup_fee or 0),
			"pricing_note": s.pricing_note or None, "plans": plans,
			"contact": {"phone": s.phone or None, "whatsapp": s.whatsapp or None, "email": s.email or None, "address": s.address or None}}


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
	known = [p.plan_name for p in frappe.get_cached_doc("POS Site Settings").plans] or [p["plan_name"] for p in DEFAULT_PLANS]
	plan = plan if plan in known else "Not sure"
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
		owner = frappe.db.get_single_value("POS Site Settings", "lead_owner")
		if owner:
			from frappe.desk.form.assign_to import add as assign

			assign({"doctype": "Lead", "name": lead.name, "assign_to": [owner], "description": f"Website demo request: {restaurant}"})
	return {"ok": 1}
