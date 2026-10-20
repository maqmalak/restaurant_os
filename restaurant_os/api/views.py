"""Read models for the card views of the restaurant masters (one call per page, permission-checked)."""

import frappe
from frappe import _
from frappe.utils import cint, flt


def _need(doctype):
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted to view {0}.").format(_(doctype)), frappe.PermissionError)


@frappe.whitelist()
def floor_areas() -> list:
	"""Each floor area with its tables, live status and the running total of open sittings."""
	_need("Floor Area")
	areas = frappe.get_all("Floor Area", fields=["name", "area_name", "branch", "modified"], order_by="branch, area_name")
	tables = frappe.get_all("Restaurant Table", filters={"disabled": 0},
							fields=["name", "table_number", "floor_area", "seats", "status", "guests", "shape", "seated_at", "current_order"],
							order_by="table_number")
	open_orders = [t.current_order for t in tables if t.current_order]
	totals = dict(frappe.get_all("Restaurant Order", filters={"name": ["in", open_orders or [""]]}, fields=["name", "grand_total"], as_list=True))
	for a in areas:
		a.tables = [t for t in tables if t.floor_area == a.name]
		for t in a.tables:
			t.seated_at = str(t.seated_at) if t.seated_at else None
			t.total = flt(totals.get(t.current_order))
		a.seats = sum(cint(t.seats) for t in a.tables)
		a.occupied = sum(1 for t in a.tables if t.status == "Occupied")
		a.guests = sum(cint(t.guests) for t in a.tables if t.status == "Occupied")
		a.open_total = sum(t.total for t in a.tables)
	return areas


@frappe.whitelist()
def modifier_groups() -> list:
	"""Each modifier group with its choices and the dishes that offer it (with photos)."""
	_need("Menu Modifier Group")
	groups = frappe.get_all("Menu Modifier Group", fields=["name", "group_name", "min_select", "max_select", "required", "disabled", "modified"],
							order_by="disabled, group_name")
	names = [g.name for g in groups] or [""]
	mods = frappe.get_all("Menu Modifier", filters={"parent": ["in", names], "parenttype": "Menu Modifier Group"},
						  fields=["parent", "modifier_name", "price", "item", "is_default", "idx"], order_by="idx")
	items = frappe.get_all("Menu Modifier Group Item", filters={"parent": ["in", names], "parenttype": "Menu Modifier Group"},
						   fields=["parent", "item", "item_name", "idx"], order_by="idx")
	images = dict(frappe.get_all("Item", filters={"name": ["in", list({i.item for i in items}) or [""]]}, fields=["name", "image"], as_list=True))
	for g in groups:
		g.modifiers = [{"name": m.modifier_name, "price": flt(m.price), "item": m.item, "is_default": cint(m.is_default)} for m in mods if m.parent == g.name]
		g.items = [{"item": i.item, "item_name": i.item_name or i.item, "image": images.get(i.item)} for i in items if i.parent == g.name]
	return groups


@frappe.whitelist()
def riders() -> list:
	"""Riders with photo, duty status, today's deliveries, active jobs, average delivery time and cash in hand."""
	_need("Rider")
	from frappe.utils import nowdate

	rows = frappe.get_all("Rider", fields=["name", "rider_name", "photo", "employee", "phone", "branch", "vehicle", "vehicle_number",
										   "status", "last_seen", "cash_in_hand", "disabled"], order_by="disabled, rider_name")
	emp_img = dict(frappe.get_all("Employee", filters={"name": ["in", [r.employee for r in rows if r.employee] or [""]]},
								  fields=["name", "image"], as_list=True))
	today = frappe.db.sql("""select rider, count(*), avg(nullif(delivery_minutes, 0)), sum(cash_collected) from `tabDelivery Assignment`
		where status = 'Delivered' and date(delivered_at) = %s group by rider""", nowdate())
	stats = {r[0]: r[1:] for r in today}
	active = dict(frappe.db.sql("""select rider, count(*) from `tabDelivery Assignment` where status in ('Accepted', 'Picked Up') group by rider"""))
	for r in rows:
		r.photo = r.photo or emp_img.get(r.employee)
		n, avg, cash = stats.get(r.name, (0, None, 0))
		r.delivered_today, r.avg_minutes, r.cash_today = cint(n), round(flt(avg)) if avg else None, flt(cash)
		r.active = cint(active.get(r.name))
		r.last_seen = str(r.last_seen) if r.last_seen else None
		r.cash_in_hand = flt(r.cash_in_hand)
		duty = frappe.db.get_value("Employee Checkin", {"employee": r.employee, "log_type": "IN"}, "time", order_by="time desc") if r.employee else None
		r.on_duty_since = str(duty) if duty and r.status != "Off Duty" else None
	return rows


@frappe.whitelist()
def stations() -> list:
	"""Kitchen stations with what they cook (groups + dishes) and their live load on the KDS."""
	_need("Kitchen Station")
	rows = frappe.get_all("Kitchen Station", fields=["name", "station_name", "branch", "color", "printer", "disabled"], order_by="disabled, station_name")
	names = [r.name for r in rows] or [""]
	groups = frappe.get_all("Kitchen Station Item Group", filters={"parent": ["in", names], "parenttype": "Kitchen Station"}, fields=["parent", "item_group"])
	items = frappe.get_all("Kitchen Station Item", filters={"parent": ["in", names], "parenttype": "Kitchen Station"}, fields=["parent", "item", "item_name"])
	load = frappe.db.sql("""select it.station, it.kds_status, count(*) from `tabRestaurant Order Item` it
		join `tabRestaurant Order` o on o.name = it.parent and it.parenttype = 'Restaurant Order'
		where o.status in ('Placed', 'Accepted', 'Preparing', 'Ready') and it.kds_status in ('Queued', 'Preparing', 'Ready')
		group by it.station, it.kds_status""")
	ld = {}
	for st, ks, n in load:
		ld.setdefault(st, {})[ks] = cint(n)
	for r in rows:
		r.item_groups = [g.item_group for g in groups if g.parent == r.name]
		dishes = frappe.get_all("Item", filters={"item_group": ["in", r.item_groups or [""]], "disabled": 0, "is_sales_item": 1}, fields=["name", "item_name", "image"], limit=60)
		extra = [i for i in items if i.parent == r.name]
		have = {d.name for d in dishes}
		for i in extra:
			if i.item not in have:
				dishes.append(frappe._dict(name=i.item, item_name=i.item_name or i.item, image=frappe.get_cached_value("Item", i.item, "image")))
		r.dishes = [{"item": d.name, "item_name": d.item_name, "image": d.image} for d in dishes]
		l = ld.get(r.name, {})
		r.queued, r.preparing, r.ready = l.get("Queued", 0), l.get("Preparing", 0), l.get("Ready", 0)
	return rows
