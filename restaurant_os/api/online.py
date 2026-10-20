"""Online ordering site and self-order kiosk (public, rate-limited).

Web / app order: menu → cart (with add-ons) → delivery (address + pin, delivery fee, within the branch's radius) or pickup →
a Restaurant Order straight to the kitchen; cash on delivery / at pickup. The customer is found by phone or created, so
repeat diners show in Customer Insights. Prices, tax and the delivery fee are quoted with the same Sales Invoice the order
gets when delivered / collected, so the quote is the bill.

Kiosk order: the same menu, eat in / take away → a held POS sale ("Kiosk K12 · name") on the branch counter; the cashier
takes payment there, which sends it to the kitchen (POS → order). Add-ons that are items of their own (Extra Cheese, Roti)
become their own line, so their recipe is deducted too; the rest (spice level) travel as text with the dish.
"""

import json
from types import SimpleNamespace

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, nowdate

from restaurant_os.services import riders as rsvc
from restaurant_os.session import as_system


def _settings():
	return frappe.get_cached_doc("Restaurant Settings")


def _branch(branch=None):
	b = branch or _settings().default_branch
	if not b or not frappe.db.exists("Restaurant Branch", {"name": b, "disabled": 0}):
		frappe.throw(_("Branch not found."))
	return b


def _profile(branch):
	from restaurant_os.api.tables import _profile_for

	return _profile_for(branch)


def _price_list(branch):
	return _settings().online_price_list or frappe.get_cached_value("POS Profile", _profile(branch), "selling_price_list")


def _modifier_groups(item_codes):
	"""{item: [group dicts]} from Menu Modifier Groups (enabled)."""
	out = {}
	rows = frappe.db.sql("""select g.name, g.min_select, g.max_select, g.required, gi.item
		from `tabMenu Modifier Group` g join `tabMenu Modifier Group Item` gi on gi.parent = g.name
		where g.disabled = 0 and gi.item in %s order by g.name""", (list(item_codes) or [""],), as_dict=True)
	mods = {}
	for m in frappe.get_all("Menu Modifier", {"parenttype": "Menu Modifier Group"}, ["parent", "modifier_name", "price", "item", "is_default"], order_by="idx"):
		mods.setdefault(m.parent, []).append({"name": m.modifier_name, "price": flt(m.price), "item": m.item, "default": cint(m.is_default)})
	for r in rows:
		out.setdefault(r.item, []).append({"group": r.name, "min": cint(r.min_select), "max": cint(r.max_select), "required": cint(r.required),
										   "options": mods.get(r.name, [])})
	return out


# ------------------------------------------------------------------ menu
@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=60)
def menu(branch: str | None = None) -> dict:
	s = _settings()
	branch = _branch(branch)
	profile = _profile(branch)
	price_list = _price_list(branch)
	groups = [g.item_group for g in frappe.get_cached_doc("POS Profile", profile).item_groups] or \
		frappe.get_all("Item Group", {"parent_item_group": "Menu"}, pluck="name")
	items = frappe.db.sql("""select i.name as item_code, i.item_name, i.description, i.image, i.item_group, ip.price_list_rate as price
		from tabItem i join `tabItem Price` ip on ip.item_code = i.name and ip.price_list = %s and ip.selling = 1
		where i.disabled = 0 and i.is_sales_item = 1 and i.item_group in %s order by i.item_name""", (price_list, groups), as_dict=True)
	from restaurant_os.services.availability import portions

	left = portions(branch, [i.item_code for i in items])
	mods = _modifier_groups([i.item_code for i in items])
	for i in items:
		i.price = flt(i.price)
		i.sold_out = i.item_code in left and left[i.item_code] <= 0
		i.modifiers = mods.get(i.item_code, [])
		if i.description == i.item_name:
			i.description = None
	b = frappe.get_cached_doc("Restaurant Branch", branch)
	company = b.company
	tax = s.sales_tax_rate if cint(s.apply_sales_tax) else 0
	return {
		"restaurant": company, "logo": frappe.get_cached_value("Company", company, "company_logo"),
		"branch": {"name": branch, "address": b.address, "phone": b.phone, "lat": b.latitude, "lng": b.longitude,
				   "delivery_radius_km": flt(b.delivery_radius_km), "delivery_minutes": cint(b.delivery_sla_minutes), "prep_minutes": cint(b.prep_sla_minutes)},
		"branches": frappe.get_all("Restaurant Branch", {"disabled": 0}, ["name", "address"]),
		"categories": [g for g in groups if any(i.item_group == g for i in items)], "items": items,
		"open": cint(s.online_ordering_enabled), "kiosk_open": cint(s.kiosk_enabled), "kiosk_idle_seconds": cint(s.kiosk_idle_seconds) or 90,
		"delivery_fee": flt(s.delivery_fee), "min_order": flt(s.min_order_amount),
		"tax": {"rate": flt(tax), "included": s.tax_included_in_price == "Tax included in item price"},
		"currency": frappe.get_cached_value("Company", company, "default_currency"),
	}


# ------------------------------------------------------------------ cart → order lines
def _lines(branch, cart):
	"""Validate the cart (menu items, add-on rules, sold out) and turn it into order rows with prices from the price list."""
	price_list = _price_list(branch)
	cart = [c for c in cart or [] if flt(c.get("qty")) > 0]
	if not cart:
		frappe.throw(_("Your cart is empty."))
	codes = {c["item_code"] for c in cart}
	prices = dict(frappe.db.sql("select item_code, price_list_rate from `tabItem Price` where price_list = %s and selling = 1 and item_code in %s",
								(price_list, list(codes))))
	mods = _modifier_groups(codes)
	rows = []
	for c in cart:
		code, qty = c["item_code"], flt(c["qty"])
		if code not in prices or not frappe.db.get_value("Item", code, "is_sales_item"):
			frappe.throw(_("{0} is not on the menu.").format(code))
		name = frappe.get_cached_value("Item", code, "item_name")
		chosen = c.get("modifiers") or []
		text_price, text, extra = 0.0, [], []
		for g in mods.get(code, []):
			picked = [o for o in g["options"] if any(m.get("group") == g["group"] and m.get("name") == o["name"] for m in chosen)]
			if (g["required"] or g["min"]) and len(picked) < max(g["min"], 1 if g["required"] else 0):
				frappe.throw(_("Choose {0} for {1}.").format(g["group"], name))
			if g["max"] and len(picked) > g["max"]:
				frappe.throw(_("Choose at most {0} for {1} ({2}).").format(g["max"], g["group"], name))
			for o in picked:
				text.append(f"{g['group']}: {o['name']}")
				if o["item"]:
					extra.append({"item_code": o["item"], "qty": qty, "rate": flt(o["price"]), "notes": f"add-on for {name}"})
				else:
					text_price += flt(o["price"])
		rows.append({"item_code": code, "item_name": name, "qty": qty, "rate": flt(prices[code]) + text_price,
					 "notes": (c.get("notes") or "").strip()[:140] or None, "modifiers": ", ".join(text) or None})
		rows += extra
	from restaurant_os.services.availability import check

	check(branch, rows)
	return rows


def _with_fee(rows, order_type):
	s = _settings()
	if order_type == "Delivery" and flt(s.delivery_fee) > 0 and s.delivery_fee_item:
		rows = rows + [{"item_code": s.delivery_fee_item, "item_name": "Delivery Charge", "qty": 1, "rate": flt(s.delivery_fee)}]
	return rows


def _bill(branch, rows, customer, channel="Web"):
	"""Totals exactly as the order will be invoiced (the delivery service's Sales Invoice, unsaved)."""
	from restaurant_os.services.delivery import build_sales_invoice

	# a plain object: on a frappe._dict, `.items` would be the dict method, not the order lines
	order = SimpleNamespace(name=None, order_no=None, channel=channel, branch=branch, customer=customer, customer_name=None,
							external_order_id=None, company=frappe.get_cached_value("Restaurant Branch", branch, "company"),
							items=[frappe._dict({**r, "kds_status": "Queued"}) for r in rows])
	with as_system():
		si = build_sales_invoice(order)
	return {"subtotal": flt(si.net_total), "tax": flt(si.total_taxes_and_charges), "total": flt(si.rounded_total or si.grand_total),
			"taxes": [{"description": t.description, "amount": flt(t.tax_amount)} for t in si.taxes]}


def _walk_in(branch):
	return frappe.get_cached_value("POS Profile", _profile(branch), "customer")


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=60, seconds=60)
def quote(data: str) -> dict:
	d = json.loads(data)
	branch = _branch(d.get("branch"))
	order_type = "Delivery" if d.get("order_type") == "Delivery" else "Pickup"
	rows = _with_fee(_lines(branch, d.get("items")), order_type)
	out = _bill(branch, rows, _walk_in(branch))
	if order_type == "Delivery" and d.get("lat") and d.get("lng"):
		blat, blng = rsvc.branch_point(branch)
		out["distance_km"] = round(rsvc.km(blat, blng, d["lat"], d["lng"]), 2)
	return {**out, "lines": rows, "min_order": flt(_settings().min_order_amount)}


def _customer(name, phone):
	phone = (phone or "").strip()
	if len("".join(ch for ch in phone if ch.isdigit())) < 10:
		frappe.throw(_("Enter a valid mobile number."))
	existing = frappe.db.get_value("Customer", {"mobile_no": phone, "disabled": 0}, "name")
	if existing:
		return existing
	from restaurant_os.setup.masters import leaf

	with as_system():
		doc = frappe.get_doc({"doctype": "Customer", "customer_name": (name or "Online customer").strip()[:140], "customer_type": "Individual",
							  "customer_group": leaf("Customer Group", "customer_group", "Individual"),
							  "territory": leaf("Territory", "territory", "Pakistan"), "mobile_no": phone}).insert(ignore_permissions=True)
	return doc.name


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=60)
def place_order(data: str) -> dict:
	"""Online order → kitchen. Idempotent on the client's order UUID (a double tap or a retry is one order)."""
	from restaurant_os.services.orders import create_order

	s = _settings()
	if not cint(s.online_ordering_enabled):
		frappe.throw(_("Online ordering is closed right now."))
	d = json.loads(data)
	uuid = (d.get("client_order_uuid") or "").strip()[:64] or None
	if uuid and (done := frappe.db.get_value("Restaurant Order", {"client_order_uuid": f"web:{uuid}"}, ["name", "order_no", "tracking_key"], as_dict=True)):
		return {"order": done.name, "order_no": done.order_no, "tracking_key": done.tracking_key, "duplicate": 1}
	branch = _branch(d.get("branch"))
	order_type = "Delivery" if d.get("order_type") == "Delivery" else "Pickup"
	name = (d.get("customer_name") or "").strip()
	if not name:
		frappe.throw(_("Enter your name."))
	lat, lng = flt(d.get("lat")), flt(d.get("lng"))
	if order_type == "Delivery":
		if not (d.get("address") or "").strip():
			frappe.throw(_("Enter the delivery address."))
		if lat and lng:
			blat, blng = rsvc.branch_point(branch)
			radius = flt(frappe.get_cached_value("Restaurant Branch", branch, "delivery_radius_km"))
			if radius and rsvc.km(blat, blng, lat, lng) > radius:
				frappe.throw(_("Sorry — that address is outside our {0} km delivery area. Choose pickup instead.").format(radius))
	rows = _lines(branch, d.get("items"))
	if sum(flt(r["qty"]) * flt(r["rate"]) for r in rows) < flt(s.min_order_amount):
		frappe.throw(_("The minimum order is {0}.").format(frappe.format_value(s.min_order_amount, "Currency")))
	rows = _with_fee(rows, order_type)
	customer = _customer(name, d.get("phone"))
	bill = _bill(branch, rows, customer)
	channel = "App" if d.get("source") == "app" else "Web"
	with as_system():
		order = create_order(branch, rows, channel=channel, order_type=order_type, customer=customer, customer_name=name,
							 notes=(d.get("notes") or "").strip()[:500] or None, client_order_uuid=f"web:{uuid}" if uuid else None,
							 grand_total=bill["total"],
							 delivery={"delivery_phone": d.get("phone"), "delivery_address": (d.get("address") or "").strip() or None,
									   "delivery_lat": lat or None, "delivery_lng": lng or None,
									   "cod_amount": bill["total"] if order_type == "Delivery" else 0})
		if not order.tracking_key:                            # pickup orders get a tracking link too
			order.db_set("tracking_key", frappe.generate_hash(length=12))
	return {"order": order.name, "order_no": order.order_no, "tracking_key": frappe.db.get_value("Restaurant Order", order.name, "tracking_key"),
			"total": bill["total"]}


# ------------------------------------------------------------------ kiosk
@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=60, seconds=60)
def kiosk_quote(data: str) -> dict:
	from restaurant_os.api import pos

	d = json.loads(data)
	branch = _branch(d.get("branch"))
	rows = _lines(branch, d.get("items"))
	with as_system():
		p = pos.preview(json.dumps({"pos_profile": _profile(branch), "customer": _walk_in(branch),
									"items": [{"item_code": r["item_code"], "qty": r["qty"], "rate": r["rate"]} for r in rows]}))
	return {"subtotal": flt(p["net_total"]), "tax": flt(p["total_taxes_and_charges"]), "total": flt(p["rounded_total"]),
			"discount": flt(p["discount_amount"]), "offers": p.get("offers") or []}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=20, seconds=60)
def kiosk_order(data: str) -> dict:
	"""Kiosk → a held POS sale on the branch counter, paid at the counter (which sends it to the kitchen)."""
	from restaurant_os.api import pos

	if not cint(_settings().kiosk_enabled):
		frappe.throw(_("The kiosk is closed."))
	d = json.loads(data)
	branch = _branch(d.get("branch"))
	rows = _lines(branch, d.get("items"))
	eat = "Eat in" if d.get("order_type") == "Dine-in" else "Take away"
	profile = _profile(branch)
	n = frappe.db.count(pos._dt(profile), {"remarks": ["like", "Kiosk K%"], "creation": [">=", nowdate()]}) + 1
	label = f"Kiosk K{n} · {(d.get('name') or '').strip()[:40] or 'Guest'} · {eat}"
	with as_system():
		res = pos.submit_invoice(json.dumps({
			"pos_profile": profile, "customer": _walk_in(branch), "hold": 1, "remarks": label,
			"items": [{"item_code": r["item_code"], "qty": r["qty"], "rate": r["rate"],
					   "notes": " · ".join(x for x in (r.get("modifiers"), r.get("notes")) if x) or None} for r in rows]}))
	frappe.publish_realtime("ros_kiosk", {"branch": branch, "number": f"K{n}", "invoice": res["name"]}, after_commit=True)
	return {"number": f"K{n}", "total": res.get("grand_total"), "invoice": res["name"]}
