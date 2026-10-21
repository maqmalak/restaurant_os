"""`bench --site restaurant.localhost ros-setup` — company and everything a counter needs, re-run safe.

Company Saffron Grill (fictional demo restaurant, Faisalabad, PKR, fiscal year July–June) via the setup wizard on a fresh site;
warehouses Central Store → Gulberg Kitchen; cost center Gulberg; payment modes Cash / Credit Card; walk-in customer;
POS Profile "Gulberg Counter" with POS Awesome's cash movement, returns and credit sale settings; branch Gulberg;
cashier and manager users (passwords in ~/.restaurant-site-secrets, never printed).
"""

import os
import secrets

import frappe
from frappe.utils import add_days, add_months, flt, getdate, nowdate

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
	rider = _account("Rider Cash", "Cash In Hand", "Cash")       # cash on delivery until the rider hands it over
	online = _account("Online Payment Clearing", "Bank Accounts", "Bank")   # the gateway pays out from here
	mop = frappe.get_doc("Mode of Payment", "Online Payment") if frappe.db.exists("Mode of Payment", "Online Payment") else \
		frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": "Online Payment", "type": "Bank", "enabled": 1})
	if not any(a.company == COMPANY for a in mop.accounts):
		mop.append("accounts", {"company": COMPANY, "default_account": online})
	mop.save(ignore_permissions=True)
	return {"card": card, "back_office": back, "bank": bank, "rider": rider}


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


def ensure_loyalty_program(accounts):
	"""Saffron Rewards: 1 point per Rs 100 spent, 1 point = Rs 1 off, points expire after a year."""
	name = "Saffron Rewards"
	if not frappe.db.exists("Loyalty Program", name):
		expense = _account("Loyalty Points Expense", "Indirect Expenses")
		frappe.get_doc({"doctype": "Loyalty Program", "loyalty_program_name": name, "loyalty_program_type": "Single Tier Program",
						"company": COMPANY, "from_date": nowdate(), "auto_opt_in": 0, "conversion_factor": 1, "expiry_duration": 365,
						"expense_account": expense, "cost_center": acct(BRANCH),
						"collection_rules": [{"tier_name": "Member", "min_spent": 0, "collection_factor": 100}]}).insert(ignore_permissions=True)
	# named customers already on file (with a mobile) join; walk-in / Foodpanda never do
	anon = {WALK_IN, "Foodpanda"}
	for c in frappe.get_all("Customer", {"mobile_no": ["is", "set"], "loyalty_program": ["is", "not set"]}, pluck="name"):
		if c not in anon:
			frappe.db.set_value("Customer", c, "loyalty_program", name)
	return name


RIDERS = [("rider1@saffrongrill.example", "Imran", "Ali", "Motorbike", "LEA-1234"),
		  ("rider2@saffrongrill.example", "Zubair", "Khan", "Motorbike", "LEB-5678"),
		  ("rider3@saffrongrill.example", "Shahid", "Iqbal", "Bicycle", "")]


def ensure_riders(branch):
	"""Demo riders: an Employee and a login (role Delivery Rider) each, parked near the branch."""
	from frappe.utils.password import update_password

	if not frappe.db.exists("Role", "Delivery Rider"):
		frappe.get_doc({"doctype": "Role", "role_name": "Delivery Rider", "desk_access": 0}).insert(ignore_permissions=True)
	pwd = _password()
	blat, blng = frappe.db.get_value("Restaurant Branch", branch, ["latitude", "longitude"])
	for i, (email, first, last, vehicle, plate) in enumerate(RIDERS):
		if not frappe.db.exists("User", email):
			frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last, "send_welcome_email": 0,
							"user_type": "System User", "roles": [{"role": "Delivery Rider"}]}).insert(ignore_permissions=True)
			update_password(email, pwd)
		if frappe.db.exists("Rider", {"user": email}):
			continue
		employee = frappe.db.get_value("Employee", {"user_id": email}, "name")
		if not employee and frappe.db.exists("DocType", "Employee"):
			employee = frappe.get_doc({"doctype": "Employee", "first_name": first, "last_name": last, "gender": "Male",
									   "date_of_birth": "1995-01-15", "date_of_joining": "2025-01-01", "company": COMPANY,
									   "status": "Active", "user_id": email, "designation": None}).insert(ignore_permissions=True).name
		frappe.get_doc({"doctype": "Rider", "rider_name": f"{first} {last}", "employee": employee, "user": email, "branch": branch,
						"phone": f"+92 300 55500{i + 1:02d}", "vehicle": vehicle, "vehicle_number": plate, "status": "Off Duty",
						"latitude": flt(blat) + 0.003 * (i + 1), "longitude": flt(blng) - 0.002 * (i + 1)}).insert(ignore_permissions=True)


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
				"kitchen_warehouse": kitchen, "phone": "+92 41 8500 000", "address": "D-Ground, Peoples Colony No. 1, Faisalabad (demo)",
				"latitude": 31.4067, "longitude": 73.1135, "delivery_radius_km": 6, "delivery_sla_minutes": 45, "prep_sla_minutes": 15})
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
	if not frappe.db.sql("select 1 from tabSingles where doctype = 'Restaurant Settings' and field = 'discount_approval_pct'"):
		s.update({"discount_approval_pct": 10, "returns_need_approval": 1})   # manager approval (phase 11)
	if not s.delivery_fee_item:                               # online ordering defaults
		if not frappe.db.exists("Item", "Delivery Charge"):
			if not frappe.db.exists("Item Group", "Services"):
				frappe.get_doc({"doctype": "Item Group", "item_group_name": "Services", "parent_item_group": "All Item Groups"}).insert(ignore_permissions=True)
			frappe.get_doc({"doctype": "Item", "item_code": "Delivery Charge", "item_name": "Delivery Charge", "item_group": "Services",
							"stock_uom": "Nos", "is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 0,
							"description": "Delivery fee on online / phone orders"}).insert(ignore_permissions=True)
		s.update({"delivery_fee_item": "Delivery Charge", "delivery_fee": s.delivery_fee or 150, "min_order_amount": s.min_order_amount or 500,
				  "online_ordering_enabled": 1, "kiosk_enabled": 1, "kiosk_idle_seconds": s.kiosk_idle_seconds or 90})
	if not s.loyalty_program:
		s.update({"loyalty_program": ensure_loyalty_program(accounts), "online_redeem_points": 1})
	if not s.online_payment_mode:
		s.update({"online_payment_mode": "Online Payment", "online_payment_enabled": 1, "payment_gateway_mode": "Mock", "payment_gateway": "Safepay"})
	if not s.rider_float_account:
		s.update({"rider_float_account": accounts["rider"], "avg_rider_speed_kmh": s.avg_rider_speed_kmh or 20,
				  "foodpanda_delivery_by": s.foodpanda_delivery_by or "Foodpanda Rider"})
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
	ensure_riders(branch)
	ensure_stock_settings()
	from restaurant_os.api.site import ensure_defaults

	ensure_defaults()
	frappe.db.commit()
	print(f"ros-setup: {COMPANY} ({ABBR}), branch {branch}, counter {PROFILE}, warehouses {store} → {kitchen}")


# ---------------------------------------------------------------- relocate a branch (demo moved to Faisalabad, D-Ground)
FAISALABAD = {"address": "D-Ground, Peoples Colony No. 1, Faisalabad (demo)", "phone": "+92 41 8500 000", "latitude": 31.4067, "longitude": 73.1135}


def relocate_branch(branch: str = BRANCH, address: str | None = None, latitude: float | None = None, longitude: float | None = None,
					phone: str | None = None, old_city: str = "Lahore", new_city: str = "Faisalabad") -> dict:
	"""Move a branch's map point and address; riders, their GPS trail and every delivery pin of the branch move by the same
	offset (distances and routes stay as they were); ', <old_city>' in delivery addresses becomes ', <new_city>'."""
	lat = flt(latitude if latitude is not None else FAISALABAD["latitude"])
	lng = flt(longitude if longitude is not None else FAISALABAD["longitude"])
	b = frappe.get_doc("Restaurant Branch", branch)
	dlat, dlng = lat - flt(b.latitude), lng - flt(b.longitude)
	b.update({"latitude": lat, "longitude": lng, "address": address or FAISALABAD["address"], "phone": phone or FAISALABAD["phone"]})
	b.save(ignore_permissions=True)
	if abs(dlat) < 1e-9 and abs(dlng) < 1e-9:
		return {"moved": 0}
	riders = frappe.get_all("Rider", {"branch": branch}, pluck="name")
	frappe.db.sql("""update tabRider set latitude = latitude + %s, longitude = longitude + %s
		where branch = %s and latitude is not null and latitude != 0""", (dlat, dlng, branch))
	if riders:
		frappe.db.sql("""update `tabRider Location Log` set latitude = latitude + %s, longitude = longitude + %s
			where rider in %s""", (dlat, dlng, riders))
	frappe.db.sql("""update `tabRestaurant Order` set delivery_lat = delivery_lat + %s, delivery_lng = delivery_lng + %s
		where branch = %s and delivery_lat is not null and delivery_lat != 0""", (dlat, dlng, branch))
	frappe.db.sql("""update `tabRestaurant Order` set delivery_address = replace(delivery_address, %s, %s)
		where branch = %s and delivery_address like %s""", (f", {old_city}", f", {new_city}", branch, f"%, {old_city}%"))
	frappe.db.sql("""update `tabEmployee Checkin` set latitude = latitude + %s, longitude = longitude + %s
		where employee in (select employee from tabRider where branch = %s) and latitude is not null and latitude != 0""", (dlat, dlng, branch))
	frappe.db.commit()
	return {"moved": 1, "dlat": round(dlat, 5), "dlng": round(dlng, 5), "riders": len(riders)}
