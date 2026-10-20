"""Delivery riders — own riders and the aggregator's (Foodpanda).

Own rider: a delivery order that reaches Ready is offered to a rider of the branch (Restaurant Settings → Rider Assignment:
nearest to the branch, least busy, or manual dispatch). The rider app accepts / rejects, picks up (order → Picked Up → Out
for Delivery; ingredients deducted), and delivers with the customer's delivery code or a photo; cash on delivery is booked
to the rider's cash account (a Payment Entry against the invoice) and handed over at the counter later (a Journal Entry
tagged with the cashier's shift, so the shift's cash count expects it). The app sends GPS pings while on duty.

Foodpanda rider: Foodpanda assigns and tracks its own rider; its updates (webhook `foodpanda_rider`, or the mock below) set
the order's ext_rider_* fields. Restaurant Settings → Foodpanda Orders Delivered By = Own Rider uses your riders instead.

Customers follow either kind on the tracking page (`track`), which shows the rider's position once the food is on its way.
"""

import math
import random

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, now_datetime, nowdate, time_diff_in_seconds

ACTIVE = ("Offered", "Accepted", "Picked Up")
ON_ROAD = ("Picked Up", "Out for Delivery")


def settings():
	return frappe.get_cached_doc("Restaurant Settings")


def km(lat1, lng1, lat2, lng2):
	"""Great-circle distance (haversine)."""
	if not all((lat1, lng1, lat2, lng2)):
		return 0.0
	r = 6371.0
	p1, p2 = math.radians(flt(lat1)), math.radians(flt(lat2))
	dp, dl = p2 - p1, math.radians(flt(lng2) - flt(lng1))
	a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
	return 2 * r * math.asin(math.sqrt(a))


def branch_point(branch):
	b = frappe.get_cached_value("Restaurant Branch", branch, ["latitude", "longitude"], as_dict=True) or {}
	return flt(b.get("latitude")), flt(b.get("longitude"))


# ------------------------------------------------------------------ order setup
def prepare(order):
	"""Before a delivery order is saved the first time: tracking link, delivery code, who delivers, distance."""
	if order.order_type != "Delivery":
		return
	order.tracking_key = order.tracking_key or frappe.generate_hash(length=12)
	order.delivery_otp = order.delivery_otp or f"{random.randint(0, 9999):04d}"
	if not order.delivery_by:
		fp_own = settings().foodpanda_delivery_by == "Own Rider"
		order.delivery_by = "Foodpanda Rider" if order.channel == "Foodpanda" and not fp_own else "Own Rider"
	blat, blng = branch_point(order.branch)
	order.distance_km = round(km(blat, blng, order.delivery_lat, order.delivery_lng), 2)


def offer_due(order):
	return order.order_type == "Delivery" and order.delivery_by == "Own Rider" and not order.delivery_assignment


# ------------------------------------------------------------------ assignment
def _active_count(rider):
	return frappe.db.count("Delivery Assignment", {"rider": rider, "status": ["in", ["Accepted", "Picked Up"]]})


def candidates(order):
	rejected = set(frappe.get_all("Delivery Assignment", {"order": order.name, "status": "Rejected"}, pluck="rider"))
	riders = frappe.get_all("Rider", {"branch": order.branch, "disabled": 0, "status": "Available"},
							["name", "rider_name", "user", "latitude", "longitude", "last_seen"])
	riders = [r for r in riders if r.name not in rejected]
	blat, blng = branch_point(order.branch)
	for r in riders:
		r.distance = km(blat, blng, r.latitude, r.longitude) if r.latitude else 999
		r.busy = _active_count(r.name)
	rule = settings().rider_assignment or "Auto - Nearest"
	key = (lambda r: (r.busy, r.distance)) if rule == "Auto - Least Busy" else (lambda r: (r.distance, r.busy))
	return sorted(riders, key=key)


def _publish(order, event, rider=None):
	frappe.publish_realtime("ros_dispatch", {"event": event, "order": order.name, "branch": order.branch, "rider": rider}, after_commit=True)
	if rider:
		user = frappe.db.get_value("Rider", rider, "user")
		if user:
			frappe.publish_realtime("ros_rider", {"event": event, "order": order.name}, user=user, after_commit=True)


def offer(order, rider, status="Offered"):
	da = frappe.get_doc({"doctype": "Delivery Assignment", "order": order.name, "rider": rider, "branch": order.branch, "status": status,
						 "offered_at": now_datetime(), "accepted_at": now_datetime() if status == "Accepted" else None,
						 "distance_km": order.distance_km})
	da.flags.ignore_permissions = True
	da.insert()
	frappe.db.set_value("Restaurant Order", order.name, {"delivery_assignment": da.name, "rider": rider if status == "Accepted" else None})
	if status == "Accepted":
		frappe.db.set_value("Rider", rider, "status", "On Delivery")
	_publish(order, "offer" if status == "Offered" else "assigned", rider)
	return da.name


def auto_assign(order):
	"""Offer a ready delivery to the best available rider (no-op for manual dispatch or when nobody is free)."""
	if isinstance(order, str):
		order = frappe.get_doc("Restaurant Order", order)
	if not offer_due(order) or (settings().rider_assignment or "") == "Manual":
		_publish(order, "waiting")
		return None
	best = next(iter(candidates(order)), None)
	if not best:
		_publish(order, "waiting")
		return None
	return offer(order, best.name)


# ------------------------------------------------------------------ the rider's own actions (rider app)
def my_rider():
	name = frappe.db.get_value("Rider", {"user": frappe.session.user, "disabled": 0}, "name")
	if not name:
		frappe.throw(_("You are not set up as a rider."), frappe.PermissionError)
	return frappe.get_doc("Rider", name)


def _assignment(name, rider):
	da = frappe.get_doc("Delivery Assignment", name)
	if da.rider != rider.name:
		frappe.throw(_("This delivery is not yours."), frappe.PermissionError)
	da.flags.ignore_permissions = True
	return da


def set_duty(rider, on):
	if not cint(on) and frappe.db.count("Delivery Assignment", {"rider": rider.name, "status": ["in", ["Accepted", "Picked Up"]]}):
		frappe.throw(_("Finish your deliveries before going off duty."))
	rider.db_set({"status": ("On Delivery" if _active_count(rider.name) else "Available") if cint(on) else "Off Duty", "last_seen": now_datetime()})
	frappe.publish_realtime("ros_dispatch", {"event": "duty", "rider": rider.name, "branch": rider.branch}, after_commit=True)
	if cint(on):                                              # anything waiting for a rider?
		for name in frappe.get_all("Restaurant Order", {"branch": rider.branch, "status": "Ready", "order_type": "Delivery",
														 "delivery_by": "Own Rider", "delivery_assignment": ["in", ["", None]]}, pluck="name"):
			auto_assign(name)


def accept(rider, assignment):
	da = _assignment(assignment, rider)
	if da.status != "Offered":
		frappe.throw(_("This delivery is already {0}.").format(da.status))
	da.status, da.accepted_at = "Accepted", now_datetime()
	da.save()
	frappe.db.set_value("Restaurant Order", da.order, {"rider": rider.name, "delivery_assignment": da.name})
	rider.db_set("status", "On Delivery")
	_publish(frappe.get_doc("Restaurant Order", da.order), "accepted", rider.name)


def reject(rider, assignment, reason=None):
	da = _assignment(assignment, rider)
	if da.status not in ("Offered", "Accepted"):
		frappe.throw(_("This delivery is already {0}.").format(da.status))
	da.status, da.reject_reason = "Rejected", reason
	da.save()
	frappe.db.set_value("Restaurant Order", da.order, {"rider": None, "delivery_assignment": None})
	if not _active_count(rider.name):
		rider.db_set("status", "Available")
	auto_assign(da.order)                                     # next rider


def pickup(rider, assignment):
	from restaurant_os.services import orders as svc

	da = _assignment(assignment, rider)
	if da.status != "Accepted":
		frappe.throw(_("Accept the delivery first."))
	order = frappe.get_doc("Restaurant Order", da.order)
	order.flags.ignore_permissions = True
	if order.status not in ("Ready", "Picked Up"):
		frappe.throw(_("Order #{0} is not ready yet ({1}).").format(order.order_no, order.status))
	for r in order.items:
		if r.kds_status not in ("Void",):
			r.kds_status = "Served"
	svc.set_status(order, "Picked Up", save=False)
	order.save()                                              # ingredients deducted (on_update)
	svc.set_status(order, "Out for Delivery")
	da.status, da.picked_at = "Picked Up", now_datetime()
	da.save()
	_publish(order, "picked", rider.name)


def deliver(rider, assignment, otp=None, photo=None, cash=0):
	from restaurant_os.services import orders as svc
	from restaurant_os.services.delivery import invoice_for_order

	da = _assignment(assignment, rider)
	if da.status != "Picked Up":
		frappe.throw(_("Pick the order up first."))
	order = frappe.get_doc("Restaurant Order", da.order)
	order.flags.ignore_permissions = True
	if otp:
		if str(otp).strip() != str(order.delivery_otp):
			frappe.throw(_("Wrong delivery code."), title=_("Delivery code"))
		da.otp_verified = 1
	elif cint(settings().require_delivery_otp):
		frappe.throw(_("Enter the customer's delivery code."))
	elif not photo:
		frappe.throw(_("Enter the delivery code or attach a photo of the handover."))
	da.proof_photo = photo or da.proof_photo
	svc.set_status(order, "Delivered")
	from restaurant_os.session import as_system

	cash = flt(cash)
	with as_system():                                         # back-office postings for the rider (who owns this delivery)
		invoice = invoice_for_order(order.name)               # every delivery is invoiced now (services.delivery)
		if cash > 0:
			da.cash_collected = cash
			da.payment_entry = _cod_payment(order, invoice, cash, rider)
		rider.db_set("cash_in_hand", flt(rider.cash_in_hand) + cash)
	da.status, da.delivered_at = "Delivered", now_datetime()
	da.delivery_minutes = round(time_diff_in_seconds(da.delivered_at, order.placed_at or order.creation) / 60, 1)
	da.save()
	if not _active_count(rider.name):
		rider.db_set("status", "Available" if rider.status != "Off Duty" else "Off Duty")
	_publish(order, "delivered", rider.name)
	return invoice


def _cod_payment(order, invoice, cash, rider):
	"""Cash on delivery → a Payment Entry against the invoice into the rider-cash account (until handed over)."""
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	account = settings().rider_float_account
	if not account:
		frappe.throw(_("Set the Rider Cash Account in Restaurant Settings."))
	pe = get_payment_entry("Sales Invoice", invoice, party_amount=cash)
	pe.update({"mode_of_payment": "Cash", "paid_to": account, "paid_amount": cash, "received_amount": cash,
			   "reference_no": f"COD {order.name}", "reference_date": nowdate(), "custom_remarks": 1,
			   "remarks": f"Cash on delivery collected by {rider.rider_name} — order #{order.order_no} ({order.name})"})
	for ref in pe.references:
		ref.allocated_amount = min(flt(ref.outstanding_amount), cash)
	pe.set_amounts()
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe.name


def handover(rider_name, amount=None):
	"""The rider hands the collected cash to the counter: Journal Entry rider-cash → the counter's cash, tagged with the
	cashier's open shift (if any) so that shift's close expects it."""
	from restaurant_os.api.pos import _cash_mode, _open_shift
	from erpnext.accounts.doctype.sales_invoice.sales_invoice import get_bank_cash_account

	rider = frappe.get_doc("Rider", rider_name)
	amount = flt(amount) if amount else flt(rider.cash_in_hand)
	if amount <= 0:
		frappe.throw(_("{0} has no cash to hand over.").format(rider.rider_name))
	if amount > flt(rider.cash_in_hand) + 0.01:
		frappe.throw(_("{0} holds only {1}.").format(rider.rider_name, frappe.format_value(rider.cash_in_hand, "Currency")))
	company = frappe.get_cached_value("Restaurant Branch", rider.branch, "company")
	shift = _open_shift()
	mode = _cash_mode(shift.pos_profile) if shift else "Cash"
	cash_account = get_bank_cash_account(mode, company).get("account")
	tag = f" — POS {shift.name} ({shift.pos_profile})" if shift else ""
	je = frappe.get_doc({
		"doctype": "Journal Entry", "voucher_type": "Cash Entry", "company": company, "posting_date": nowdate(), "mode_of_payment": mode,
		"title": f"Cash In · Rider {rider.rider_name}"[:140], "user_remark": f"Rider cash handover: {rider.rider_name}{tag}",
		"accounts": [{"account": cash_account, "debit_in_account_currency": amount},
					 {"account": settings().rider_float_account, "credit_in_account_currency": amount}],
	})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	left = amount
	for da in frappe.get_all("Delivery Assignment", {"rider": rider.name, "cash_collected": [">", 0], "handed_over": 0},
							 ["name", "cash_collected"], order_by="delivered_at"):
		if left + 0.01 < flt(da.cash_collected):
			break
		frappe.db.set_value("Delivery Assignment", da.name, {"handed_over": 1, "handover_entry": je.name})
		left -= flt(da.cash_collected)
	rider.db_set("cash_in_hand", max(flt(rider.cash_in_hand) - amount, 0))
	frappe.publish_realtime("ros_dispatch", {"event": "handover", "rider": rider.name, "branch": rider.branch}, after_commit=True)
	return je.name


def record_location(rider, lat, lng, accuracy=None, speed=None):
	now = now_datetime()
	rider.db_set({"latitude": flt(lat), "longitude": flt(lng), "last_seen": now}, update_modified=False)
	active = frappe.db.get_value("Delivery Assignment", {"rider": rider.name, "status": ["in", ["Accepted", "Picked Up"]]}, "name")
	last = frappe.db.get_value("Rider Location Log", {"rider": rider.name}, "recorded_at", order_by="creation desc")
	if not last or time_diff_in_seconds(now, last) >= max(cint(settings().rider_ping_seconds) - 2, 5):
		frappe.get_doc({"doctype": "Rider Location Log", "rider": rider.name, "assignment": active, "latitude": flt(lat), "longitude": flt(lng),
						"accuracy": flt(accuracy), "speed": flt(speed), "recorded_at": now}).insert(ignore_permissions=True)
	frappe.publish_realtime("ros_rider_location", {"rider": rider.name, "branch": rider.branch, "lat": flt(lat), "lng": flt(lng),
												   "status": rider.status}, after_commit=True)


def purge_locations():
	"""Scheduler (daily): GPS pings older than 7 days."""
	frappe.db.delete("Rider Location Log", {"recorded_at": ["<", add_to_date(now_datetime(), days=-7)]})


# ------------------------------------------------------------------ where is the rider (both kinds)
def rider_position(order):
	"""(lat, lng, label) of whoever carries the order, or None before pickup."""
	if order.delivery_by == "Foodpanda Rider":
		if order.ext_rider_lat:
			return flt(order.ext_rider_lat), flt(order.ext_rider_lng), order.ext_rider_name or "Foodpanda rider"
		return mock_ext_position(order)
	if order.rider:
		r = frappe.db.get_value("Rider", order.rider, ["latitude", "longitude", "rider_name"], as_dict=True)
		if r and r.latitude:
			return flt(r.latitude), flt(r.longitude), r.rider_name
	return None


def mock_ext_position(order):
	"""Mock Foodpanda: the rider rides from the branch to the customer at the average speed after pickup."""
	if settings().aggregator_mode != "Mock" or order.status not in ON_ROAD + ("Ready",) or not order.delivery_lat:
		return None
	blat, blng = branch_point(order.branch)
	if order.status == "Ready":
		return blat + 0.002, blng + 0.002, order.ext_rider_name or "Foodpanda rider"
	start = get_datetime(frappe.db.get_value("Restaurant Order", order.name, "modified")) if not order.get("ready_at") else get_datetime(order.ready_at)
	total = max(flt(order.distance_km) / (flt(settings().avg_rider_speed_kmh) or 20) * 3600, 60)
	t = min(max(time_diff_in_seconds(now_datetime(), start) / total, 0), 1)
	return blat + (flt(order.delivery_lat) - blat) * t, blng + (flt(order.delivery_lng) - blng) * t, order.ext_rider_name or "Foodpanda rider"


def eta_minutes(order, pos=None):
	if order.status in ("Delivered", "Completed"):
		return 0
	speed = flt(settings().avg_rider_speed_kmh) or 20
	if order.status in ON_ROAD and pos and order.delivery_lat:
		return max(round(km(pos[0], pos[1], order.delivery_lat, order.delivery_lng) / speed * 60), 1)
	prep = 0 if order.status == "Ready" else cint(frappe.get_cached_value("Restaurant Branch", order.branch, "prep_sla_minutes")) or 15
	return prep + max(round(flt(order.distance_km) / speed * 60), 1)


def aggregator_rider_update(order):
	"""Order status changed on a Foodpanda-rider order: in Mock mode, play Foodpanda's rider (assigned at Ready, picks up)."""
	if order.delivery_by != "Foodpanda Rider" or settings().aggregator_mode != "Mock":
		return
	if order.status == "Ready" and not order.ext_rider_name:
		order.ext_rider_name = random.choice(["Kamran (Foodpanda)", "Naveed (Foodpanda)", "Asif (Foodpanda)", "Sana (Foodpanda)"])
		order.ext_rider_phone = f"+92 300 {random.randint(1000000, 9999999)}"
		order.ext_rider_status = "Assigned — arriving at the restaurant"
		order.ext_rider_eta = add_to_date(now_datetime(), minutes=5)
	elif order.status in ON_ROAD:
		order.ext_rider_status = "Picked up — on the way to the customer"
		order.ext_rider_eta = add_to_date(now_datetime(), minutes=eta_minutes(order))
	elif order.status == "Delivered":
		order.ext_rider_status = "Delivered"
