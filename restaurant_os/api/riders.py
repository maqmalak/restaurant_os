"""Rider app, dispatch board and the customer's tracking page.

Rider app (signed-in rider): me, set_duty, accept, reject, pickup, deliver, location.
Dispatch (restaurant staff): dispatch, assign, handover, new_delivery_order, simulate_delivery_order.
Customer (guest, rate-limited): track(key).
"""

import json
import random

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, flt, now_datetime, time_diff_in_seconds

from restaurant_os.services import riders as svc

DROPS = ["Main Market, Gulberg II", "MM Alam Road, Gulberg III", "Liberty Market", "Model Town Link Road", "Garden Town",
		 "Faisal Town, Block A", "Johar Town, Block H", "Cavalry Ground", "Shadman Colony", "DHA Phase 3, Y Block"]


def random_drop(branch):
	"""A plausible delivery address within ~3 km of the branch (simulators)."""
	blat, blng = svc.branch_point(branch)
	return {"text": f"House {random.randint(1, 250)}, {random.choice(DROPS)}, Lahore",
			"latitude": round(blat + random.uniform(-0.025, 0.025), 6), "longitude": round(blng + random.uniform(-0.025, 0.025), 6)}


def _staff():
	if not frappe.has_permission("Restaurant Order", "write"):
		frappe.throw(_("Not permitted."), frappe.PermissionError)


# ------------------------------------------------------------------ rider app
def _card(da):
	o = frappe.get_doc("Restaurant Order", da.order)
	return {"assignment": da.name, "status": da.status, "order": o.name, "order_no": o.order_no, "order_status": o.status, "channel": o.channel,
			"customer_name": o.customer_name, "phone": o.delivery_phone, "address": o.delivery_address, "lat": o.delivery_lat, "lng": o.delivery_lng,
			"cod_amount": flt(o.cod_amount), "distance_km": flt(o.distance_km), "notes": o.notes, "invoice": o.invoice,
			"items": [{"item_name": r.item_name, "qty": r.qty} for r in o.items if r.kds_status != "Void"],
			"offered_at": str(da.offered_at or ""), "cash_collected": flt(da.cash_collected)}


@frappe.whitelist()
def me() -> dict:
	r = svc.my_rider()
	blat, blng = svc.branch_point(r.branch)
	mine = frappe.get_all("Delivery Assignment", {"rider": r.name, "status": ["in", list(svc.ACTIVE)]}, ["*"], order_by="creation")
	done = frappe.get_all("Delivery Assignment", {"rider": r.name, "status": "Delivered", "delivered_at": [">=", frappe.utils.nowdate()]}, ["*"],
						  order_by="delivered_at desc")
	return {"rider": {"name": r.name, "rider_name": r.rider_name, "status": r.status, "branch": r.branch, "vehicle": r.vehicle,
					  "cash_in_hand": flt(r.cash_in_hand)},
			"branch": {"name": r.branch, "lat": blat, "lng": blng, "address": frappe.get_cached_value("Restaurant Branch", r.branch, "address")},
			"ping_seconds": cint(svc.settings().rider_ping_seconds) or 15, "require_otp": cint(svc.settings().require_delivery_otp),
			"offers": [_card(d) for d in mine if d.status == "Offered"], "active": [_card(d) for d in mine if d.status != "Offered"],
			"done": [_card(d) for d in done]}


@frappe.whitelist(methods=["POST"])
def set_duty(on: int, lat: float | None = None, lng: float | None = None) -> dict:
	"""On / off duty = HR check-in / check-out (Employee Checkin) at the phone's position."""
	svc.set_duty(svc.my_rider(), on, lat, lng)
	return me()


@frappe.whitelist(methods=["POST"])
def accept(assignment: str) -> dict:
	svc.accept(svc.my_rider(), assignment)
	return me()


@frappe.whitelist(methods=["POST"])
def reject(assignment: str, reason: str | None = None) -> dict:
	svc.reject(svc.my_rider(), assignment, reason)
	return me()


@frappe.whitelist(methods=["POST"])
def pickup(assignment: str) -> dict:
	svc.pickup(svc.my_rider(), assignment)
	return me()


@frappe.whitelist(methods=["POST"])
def deliver(assignment: str, otp: str | None = None, photo: str | None = None, cash: float = 0) -> dict:
	invoice = svc.deliver(svc.my_rider(), assignment, otp=otp, photo=photo, cash=cash)
	return {**me(), "invoice": invoice}


@frappe.whitelist(methods=["POST"])
def location(lat: float, lng: float, accuracy: float | None = None, speed: float | None = None) -> dict:
	r = svc.my_rider()
	if r.status == "Off Duty":
		return {"ok": 0}
	svc.record_location(r, lat, lng, accuracy, speed)
	return {"ok": 1}


# ------------------------------------------------------------------ dispatch
@frappe.whitelist()
def dispatch(branch: str | None = None) -> dict:
	_staff()
	branch = branch or svc.settings().default_branch
	blat, blng = svc.branch_point(branch)
	riders = frappe.get_all("Rider", {"branch": branch, "disabled": 0},
							["name", "rider_name", "phone", "vehicle", "status", "latitude", "longitude", "last_seen", "cash_in_hand", "employee"], order_by="rider_name")
	for r in riders:
		last_in = frappe.db.get_value("Employee Checkin", {"employee": r.employee, "log_type": "IN"}, "time", order_by="time desc") if r.employee else None
		r.checked_in_at = str(last_in) if last_in and r.status != "Off Duty" else None
		r.active = frappe.db.count("Delivery Assignment", {"rider": r.name, "status": ["in", ["Accepted", "Picked Up"]]})
		r.seen_seconds = int(time_diff_in_seconds(now_datetime(), r.last_seen)) if r.last_seen else None
	orders = frappe.get_all("Restaurant Order", {"branch": branch, "order_type": "Delivery",
												  "status": ["in", ["Accepted", "Preparing", "Ready", "Picked Up", "Out for Delivery"]]},
							["*"], order_by="placed_at")
	done = frappe.get_all("Restaurant Order", {"branch": branch, "order_type": "Delivery", "status": "Delivered",
												"completed_at": [">=", frappe.utils.nowdate()]}, ["*"], order_by="completed_at desc", limit=10)
	names = {r.name: r.rider_name for r in riders}
	out = []
	for o in orders + done:
		pos = svc.rider_position(o)
		da = frappe.db.get_value("Delivery Assignment", o.delivery_assignment, ["status", "rider"], as_dict=True) if o.delivery_assignment else None
		out.append({"name": o.name, "order_no": o.order_no, "status": o.status, "channel": o.channel, "delivery_by": o.delivery_by,
					"customer_name": o.customer_name, "phone": o.delivery_phone, "address": o.delivery_address, "lat": o.delivery_lat, "lng": o.delivery_lng,
					"rider": o.rider, "rider_name": names.get(o.rider) or o.ext_rider_name, "ext_rider_status": o.ext_rider_status,
					"assignment_status": da.status if da else None, "offered_to": names.get(da.rider) if da and da.status == "Offered" else None,
					"cod_amount": flt(o.cod_amount), "distance_km": flt(o.distance_km), "grand_total": flt(o.grand_total), "invoice": o.invoice,
					"placed_at": str(o.placed_at), "eta": svc.eta_minutes(o, pos), "tracking_key": o.tracking_key,
					"rider_lat": pos[0] if pos else None, "rider_lng": pos[1] if pos else None})
	return {"branch": branch, "branch_point": {"lat": blat, "lng": blng}, "riders": riders, "orders": out,
			"rule": svc.settings().rider_assignment, "now": str(now_datetime())}


@frappe.whitelist(methods=["POST"])
def assign(order: str, rider: str) -> dict:
	"""Manual dispatch: the order goes straight to this rider (accepted on their behalf)."""
	_staff()
	o = frappe.get_doc("Restaurant Order", order)
	if o.delivery_by != "Own Rider":
		frappe.throw(_("Foodpanda delivers this order with its own rider."))
	if o.delivery_assignment:
		old = frappe.get_doc("Delivery Assignment", o.delivery_assignment)
		if old.status == "Picked Up":
			frappe.throw(_("Already picked up by another rider."))
		old.db_set("status", "Cancelled")
		if not frappe.db.count("Delivery Assignment", {"rider": old.rider, "status": ["in", ["Accepted", "Picked Up"]]}):
			frappe.db.set_value("Rider", old.rider, "status", "Available")
	if frappe.db.get_value("Rider", rider, "status") == "Off Duty":
		frappe.throw(_("{0} is off duty.").format(frappe.db.get_value("Rider", rider, "rider_name")))
	return {"assignment": svc.offer(o, rider, status="Accepted")}


@frappe.whitelist(methods=["POST"])
def handover(rider: str, amount: float | None = None) -> dict:
	_staff()
	return {"journal_entry": svc.handover(rider, amount)}


def _price_list(branch):
	from restaurant_os.api.tables import _profile_for

	prof = _profile_for(branch)
	return prof, frappe.get_cached_value("POS Profile", prof, "selling_price_list")


@frappe.whitelist(methods=["POST"])
def new_delivery_order(data: str) -> dict:
	"""A phone order for delivery: customer, address (+ map pin), items; cash on delivery by default."""
	from restaurant_os.api import pos
	from restaurant_os.services.availability import check
	from restaurant_os.services.orders import create_order

	_staff()
	d = json.loads(data)
	branch = d.get("branch") or svc.settings().default_branch
	lines = [i for i in d.get("items") or [] if flt(i.get("qty")) > 0]
	if not lines or not (d.get("address") or "").strip():
		frappe.throw(_("Add the delivery address and at least one item."))
	check(branch, lines)
	prof, price_list = _price_list(branch)
	customer = frappe.db.get_value("Customer", {"mobile_no": d.get("phone")}, "name") if d.get("phone") else None
	customer = customer or frappe.get_cached_value("POS Profile", prof, "customer")
	rows = [{"item_code": i["item_code"], "qty": flt(i["qty"]), "notes": i.get("notes"),
			 "rate": flt(frappe.db.get_value("Item Price", {"item_code": i["item_code"], "price_list": price_list}, "price_list_rate"))} for i in lines]
	total = flt(pos.preview(json.dumps({"pos_profile": prof, "customer": customer, "items": [{"item_code": r["item_code"], "qty": r["qty"]} for r in rows]}))["rounded_total"])
	order = create_order(branch, rows, channel=d.get("channel") or "Phone", order_type="Delivery", customer=customer,
						 customer_name=d.get("customer_name") or customer, notes=d.get("notes"),
						 delivery={"delivery_phone": d.get("phone"), "delivery_address": d["address"], "delivery_lat": flt(d.get("lat")) or None,
								   "delivery_lng": flt(d.get("lng")) or None, "cod_amount": 0 if cint(d.get("prepaid")) else total})
	return {"order": order.name, "order_no": order.order_no, "tracking_key": order.tracking_key, "cod_amount": order.cod_amount}


@frappe.whitelist(methods=["POST"])
def simulate_delivery_order(branch: str | None = None) -> dict:
	"""Demo: a random phone delivery order near the branch."""
	_staff()
	branch = branch or svc.settings().default_branch
	_prof, price_list = _price_list(branch)
	menu = frappe.get_all("Item Price", {"price_list": price_list, "selling": 1, "item_code": ["in", frappe.get_all("Item", {"is_sales_item": 1}, pluck="name")]},
						  pluck="item_code")
	drop = random_drop(branch)
	return new_delivery_order(json.dumps({
		"branch": branch, "customer_name": random.choice(["Fatima N.", "Bilal T.", "Ayesha M.", "Hamza R.", "Mehwish A."]),
		"phone": f"+92 333 {random.randint(1000000, 9999999)}", "address": drop["text"], "lat": drop["latitude"], "lng": drop["longitude"],
		"items": [{"item_code": c, "qty": 1} for c in random.sample(menu, min(2, len(menu)))]}))


# ------------------------------------------------------------------ customer tracking (public link)
STEPS = ["Placed", "Preparing", "Ready", "Out for Delivery", "Delivered"]


@frappe.whitelist(allow_guest=True)
@rate_limit(limit=120, seconds=60)
def track(key: str) -> dict:
	name = frappe.db.get_value("Restaurant Order", {"tracking_key": key}, "name") if key and len(key) >= 10 else None
	if not name:
		frappe.throw(_("Order not found."), frappe.DoesNotExistError)
	o = frappe.get_doc("Restaurant Order", name)
	status = {"Accepted": "Placed", "Picked Up": "Out for Delivery", "Completed": "Delivered"}.get(o.status, o.status)
	pos = svc.rider_position(o) if o.status in svc.ON_ROAD or (o.delivery_by == "Foodpanda Rider" and o.status == "Ready") else None
	blat, blng = svc.branch_point(o.branch)
	rider_name = (frappe.db.get_value("Rider", o.rider, "rider_name") if o.rider else None) or o.ext_rider_name
	rider_phone = (frappe.db.get_value("Rider", o.rider, "phone") if o.rider else None) or o.ext_rider_phone
	company = frappe.get_cached_value("Restaurant Branch", o.branch, "company")
	return {
		"order_no": o.order_no, "status": status, "raw_status": o.status, "steps": STEPS, "step": STEPS.index(status) if status in STEPS else -1,
		"cancelled": o.status in ("Cancelled", "Rejected"), "restaurant": company, "branch": o.branch,
		"logo": frappe.get_cached_value("Company", company, "company_logo"),
		"branch_point": {"lat": blat, "lng": blng}, "drop": {"lat": o.delivery_lat, "lng": o.delivery_lng, "address": o.delivery_address},
		"rider": {"name": rider_name, "phone": rider_phone if o.status in svc.ON_ROAD else None,
				  "lat": pos[0] if pos else None, "lng": pos[1] if pos else None, "by": o.delivery_by},
		"eta_minutes": svc.eta_minutes(o, pos), "delivery_code": o.delivery_otp if o.status not in ("Delivered", "Completed") else None,
		"cod_amount": flt(o.cod_amount), "items": [{"item_name": r.item_name, "qty": r.qty} for r in o.items if r.kds_status != "Void"],
		"placed_at": str(o.placed_at),
	}
