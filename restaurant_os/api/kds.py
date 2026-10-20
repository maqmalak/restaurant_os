"""Kitchen Display: a status board of Restaurant Orders (Placed → Preparing → Ready → Completed), filterable by station.

One tap on a card's footer moves the whole card on (for the chosen station only, when filtered); one tap on a line bumps
that line. Every change is published as `ros_kds` over Socket.IO so all screens update at once.
"""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, now_datetime, nowdate

from restaurant_os.services import orders as svc

COLUMNS = {"Placed": ("Placed", "Accepted"), "Preparing": ("Preparing",), "Ready": ("Ready",),
		   "Completed": ("Completed", "Picked Up", "Out for Delivery", "Delivered")}


def _check():
	if not frappe.has_permission("Restaurant Order", "read"):
		frappe.throw(_("Not permitted to use the kitchen display."), frappe.PermissionError)


def _branch(branch=None):
	return branch or svc.settings().default_branch or frappe.db.get_value("Restaurant Branch", {"disabled": 0}, "name")


def _column(status):
	return next((c for c, sts in COLUMNS.items() if status in sts), None)


def _card(o, rows, station, images, station_names):
	lines = [r for r in rows if r.parent == o.name and r.kds_status != "Void" and (not station or r.station == station)]
	if not lines:
		return None
	latest = max(int(r.kitchen_round or 1) for r in lines)
	done = sum(1 for r in lines if r.kds_status in ("Ready", "Served"))
	return {
		"name": o.name, "order_no": o.order_no, "status": o.status, "column": _column(o.status), "channel": o.channel,
		"order_type": o.order_type, "table": o.table, "table_label": frappe.get_cached_value("Restaurant Table", o.table, "table_number") if o.table else None,
		"guests": o.guests, "customer_name": o.customer_name, "notes": o.notes, "priority": o.priority, "invoice": o.invoice,
		"created": str(o.placed_at or o.creation), "updated": str(o.modified), "grand_total": o.grand_total,
		"progress": round(done / len(lines) * 100), "latest_round": latest, "stock_status": o.stock_status,
		"items": [{"row": r.name, "item_code": r.item_code, "item_name": r.item_name, "qty": r.qty, "uom": r.uom, "notes": r.notes,
				   "modifiers": r.modifiers, "status": r.kds_status, "round": int(r.kitchen_round or 1), "station": r.station,
				   "station_name": station_names.get(r.station), "image": images.get(r.item_code)} for r in sorted(lines, key=lambda r: r.idx)],
	}


@frappe.whitelist()
def board(branch: str | None = None, station: str | None = None, past: int = 0) -> dict:
	"""Cards per column: open orders, plus today's completed ones (`past` = 1: the last 7 days of completed)."""
	_check()
	branch = _branch(branch)
	s = svc.settings()
	since = add_days(nowdate(), -7 if cint(past) else 0)
	open_orders = frappe.get_all("Restaurant Order", {"branch": branch, "status": ["in", list(svc.OPEN)], "docstatus": 0},
								 ["*"], order_by="priority desc, placed_at asc", limit=200)
	done = frappe.get_all("Restaurant Order", {"branch": branch, "status": ["in", list(COLUMNS["Completed"])], "modified": [">=", since]},
						  ["*"], order_by="modified desc", limit=60 if not cint(past) else 200)
	allo = open_orders + done
	names = [o.name for o in allo] or [""]
	rows = frappe.get_all("Restaurant Order Item", {"parent": ["in", names], "parenttype": "Restaurant Order"}, ["*"], order_by="idx")
	images = dict(frappe.get_all("Item", {"name": ["in", list({r.item_code for r in rows}) or [""]]}, ["name", "image"], as_list=True))
	stations = frappe.get_all("Kitchen Station", {"branch": branch, "disabled": 0}, ["name", "station_name", "color"], order_by="station_name")
	station_names = {st.name: st.station_name for st in stations}
	cards = [c for c in (_card(o, rows, station, images, station_names) for o in allo) if c]
	all_day = {}
	for c in cards:
		if c["column"] in ("Placed", "Preparing"):
			for it in c["items"]:
				if it["status"] in ("Queued", "Preparing"):
					all_day[it["item_name"]] = all_day.get(it["item_name"], 0) + it["qty"]
	return {
		"branch": branch, "branches": frappe.get_all("Restaurant Branch", {"disabled": 0}, pluck="name"), "stations": stations,
		"settings": {"amber": cint(s.kds_amber_minutes) or 8, "red": cint(s.kds_red_minutes) or 15, "sound": cint(s.kds_sound)},
		"now": str(now_datetime()), "cards": cards,
		"counts": {col: sum(1 for c in cards if c["column"] == col) for col in COLUMNS},
		"all_day": sorted(({"item": k, "qty": v} for k, v in all_day.items()), key=lambda x: -x["qty"]),
	}


def _order(name):
	doc = frappe.get_doc("Restaurant Order", name)
	doc.flags.ignore_permissions = True
	return doc


def _rows(doc, station=None):
	return [r for r in doc.items if r.kds_status != "Void" and (not station or r.station == station)]


@frappe.whitelist(methods=["POST"])
def advance(order: str, station: str | None = None) -> dict:
	"""The card's footer button: Placed → start cooking, Preparing → all ready, Ready → served / handed over."""
	_check()
	doc = _order(order)
	col = _column(doc.status)
	now = now_datetime()
	if col == "Placed":
		for r in _rows(doc, station):
			if r.kds_status == "Queued":
				r.kds_status, r.started_at = "Preparing", now
	elif col == "Preparing":
		for r in _rows(doc, station):
			if r.kds_status in ("Queued", "Preparing"):
				r.kds_status, r.ready_at = "Ready", now
				r.started_at = r.started_at or now
	elif col == "Ready":
		for r in _rows(doc):
			if r.kds_status != "Void":
				r.kds_status = "Served"
		svc.set_status(doc, "Picked Up" if doc.order_type == "Delivery" else "Completed", save=False)
		doc.save()
		return {"status": doc.status}
	else:
		frappe.throw(_("Order {0} is already {1}.").format(doc.order_no, doc.status))
	svc.refresh_status(doc)
	doc.save()
	svc.publish(doc)
	return {"status": doc.status}


@frappe.whitelist(methods=["POST"])
def bump_item(order: str, row: str) -> dict:
	"""Tap a line: Queued / Preparing → Ready, Ready → back to Preparing."""
	_check()
	doc = _order(order)
	r = next((x for x in doc.items if x.name == row), None)
	if not r:
		frappe.throw(_("Line not found."))
	now = now_datetime()
	if r.kds_status in ("Queued", "Preparing"):
		r.kds_status, r.ready_at = "Ready", now
		r.started_at = r.started_at or now
	elif r.kds_status == "Ready":
		r.kds_status, r.ready_at = "Preparing", None
	svc.refresh_status(doc)
	doc.save()
	svc.publish(doc)
	return {"status": doc.status, "line": r.kds_status}


@frappe.whitelist(methods=["POST"])
def recall(order: str) -> dict:
	"""Bring a ready / completed card back to Preparing (e.g. sent out too early)."""
	_check()
	doc = _order(order)
	for r in _rows(doc):
		if r.kds_status in ("Ready", "Served"):
			r.kds_status = "Preparing"
	doc.status = "Preparing"
	doc.save()
	svc.publish(doc)
	return {"status": doc.status}


@frappe.whitelist()
def ticket(order: str) -> dict:
	"""Everything a fallback paper ticket prints."""
	_check()
	doc = frappe.get_doc("Restaurant Order", order)
	return {"name": doc.name, "order_no": doc.order_no, "order_type": doc.order_type, "channel": doc.channel, "table": doc.table,
			"customer_name": doc.customer_name, "notes": doc.notes, "placed_at": str(doc.placed_at),
			"items": [{"item_name": r.item_name, "qty": r.qty, "notes": r.notes, "round": r.kitchen_round, "station": r.station}
					  for r in doc.items if r.kds_status != "Void"]}
