"""Definition of done (spec): a test order from each channel flows automatically through KDS → rider → delivered → review,
deducts the right ingredients from the right kitchen warehouse, triggers reorder when below threshold, and shows up in the
reports — with no manual step in between other than the people doing their jobs (cook bumps, rider taps, customer rates).

    bench --site restaurant.localhost run-tests --app restaurant_os --module restaurant_os.tests.test_e2e

The nine steps: 1 warehouse stock · 2 kitchen stock · 3 order placed · 4 KDS · 5 rider notified · 6 delivered ·
7 review · 8 inventory auto-update (+ reorder) · 9 reports.
"""

import json
import time

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, nowdate

from restaurant_os.api import kds, online, pos, tables
from restaurant_os.api import riders as rapi
from restaurant_os.setup import demo, masters

PROFILE = masters.PROFILE
OPENING = json.dumps([{"mode_of_payment": "Cash", "opening_amount": 5000}, {"mode_of_payment": "Credit Card", "opening_amount": 0},
					  {"mode_of_payment": "Bank Transfer", "opening_amount": 0}])
DISH, INGREDIENT, PER_PLATE = "Chicken Tikka", "Chicken Whole", 0.35      # demo recipe: 0.35 kg chicken per plate
KDS_BUDGET_SECONDS = 1.0                                                   # spec: order visible on the KDS < 1 s


def _qty(item, warehouse):
	return flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": warehouse}, "actual_qty"))


class TestNineSteps(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		if not frappe.db.exists("Company", masters.COMPANY):
			masters.run()
		if not frappe.db.exists("Item", DISH):
			demo.run()
		for name in frappe.get_all("POS Opening Shift", {"user": "Administrator", "docstatus": 1, "status": "Open"}, pluck="name"):
			frappe.db.set_value("POS Opening Shift", name, "status", "Closed")
		pos.open_shift(PROFILE, OPENING)
		b = frappe.get_doc("Restaurant Branch", masters.BRANCH)
		cls.kitchen, cls.store = b.kitchen_warehouse, b.store_warehouse if b.get("store_warehouse") else None
		cls.riders = frappe.get_all("Rider", {"branch": masters.BRANCH, "disabled": 0}, ["name", "user"], order_by="rider_name")

	@classmethod
	def tearDownClass(cls):
		frappe.db.rollback()
		super().tearDownClass()

	def _as(self, user, fn, *a, **kw):
		frappe.set_user(user)
		try:
			return fn(*a, **kw)
		finally:
			frappe.set_user("Administrator")

	# ------------------------------------------------------------------ one order per channel (step 3)
	def _place(self, channel):
		item = [{"item_code": DISH, "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]
		if channel == "POS":
			total = flt(pos.preview(json.dumps({"pos_profile": PROFILE, "items": [{"item_code": DISH, "qty": 1}]}))["rounded_total"])
			inv = pos.submit_invoice(json.dumps({"pos_profile": PROFILE, "items": [{"item_code": DISH, "qty": 1}],
												 "payments": [{"mode_of_payment": "Cash", "amount": total}]}))["name"]
			return frappe.db.get_value("Restaurant Order", {"invoice": inv}, "name")
		if channel == "Dine-in":
			t = frappe.db.get_value("Restaurant Table", {"branch": masters.BRANCH, "status": "Free"}, "name")
			tables.seat(t, 2)
			self.table = t
			return tables.send(t, json.dumps([{"item_code": DISH, "qty": 1}]))["order"]
		if channel == "Web":
			return online.place_order(json.dumps({"order_type": "Delivery", "items": item, "customer_name": "E2E Web Diner",
												  "phone": "03119990001", "address": "House 9, Peoples Colony No. 1", "lat": 31.406, "lng": 73.110}))["order"]
		if channel == "Kiosk":
			k = online.kiosk_order(json.dumps({"order_type": "Takeaway", "name": "E2E", "items": item}))
			draft = frappe.get_doc(pos._dt(PROFILE), k["invoice"])
			pay = flt(draft.rounded_total or draft.grand_total)
			inv = pos.submit_invoice(json.dumps({"pos_profile": PROFILE, "draft": draft.name, "remarks": draft.remarks,
												 "items": [{"item_code": r.item_code, "qty": r.qty, "rate": r.rate} for r in draft.items],
												 "payments": [{"mode_of_payment": "Cash", "amount": pay}]}))["name"]
			return frappe.db.get_value("Restaurant Order", {"invoice": inv}, "name")
		if channel == "Foodpanda":
			from restaurant_os.integrations.aggregators.foodpanda import receive

			return receive({"order_id": f"E2E-{frappe.generate_hash(length=8)}", "expedition_type": "delivery",
							"customer": {"name": "Panda Diner", "phone": "03119990002"},
							"address": {"text": "Madina Town, Faisalabad", "latitude": 31.396, "longitude": 73.100},
							"products": [{"remote_code": DISH, "quantity": 1, "unit_price": 700}]}).name
		if channel == "Phone":
			return rapi.new_delivery_order(json.dumps({"customer_name": "E2E Phone Diner", "phone": "03119990003", "address": "Garden Town",
													   "lat": 31.391, "lng": 73.075, "items": [{"item_code": DISH, "qty": 1}]}))["order"]
		raise ValueError(channel)

	# ------------------------------------------------------------------ the kitchen and the road (steps 4–6)
	def _on_kds(self, order):
		t0 = time.perf_counter()
		visible = any(c["name"] == order for c in kds.board()["cards"])
		return visible, time.perf_counter() - t0

	def _cook(self, order):
		while frappe.db.get_value("Restaurant Order", order, "status") in ("Placed", "Accepted", "Preparing"):
			kds.advance(order)
		self.assertIn(frappe.db.get_value("Restaurant Order", order, "status"), ("Ready", "Completed"))

	def _finish(self, channel, order):
		o = frappe.get_doc("Restaurant Order", order)
		if channel == "Dine-in":
			bill = tables.view(self.table)["bill"]
			tables.settle(self.table, json.dumps([{"mode_of_payment": "Cash", "amount": bill["rounded_total"]}]))
			while frappe.db.get_value("Restaurant Order", order, "status") not in ("Completed",):
				kds.advance(order)
			tables.end_sitting(self.table)
			return
		if o.order_type == "Delivery" and o.delivery_by == "Own Rider":
			da = frappe.db.get_value("Restaurant Order", order, "delivery_assignment")
			self.assertTrue(da, f"{channel}: a rider is offered the order as soon as it is ready (step 5)")
			rider = next(r for r in self.riders if r.name == frappe.db.get_value("Delivery Assignment", da, "rider"))
			if frappe.db.get_value("Delivery Assignment", da, "status") == "Offered":
				self._as(rider.user, rapi.accept, da)
			self._as(rider.user, rapi.pickup, da)
			o.reload()
			self._as(rider.user, rapi.deliver, da, otp=o.delivery_otp, cash=flt(o.cod_amount))
			return
		while frappe.db.get_value("Restaurant Order", order, "status") not in ("Completed", "Delivered"):
			kds.advance(order)

	def _review(self, order, stars):
		key = frappe.db.get_value("Restaurant Order", order, "tracking_key")
		if not key:                                           # counter / table orders get their link from the review request
			key = frappe.generate_hash(length=12)
			frappe.db.set_value("Restaurant Order", order, "tracking_key", key)
		return online.review(key, json.dumps({"rating_overall": stars, "rating_food": stars, "comment": "E2E"}))["review"]

	# ------------------------------------------------------------------ the test
	def test_every_channel_through_nine_steps(self):
		for r in self.riders:                                 # riders on shift
			self._as(r.user, rapi.set_duty, 1, 31.406, 73.105)
		# steps 1–2: the dish's ingredient is in the kitchen (stocked from the central store by the demo seed)
		before = _qty(INGREDIENT, self.kitchen)
		self.started = frappe.utils.now_datetime()
		self.assertGreater(before, 1, "kitchen stock of the ingredient")

		channels = ["POS", "Dine-in", "Web", "Kiosk", "Foodpanda", "Phone"]
		orders, slow = {}, {}
		for ch in channels:
			order = self._place(ch)                           # step 3
			self.assertTrue(order, f"{ch}: order created")
			visible, seconds = self._on_kds(order)            # step 4
			self.assertTrue(visible, f"{ch}: on the KDS straight away")
			if seconds > KDS_BUDGET_SECONDS:
				slow[ch] = round(seconds, 3)
			orders[ch] = order
		self.assertFalse(slow, f"KDS board slower than {KDS_BUDGET_SECONDS}s: {slow}")

		for ch, order in orders.items():
			self._cook(order)
			self._finish(ch, order)                           # steps 5–6
			status = frappe.db.get_value("Restaurant Order", order, "status")
			self.assertIn(status, ("Completed", "Delivered"), f"{ch}: finished")
			self.assertTrue(frappe.db.get_value("Restaurant Order", order, "invoice"), f"{ch}: invoiced")

		# step 7: each customer rates; a bad one alerts the managers
		for i, (ch, order) in enumerate(orders.items()):
			rv = self._review(order, 1 if ch == "Phone" else 5)
			self.assertEqual(frappe.db.get_value("Restaurant Order", order, "review"), rv)
		low = frappe.db.get_value("Restaurant Order", orders["Phone"], "review")
		self.assertTrue(frappe.db.exists("Notification Log", {"document_type": "Order Review", "document_name": low}))

		# step 8: one plate's recipe left the right kitchen, per order
		for ch, order in orders.items():
			o = frappe.db.get_value("Restaurant Order", order, ["stock_status", "stock_entry"], as_dict=True)
			self.assertEqual(o.stock_status, "Posted", f"{ch}: ingredients issued")
			used = frappe.db.sql("""select sum(actual_qty) from `tabStock Ledger Entry` where voucher_no = %s and item_code = %s
				and warehouse = %s and is_cancelled = 0""", (o.stock_entry, INGREDIENT, self.kitchen))[0][0]
			self.assertAlmostEqual(-flt(used), PER_PLATE, places=4, msg=f"{ch}: {PER_PLATE} kg {INGREDIENT} from {self.kitchen}")
		mine = {frappe.db.get_value("Restaurant Order", o, "stock_entry") for o in orders.values()}
		other = frappe.db.sql("""select voucher_no, actual_qty from `tabStock Ledger Entry` where item_code = %s and warehouse = %s
			and is_cancelled = 0 and creation >= %s and voucher_no not in %s""", (INGREDIENT, self.kitchen, self.started, list(mine)))
		self.assertAlmostEqual(before - _qty(INGREDIENT, self.kitchen), PER_PLATE * len(channels), places=4,
							   msg=f"orders: {orders} other movements: {[(v, q, frappe.db.get_value('Restaurant Order', frappe.db.get_value('Stock Entry', v, 'ros_reference_name'), ['name', 'channel', 'order_type', 'invoice', 'status'])) for v, q in other]}")

		# …and below its reorder level the kitchen asks the central store for more (ERPNext auto re-order)
		item = frappe.get_doc("Item", INGREDIENT)
		row = next(r for r in item.reorder_levels if r.warehouse == self.kitchen)
		row.warehouse_reorder_level = _qty(INGREDIENT, self.kitchen) + 5
		item.save()
		frappe.db.set_single_value("Stock Settings", "auto_indent", 1)
		from erpnext.stock.reorder_item import reorder_item

		reorder_item()
		self.assertTrue(frappe.db.sql("""select 1 from `tabMaterial Request` mr join `tabMaterial Request Item` i on i.parent = mr.name
			where i.item_code = %s and i.warehouse = %s and mr.transaction_date = %s and mr.docstatus < 2""",
									  (INGREDIENT, self.kitchen, nowdate())), "reorder raised a Material Request")

		# step 9: every channel shows in the reports and the dashboard
		from restaurant_os.services import analytics

		by_channel = {r["group"]: r for r in analytics.sales({"group_by": "Channel"})}
		for ch in ("POS", "Dine-in", "Web", "Kiosk", "Foodpanda", "Phone"):
			self.assertIn(ch, by_channel, f"{ch} in sales by channel")
		live = analytics.live(masters.BRANCH)
		self.assertGreaterEqual(live["reviews"]["count_7d"], len(channels))
		self.assertGreaterEqual(live["reviews"]["open_low"], 1)
		km = analytics.kitchen({"from_date": nowdate(), "to_date": nowdate()})
		self.assertTrue(km, "kitchen performance report")
