"""Dine-in table map: seat guests, send rounds to the kitchen, view the bill, settle, move, end the sitting.

A sitting is the table's `current_order` (Restaurant Order, order type Dine-in). Each "send" appends a new kitchen round
(the KDS shows "+ New Items" apart from what was already ordered). Settling posts the invoice through the POS backend
(POS Awesome shift, offers, payments) for the order's lines; ending the sitting frees the table.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, now_datetime

from restaurant_os.api import pos
from restaurant_os.services import orders as svc


def _check(write=False):
	if not frappe.has_permission("Restaurant Order", "write" if write else "read"):
		frappe.throw(_("Not permitted."), frappe.PermissionError)


def _table(name):
	t = frappe.get_doc("Restaurant Table", name)
	t.flags.ignore_permissions = True
	return t


def _profile_for(branch):
	"""The branch's counter used to price and settle dine-in orders (Dine-in channel first)."""
	rows = frappe.get_all("Restaurant Branch POS Profile", {"parent": branch, "parenttype": "Restaurant Branch"}, ["pos_profile", "channel"], order_by="idx")
	pick = next((r.pos_profile for r in rows if r.channel == "Dine-in"), None) or (rows[0].pos_profile if rows else None)
	if not pick:
		frappe.throw(_("Link a POS Profile to branch {0} first.").format(branch))
	return pick


def _price(item_code, price_list):
	return flt(frappe.db.get_value("Item Price", {"item_code": item_code, "price_list": price_list, "selling": 1}, "price_list_rate"))


@frappe.whitelist()
def floor(branch: str | None = None) -> dict:
	_check()
	branch = branch or svc.settings().default_branch
	tables = frappe.get_all("Restaurant Table", {"branch": branch, "disabled": 0},
							["name", "table_number", "floor_area", "seats", "shape", "pos_x", "pos_y", "status", "guests", "seated_at", "current_order"],
							order_by="floor_area, pos_y, pos_x")
	orders = {o.name: o for o in frappe.get_all("Restaurant Order", {"name": ["in", [t.current_order for t in tables if t.current_order] or [""]]},
											   ["name", "order_no", "status", "grand_total", "invoice", "placed_at"])}
	for t in tables:
		o = orders.get(t.current_order)
		t.order = {"name": o.name, "order_no": o.order_no, "status": o.status, "total": flt(o.grand_total), "settled": bool(o.invoice),
				   "placed_at": str(o.placed_at)} if o else None
	areas = frappe.get_all("Floor Area", {"branch": branch}, ["name", "area_name"], order_by="area_name")
	busy = [t for t in tables if t.status == "Occupied"]
	return {"branch": branch, "branches": frappe.get_all("Restaurant Branch", {"disabled": 0}, pluck="name"), "areas": areas,
			"tables": tables, "now": str(now_datetime()), "occupied": len(busy), "guests": sum(cint(t.guests) for t in busy),
			"pos_profile": _profile_for(branch) if branch else None,
			"price_list": frappe.get_cached_value("POS Profile", _profile_for(branch), "selling_price_list") if branch else None}


@frappe.whitelist(methods=["POST"])
def seat(table: str, guests: int = 2) -> dict:
	_check(True)
	t = _table(table)
	if t.status == "Occupied":
		frappe.throw(_("Table {0} is already seated.").format(t.table_number))
	t.update({"status": "Occupied", "guests": cint(guests) or 1, "seated_at": now_datetime(), "current_order": None})
	t.save()
	frappe.publish_realtime("ros_tables", {"table": t.name, "branch": t.branch}, after_commit=True)
	return {"table": t.name}


@frappe.whitelist(methods=["POST"])
def send(table: str, items: str, notes: str | None = None) -> dict:
	"""Send a round to the kitchen: the first round opens the sitting's order, later rounds are appended to it."""
	_check(True)
	t = _table(table)
	lines = [i for i in json.loads(items) if flt(i.get("qty")) > 0]
	if not lines:
		frappe.throw(_("Add at least one item."))
	from restaurant_os.services.availability import check

	check(t.branch, lines)
	price_list = frappe.get_cached_value("POS Profile", _profile_for(t.branch), "selling_price_list")
	rows = [{"item_code": i["item_code"], "item_name": frappe.get_cached_value("Item", i["item_code"], "item_name"), "qty": flt(i["qty"]),
			 "uom": frappe.get_cached_value("Item", i["item_code"], "stock_uom"), "rate": _price(i["item_code"], price_list),
			 "notes": i.get("notes")} for i in lines]
	if t.status != "Occupied":
		t.update({"status": "Occupied", "guests": t.guests or 2, "seated_at": now_datetime()})
	if t.current_order and frappe.db.get_value("Restaurant Order", t.current_order, "invoice"):
		frappe.throw(_("Table {0} is already settled — end the sitting first.").format(t.table_number))
	if not t.current_order:
		walk_in = frappe.get_cached_value("POS Profile", _profile_for(t.branch), "customer")
		order = svc.create_order(t.branch, [{**r, "kitchen_round": 1} for r in rows], channel="Dine-in", order_type="Dine-in",
								 customer=walk_in, table=t.name, notes=notes)
		order.db_set("guests", t.guests)
		t.current_order = order.name
	else:
		from restaurant_os.restaurant_os.doctype.kitchen_station.kitchen_station import station_for_item

		order = frappe.get_doc("Restaurant Order", t.current_order)
		order.flags.ignore_permissions = True
		rnd = max(int(r.kitchen_round or 1) for r in order.items) + 1
		for r in rows:
			station = station_for_item(t.branch, r["item_code"])
			order.append("items", {**r, "kitchen_round": rnd, "station": station, "kds_status": "Queued" if station else "Ready"})
		if notes:
			order.notes = "\n".join(x for x in (order.notes, notes) if x)
		order.grand_total = sum(flt(r.qty) * flt(r.rate) for r in order.items if r.kds_status != "Void")
		if order.status in svc.DONE or order.status == "Ready":
			order.status = "Accepted"                         # a new round goes back to the kitchen
		svc.refresh_status(order)
		order.save()
		svc.publish(order, "new")
	t.save()
	frappe.publish_realtime("ros_tables", {"table": t.name, "branch": t.branch}, after_commit=True)
	return {"order": order.name, "order_no": order.order_no}


@frappe.whitelist()
def view(table: str) -> dict:
	"""The sitting's order by round, with the bill totals as the counter would charge them (offers, tax)."""
	_check()
	t = frappe.get_doc("Restaurant Table", table)
	if not t.current_order:
		return {"table": t.name, "order": None}
	o = frappe.get_doc("Restaurant Order", t.current_order)
	live = [r for r in o.items if r.kds_status != "Void"]
	bill = None
	if live:
		bill = pos.preview(json.dumps({"pos_profile": _profile_for(t.branch), "customer": o.customer,
									   "items": [{"item_code": r.item_code, "qty": r.qty} for r in live]}))
	return {"table": t.name, "table_number": t.table_number, "guests": t.guests, "seated_at": str(t.seated_at),
			"order": {"name": o.name, "order_no": o.order_no, "status": o.status, "invoice": o.invoice, "invoice_doctype": o.invoice_doctype,
					  "items": [{"item_name": r.item_name, "qty": r.qty, "rate": r.rate, "amount": flt(r.qty) * flt(r.rate), "round": r.kitchen_round,
								 "status": r.kds_status, "notes": r.notes} for r in live]},
			"bill": bill, "pos_profile": _profile_for(t.branch)}


@frappe.whitelist(methods=["POST"])
def settle(table: str, payments: str, customer: str | None = None, coupon_code: str | None = None) -> dict:
	"""Take payment for the sitting: posts the invoice (POS Awesome shift, offers, tax) for the order's lines."""
	_check(True)
	t = frappe.get_doc("Restaurant Table", table)
	if not t.current_order:
		frappe.throw(_("Nothing ordered on table {0}.").format(t.table_number))
	o = frappe.get_doc("Restaurant Order", t.current_order)
	if o.invoice:
		frappe.throw(_("Table {0} is already settled ({1}).").format(t.table_number, o.invoice))
	live = [r for r in o.items if r.kds_status != "Void"]
	res = pos.submit_invoice(json.dumps({
		"pos_profile": _profile_for(t.branch), "customer": customer or o.customer, "coupon_code": coupon_code,
		"items": [{"item_code": r.item_code, "qty": r.qty, "notes": r.notes} for r in live],
		"payments": json.loads(payments), "remarks": f"Table {t.table_number} · order #{o.order_no}", "restaurant_order": o.name,
	}))
	frappe.publish_realtime("ros_tables", {"table": t.name, "branch": t.branch}, after_commit=True)
	return res


@frappe.whitelist(methods=["POST"])
def move(table: str, to_table: str) -> dict:
	_check(True)
	src, dst = _table(table), _table(to_table)
	if dst.status == "Occupied":
		frappe.throw(_("Table {0} is occupied.").format(dst.table_number))
	if src.branch != dst.branch:
		frappe.throw(_("Tables must be in the same branch."))
	dst.update({"status": "Occupied", "guests": src.guests, "seated_at": src.seated_at, "current_order": src.current_order})
	dst.save()
	if src.current_order:
		frappe.db.set_value("Restaurant Order", src.current_order, "table", dst.name)
	src.update({"status": "Free", "guests": 0, "seated_at": None, "current_order": None})
	src.save()
	frappe.publish_realtime("ros_tables", {"table": dst.name, "branch": dst.branch}, after_commit=True)
	return {"table": dst.name}


@frappe.whitelist(methods=["POST"])
def end_sitting(table: str) -> dict:
	"""Free the table. A sitting with food on it must be settled first; its order is then completed."""
	_check(True)
	t = _table(table)
	if t.current_order:
		o = frappe.get_doc("Restaurant Order", t.current_order)
		o.flags.ignore_permissions = True
		live = [r for r in o.items if r.kds_status != "Void"]
		if live and not o.invoice:
			frappe.throw(_("Settle table {0} before ending the sitting.").format(t.table_number))
		if o.status not in svc.DONE and o.status not in ("Cancelled", "Rejected"):
			for r in live:
				r.kds_status = "Served"
			svc.set_status(o, "Completed")
	t.update({"status": "Free", "guests": 0, "seated_at": None, "current_order": None})
	t.save()
	frappe.publish_realtime("ros_tables", {"table": t.name, "branch": t.branch}, after_commit=True)
	return {"table": t.name}
