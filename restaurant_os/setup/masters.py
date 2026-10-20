"""`bench --site restaurant.localhost ros-setup` — company and everything a counter needs, re-run safe.

Company Saffron Grill (fictional demo restaurant, Lahore, PKR, fiscal year July–June) via the setup wizard on a fresh site;
warehouses Central Store → Gulberg Kitchen; cost center Gulberg; payment modes Cash / Credit Card; walk-in customer;
POS Profile "Gulberg Counter" with POS Awesome's cash movement, returns and credit sale settings; branch Gulberg;
cashier and manager users (passwords in ~/.restaurant-site-secrets, never printed).
"""

import os
import secrets

import frappe
from frappe.utils import add_days, add_months, getdate, nowdate

COMPANY = "Saffron Grill"
ABBR = "SGR"
BRANCH = "Gulberg"
PROFILE = "Gulberg Counter"
WALK_IN = "Walk-in Customer"
SECRETS = os.path.expanduser("~/.restaurant-site-secrets")
USERS = [
	("cashier@saffrongrill.example", "Ayesha", "Khan", ["Sales User", "Accounts User", "Stock User"]),
	("manager@saffrongrill.example", "Bilal", "Ahmed", ["Sales Manager", "Sales User", "Accounts User", "Accounts Manager",
													   "Stock User", "Stock Manager", "Purchase User", "Purchase Manager"]),
]


def acct(name):
	return f"{name} - {ABBR}"


def ensure_company():
	if frappe.db.exists("Company", COMPANY):
		return COMPANY
	if frappe.db.get_single_value("System Settings", "setup_complete"):
		frappe.get_doc({"doctype": "Company", "company_name": COMPANY, "abbr": ABBR, "country": "Pakistan",
						"default_currency": "PKR", "chart_of_accounts": "Standard"}).insert(ignore_permissions=True)
	else:
		from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

		today = getdate(nowdate())
		fy_start = f"{today.year if today.month >= 7 else today.year - 1}-07-01"
		setup_complete({
			"language": "English", "country": "Pakistan", "timezone": "Asia/Karachi", "currency": "PKR",
			"company_name": COMPANY, "company_abbr": ABBR, "chart_of_accounts": "Standard",
			"company_tagline": "Charcoal grill and karahi since 2009 (demo)",
			"fy_start_date": fy_start, "fy_end_date": str(add_days(add_months(fy_start, 12), -1)),
			"full_name": "Administrator", "email": "admin@saffrongrill.example", "password": None, "setup_demo": 0,
		})
	frappe.db.commit()
	return COMPANY


def _account(name, parent, account_type=None):
	if not frappe.db.exists("Account", acct(name)):
		frappe.get_doc({"doctype": "Account", "account_name": name, "parent_account": acct(parent), "company": COMPANY,
						"account_type": account_type, "is_group": 0}).insert(ignore_permissions=True)
	return acct(name)


def ensure_accounts():
	card = _account("Card Clearing", "Bank Accounts", "Bank")
	back = _account("Back Office Cash", "Cash In Hand", "Cash")
	bank = _account("Main Bank Account", "Bank Accounts", "Bank")
	for mode, typ, account in (("Cash", "Cash", acct("Cash")), ("Credit Card", "Bank", card), ("Bank Transfer", "Bank", bank)):
		mop = frappe.get_doc("Mode of Payment", mode) if frappe.db.exists("Mode of Payment", mode) else \
			frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": mode, "type": typ, "enabled": 1})
		if not any(r.company == COMPANY for r in mop.accounts):
			mop.append("accounts", {"company": COMPANY, "default_account": account})
		mop.enabled = 1
		mop.save(ignore_permissions=True)
	return {"card": card, "back_office": back, "bank": bank}


def _warehouse(name, parent=None):
	full = acct(name)
	if not frappe.db.exists("Warehouse", full):
		frappe.get_doc({"doctype": "Warehouse", "warehouse_name": name, "company": COMPANY,
						"parent_warehouse": parent or acct("All Warehouses")}).insert(ignore_permissions=True)
	return full


def ensure_warehouses():
	return _warehouse("Central Store"), _warehouse(f"{BRANCH} Kitchen")


def ensure_logo():
	"""The demo company's logo — printed at the top of every receipt."""
	if frappe.db.get_value("Company", COMPANY, "company_logo"):
		return
	path = os.path.join(os.path.dirname(__file__), "..", "demo", "images", "saffron_grill_logo.svg")
	f = frappe.get_doc({"doctype": "File", "file_name": "saffron_grill_logo.svg", "is_private": 0, "attached_to_doctype": "Company",
						"attached_to_name": COMPANY, "attached_to_field": "company_logo", "content": open(path, "rb").read()})
	f.insert(ignore_permissions=True)
	frappe.db.set_value("Company", COMPANY, "company_logo", f.file_url)


def ensure_cost_center():
	cc = acct(BRANCH)
	if not frappe.db.exists("Cost Center", cc):
		frappe.get_doc({"doctype": "Cost Center", "cost_center_name": BRANCH, "company": COMPANY,
						"parent_cost_center": acct(COMPANY)}).insert(ignore_permissions=True)
	return cc


def leaf(doctype, setting, preferred):
	"""A non-group Customer Group / Territory: the Selling Settings default, else `preferred`, else any leaf."""
	for name in (frappe.db.get_single_value("Selling Settings", setting), preferred):
		if name and frappe.db.exists(doctype, {"name": name, "is_group": 0}):
			return name
	return frappe.db.get_value(doctype, {"is_group": 0}, "name", order_by="lft")


def ensure_customer():
	group, territory = leaf("Customer Group", "customer_group", "Individual"), leaf("Territory", "territory", "Pakistan")
	ss = frappe.get_single("Selling Settings")                # quick customers from the counter use these too
	if not ss.customer_group or not ss.territory:
		ss.customer_group = ss.customer_group or group
		ss.territory = ss.territory or territory
		ss.save(ignore_permissions=True)
	if not frappe.db.exists("Customer", WALK_IN):
		frappe.get_doc({"doctype": "Customer", "customer_name": WALK_IN, "customer_type": "Individual",
						"customer_group": group, "territory": territory}).insert(ignore_permissions=True)
	return WALK_IN


def _password():
	"""Demo staff password: from ~/.restaurant-site-secrets (created once, mode 600) — never printed."""
	values = {}
	if os.path.exists(SECRETS):
		for line in open(SECRETS):
			if "=" in line:
				k, v = line.strip().split("=", 1)
				values[k] = v
	if not values.get("STAFF_DEMO_PASSWORD"):
		values["STAFF_DEMO_PASSWORD"] = "Ros-" + secrets.token_urlsafe(9)
		with open(SECRETS, "a") as f:
			f.write(f"STAFF_DEMO_PASSWORD={values['STAFF_DEMO_PASSWORD']}\n")
		os.chmod(SECRETS, 0o600)
	return values["STAFF_DEMO_PASSWORD"]


def ensure_users():
	from frappe.utils.password import update_password

	pwd = _password()
	for email, first, last, roles in USERS:
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
								   "send_welcome_email": 0, "user_type": "System User"})
			user.insert(ignore_permissions=True)
			update_password(email, pwd)
		user = frappe.get_doc("User", email)
		missing = [r for r in roles if r not in {x.role for x in user.roles}]
		if missing:
			user.add_roles(*missing)
	return [u[0] for u in USERS]


def ensure_pos_profile(kitchen, cost_center, accounts, users):
	doc = frappe.get_doc("POS Profile", PROFILE) if frappe.db.exists("POS Profile", PROFILE) else frappe.new_doc("POS Profile")
	if doc.is_new():
		doc.name = PROFILE
		doc.__newname = PROFILE
	doc.update({
		"company": COMPANY, "warehouse": kitchen, "customer": WALK_IN, "selling_price_list": "Standard Selling", "currency": "PKR",
		"write_off_account": acct("Write Off"), "write_off_cost_center": cost_center, "cost_center": cost_center,
		"write_off_limit": 10, "update_stock": 1, "allow_discount_change": 1, "allow_rate_change": 0, "allow_partial_payment": 1,
		"print_receipt_on_order_complete": 0, "set_grand_total_to_default_mop": 1,
		# POS Awesome: counter sales as Sales Invoices, cash movements, returns, credit sales
		"create_pos_invoice_instead_of_sales_invoice": 0, "posa_cash_mode_of_payment": "Cash",
		"posa_enable_cash_movement": 1, "posa_allow_pos_expense": 1, "posa_allow_cash_deposit": 1,
		"posa_default_expense_account": acct("Miscellaneous Expenses"), "posa_back_office_cash_account": accounts["back_office"],
		"posa_allow_cancel_submitted_cash_movement": 1, "posa_allow_return": 1, "posa_allow_partial_payment": 1,
		"posa_allow_credit_sale": 1, "posa_allow_user_to_edit_item_discount": 1, "posa_allow_user_to_edit_additional_discount": 1,
		"posa_max_discount_allowed": 20, "posa_local_storage": 1,
	})
	have_groups = {g.item_group for g in doc.get("item_groups") or []}
	for g in ("BBQ", "Handi", "Fish", "Breakfast", "Beverages", "Sides & Add-ons"):   # the terminal's category chips
		if g not in have_groups and frappe.db.exists("Item Group", g):
			doc.append("item_groups", {"item_group": g})
	if not doc.payments:
		doc.append("payments", {"mode_of_payment": "Cash", "default": 1, "allow_in_returns": 1})
		doc.append("payments", {"mode_of_payment": "Credit Card", "allow_in_returns": 1})
	have = {u.user for u in doc.applicable_for_users}
	for u in ["Administrator", *users]:
		if u not in have:
			doc.append("applicable_for_users", {"user": u, "default": 1 if u.startswith("cashier") else 0})
	doc.flags.ignore_permissions = True
	if doc.is_new():
		doc.insert(set_name=PROFILE)
	else:
		doc.save()
	return doc.name


def ensure_branch(store, kitchen, cost_center):
	doc = frappe.get_doc("Restaurant Branch", BRANCH) if frappe.db.exists("Restaurant Branch", BRANCH) else frappe.new_doc("Restaurant Branch")
	doc.update({"branch_name": BRANCH, "company": COMPANY, "cost_center": cost_center, "store_warehouse": store,
				"kitchen_warehouse": kitchen, "phone": "+92 42 3500 0000", "address": "Main Boulevard, Gulberg III, Lahore (demo)",
				"latitude": 31.5204, "longitude": 74.3587, "delivery_radius_km": 6, "delivery_sla_minutes": 45, "prep_sla_minutes": 15})
	if not any(r.pos_profile == PROFILE for r in doc.pos_profiles):
		doc.append("pos_profiles", {"pos_profile": PROFILE, "channel": "POS"})
	doc.save(ignore_permissions=True)
	return doc.name


def ensure_settings(branch, accounts):
	"""Owner's defaults (2026-10-20): 18% sales tax on top of menu prices, Cash → Card → Bank Transfer, counter sales as
	POS Invoices, ingredients deducted in the background, Foodpanda and WhatsApp in mock mode, Gulberg the main branch."""
	s = frappe.get_single("Restaurant Settings")
	first = not s.company or not s.invoice_mode                 # new site, or settings from before these fields
	s.company = COMPANY
	s.default_branch = s.default_branch or branch
	if first:
		s.update({"invoice_mode": "POS Invoice", "apply_sales_tax": 1, "sales_tax_rate": 18,
				  "tax_included_in_price": "Tax added on top of item price", "stock_deduction_moment": "On Order Completion",
				  "run_jobs_inline": 1, "aggregator_mode": "Mock", "messaging_mode": "Mock", "kds_sound": 1})
	if not frappe.db.sql("select 1 from tabSingles where doctype = 'Restaurant Settings' and field = 'block_sold_out'"):
		s.block_sold_out = 1                                  # settings from before this option: switch it on
	if not s.aggregator_customer:
		if not frappe.db.exists("Customer", "Foodpanda"):
			frappe.get_doc({"doctype": "Customer", "customer_name": "Foodpanda", "customer_type": "Company",
							"customer_group": leaf("Customer Group", "customer_group", "Commercial"),
							"territory": leaf("Territory", "territory", "Pakistan")}).insert(ignore_permissions=True)
		s.aggregator_customer = "Foodpanda"
	if not s.fbr_mode:                                        # FBR reporting on, in Mock mode until the POS is registered
		s.update({"fbr_enabled": 1, "fbr_mode": "Mock", "fbr_service_fee": 1})
	if not s.payment_modes:
		for mode, account in (("Cash", acct("Cash")), ("Credit Card", accounts["card"]), ("Bank Transfer", accounts["bank"])):
			s.append("payment_modes", {"mode_of_payment": mode, "account": account})
	s.save(ignore_permissions=True)                           # on_update pushes tax / invoice mode / payment modes to the counters


def ensure_stock_settings():
	ss = frappe.get_single("Stock Settings")
	ss.auto_indent = 1                                        # reorder levels raise Material Requests (ERPNext daily job)
	ss.allow_negative_stock = 0
	ss.save(ignore_permissions=True)


def run():
	ensure_company()
	accounts = ensure_accounts()
	ensure_logo()
	store, kitchen = ensure_warehouses()
	cost_center = ensure_cost_center()
	ensure_customer()
	users = ensure_users()
	ensure_pos_profile(kitchen, cost_center, accounts, users)
	branch = ensure_branch(store, kitchen, cost_center)
	ensure_settings(branch, accounts)
	ensure_stock_settings()
	frappe.db.commit()
	print(f"ros-setup: {COMPANY} ({ABBR}), branch {branch}, counter {PROFILE}, warehouses {store} → {kitchen}")
