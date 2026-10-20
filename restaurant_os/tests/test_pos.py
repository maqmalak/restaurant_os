"""The counter, kitchen and dine-in flows on POS Awesome documents, end to end, on the Saffron Grill demo data.

    bench --site restaurant.localhost run-tests --app restaurant_os

Runs with the owner's defaults: counter sales as POS Invoices, 18% sales tax on top of menu prices.
"""

import json
import uuid

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt

from restaurant_os.api import kds, pos, tables
from restaurant_os.setup import demo, masters

PROFILE = masters.PROFILE
OPENING = json.dumps([{"mode_of_payment": "Cash", "opening_amount": 5000}, {"mode_of_payment": "Credit Card", "opening_amount": 0},
					  {"mode_of_payment": "Bank Transfer", "opening_amount": 0}])


def _close_open_shifts_for(user):
	for name in frappe.get_all("POS Opening Shift", {"user": user, "docstatus": 1, "status": "Open"}, pluck="name"):
		frappe.db.set_value("POS Opening Shift", name, "status", "Closed")


def _close_open_shifts():
	for name in frappe.get_all("POS Opening Shift", {"user": "Administrator", "docstatus": 1, "status": "Open"}, pluck="name"):
		frappe.db.set_value("POS Opening Shift", name, "status", "Closed")


class TestRestaurantPOS(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		if not frappe.db.exists("Company", masters.COMPANY):
			masters.run()
		if not frappe.db.exists("Item", "Chicken Karahi"):
			demo.run()
		_close_open_shifts()
		pos.open_shift(PROFILE, OPENING)
		cls.dt = pos._dt(PROFILE)

	@classmethod
	def tearDownClass(cls):
		frappe.db.rollback()
		super().tearDownClass()

	def cart(self, items, **extra):
		return {"pos_profile": PROFILE, "customer": masters.WALK_IN, "items": [{"item_code": i, "qty": q} for i, q in items], **extra}

	def pay(self, items, tender=None, **extra):
		"""Sell `items` paying the exact total (or `tender`) in cash."""
		total = flt(pos.preview(json.dumps(self.cart(items, **extra)))["rounded_total"])
		return pos.submit_invoice(json.dumps(self.cart(items, payments=[{"mode_of_payment": "Cash", "amount": tender or total}], **extra))), total

	# ---------------------------------------------------------------- counter
	def test_defaults_pos_invoice_and_tax(self):
		self.assertEqual(self.dt, "POS Invoice")
		p = pos.preview(json.dumps(self.cart([("Nihari", 1)])))
		self.assertAlmostEqual(flt(p["net_total"]), 900, places=2)
		self.assertAlmostEqual(flt(p["total_taxes_and_charges"]) - flt(p.get("fbr_fee", 0)), 162, places=0)   # 18% on top

	def test_offers_in_preview(self):
		p = pos.preview(json.dumps(self.cart([("Chicken Karahi", 1)])))
		free = [r for r in p["items"] if r["is_free_item"]]
		self.assertEqual([r["item_code"] for r in free], ["Raita"], "karahi comes with a free raita")
		self.assertEqual(flt(free[0]["amount"]), 0)
		p = pos.preview(json.dumps(self.cart([("Paratha", 2)])))
		self.assertAlmostEqual(flt(p["items"][0]["rate"]), 72, places=2)   # 90 − 20% breakfast offer
		self.assertIn("Breakfast Hour 20% Off", p["items"][0]["pricing_rules"])
		p = pos.preview(json.dumps(self.cart([("Mutton Chops", 3)])))   # 5,400 ≥ 5,000 → 5% bill discount
		self.assertEqual(flt(p["additional_discount_percentage"]), 5)

	def test_sale_on_the_shift_opens_a_kitchen_order(self):
		shift = pos._open_shift(PROFILE)
		r, total = self.pay([("Chicken Karahi", 1), ("Coke 345ml", 2)], tender=3000)
		inv = frappe.get_doc(self.dt, r["name"])
		self.assertEqual((inv.docstatus, inv.is_pos, inv.posa_pos_opening_shift), (1, 1, shift.name))
		self.assertTrue(any(o.offer_name == "Free Raita with Karahi" for o in inv.posa_offers))
		self.assertAlmostEqual(flt(r["change_amount"]), 3000 - total, places=2)
		order = frappe.get_doc("Restaurant Order", {"invoice": r["name"]})
		self.assertEqual(order.status, "Accepted")
		stations = {i.item_code: i.station for i in order.items}
		self.assertEqual(stations["Chicken Karahi"], "Gulberg-Handi")
		self.assertEqual(stations["Coke 345ml"], "Gulberg-Drinks")

	def test_offline_sale_posts_once(self):
		oid = str(uuid.uuid4())
		data = self.cart([("Doodh Patti Tea", 2)], offline_id=oid)
		total = flt(pos.preview(json.dumps(data))["rounded_total"])
		data["payments"] = [{"mode_of_payment": "Cash", "amount": total}]
		first = pos.submit_invoice(json.dumps(data))           # sync_invoices posts each sale like this (and commits)
		again = pos.submit_invoice(json.dumps(data))
		self.assertEqual(again.get("duplicate"), 1)
		self.assertEqual(again["name"], first["name"])
		self.assertEqual(frappe.db.count(self.dt, {"posa_client_request_id": oid, "docstatus": 1}), 1)

	def test_coupon_is_counted(self):
		used = frappe.db.get_value("POS Coupon", "WELCOME10", "used") or 0
		r, _total = self.pay([("Nihari", 2)], coupon_code="welcome10")
		self.assertEqual(flt(frappe.db.get_value(self.dt, r["name"], "additional_discount_percentage")), 10)
		self.assertEqual(frappe.db.get_value("POS Coupon", "WELCOME10", "used"), used + 1)

	def test_return_cash_movement_and_close(self):
		sale, total = self.pay([("French Fries", 2)])
		row = frappe.get_doc(self.dt, sale["name"]).items[0].name
		ret = pos.return_invoice(sale["name"], json.dumps({row: 1}), "Cash")
		self.assertLess(flt(ret["grand_total"]), 0)
		move = pos.record_cash(json.dumps({"direction": "out", "mode_of_payment": "Cash", "amount": 500,
										   "account": masters.acct("Miscellaneous Expenses"), "remarks": "Charcoal top-up"}))
		self.assertEqual(move["doctype"], "POS Cash Movement")
		summary = pos.shift_summary()
		cash = next(m for m in summary["modes"] if m["mode_of_payment"] == "Cash")
		closed = pos.close_shift(json.dumps({"Cash": cash["expected"], "Credit Card": 0, "Bank Transfer": 0}))
		closing = frappe.get_doc("POS Closing Shift", closed["name"])
		self.assertEqual(closing.docstatus, 1)
		row = next(r for r in closing.payment_reconciliation if r.mode_of_payment == "Cash")
		self.assertAlmostEqual(flt(row.expected_amount), flt(cash["expected"]), places=2)
		self.assertAlmostEqual(flt(row.difference), 0, places=2)
		pos.open_shift(PROFILE, OPENING)                       # for the tests after this one

	def test_dashboard_reports_profit(self):
		self.pay([("Coke 345ml", 1)])
		d = pos.dashboard(masters.COMPANY, pos_profile=PROFILE)
		self.assertGreater(d["summary"]["profit"], 0)
		self.assertLess(d["summary"]["margin"], 90, "cost of goods is counted")

	# ---------------------------------------------------------------- kitchen
	def test_kds_flow_and_recipe_stock(self):
		r, _total = self.pay([("Chicken Tikka", 2)])
		order = frappe.db.get_value("Restaurant Order", {"invoice": r["name"]}, "name")
		card = next(c for c in kds.board()["cards"] if c["name"] == order)
		self.assertEqual(card["column"], "Placed")
		kitchen = masters.acct("Gulberg Kitchen")
		before = flt(frappe.db.get_value("Bin", {"item_code": "Chicken Whole", "warehouse": kitchen}, "actual_qty"))
		self.assertEqual(kds.advance(order)["status"], "Preparing")
		self.assertEqual(kds.advance(order)["status"], "Ready")
		self.assertEqual(kds.advance(order)["status"], "Completed")
		self.assertEqual(frappe.db.get_value("Restaurant Order", order, "stock_status"), "Posted")
		after = flt(frappe.db.get_value("Bin", {"item_code": "Chicken Whole", "warehouse": kitchen}, "actual_qty"))
		self.assertAlmostEqual(before - after, 0.7, places=3)  # 2 × 0.35 kg per plate

	def test_station_filter_and_item_bump(self):
		r, _total = self.pay([("Chicken Karahi", 1), ("Mint Lemonade", 1)])
		order = frappe.get_doc("Restaurant Order", {"invoice": r["name"]})
		card = next(c for c in kds.board(station="Gulberg-Drinks")["cards"] if c["name"] == order.name)
		self.assertEqual([i["item_code"] for i in card["items"]], ["Mint Lemonade"])
		lemonade = next(i for i in order.items if i.item_code == "Mint Lemonade")
		kds.bump_item(order.name, lemonade.name)
		self.assertEqual(frappe.db.get_value("Restaurant Order", order.name, "status"), "Preparing")

	def test_foodpanda_mock_order(self):
		from restaurant_os.integrations.aggregators.foodpanda import simulate_order

		order = simulate_order(2)
		self.assertEqual((order.channel, order.order_type), ("Foodpanda", "Delivery"))
		self.assertIn(order.status, ("Accepted", "Preparing", "Ready"))   # lines no station makes start Ready
		self.assertTrue(frappe.db.exists("Integration Request", {"integration_request_service": "Foodpanda"}))

	# ---------------------------------------------------------------- dine-in
	def test_table_sitting(self):
		t = "Gulberg-T1"
		if frappe.db.get_value("Restaurant Table", t, "status") == "Occupied":
			frappe.db.set_value("Restaurant Table", t, {"status": "Free", "current_order": None})
		tables.seat(t, 3)
		first = tables.send(t, json.dumps([{"item_code": "Chicken Karahi", "qty": 1}]))
		tables.send(t, json.dumps([{"item_code": "Roti", "qty": 4}]))
		order = frappe.get_doc("Restaurant Order", first["order"])
		self.assertEqual(sorted({int(i.kitchen_round) for i in order.items}), [1, 2])
		with self.assertRaises(frappe.ValidationError):
			tables.end_sitting(t)                              # not settled yet
		bill = tables.view(t)["bill"]
		tables.settle(t, json.dumps([{"mode_of_payment": "Cash", "amount": bill["rounded_total"]}]))
		self.assertTrue(frappe.db.get_value("Restaurant Order", order.name, "invoice"))
		self.assertEqual(frappe.db.count("Restaurant Order", {"customer": order.customer, "channel": "POS",
															 "invoice": frappe.db.get_value("Restaurant Order", order.name, "invoice")}), 0,
						 "settling doesn't cook again")
		tables.end_sitting(t)
		self.assertEqual(frappe.db.get_value("Restaurant Table", t, "status"), "Free")
		self.assertEqual(frappe.db.get_value("Restaurant Order", order.name, "status"), "Completed")

	def test_tax_switch(self):
		s = frappe.get_single("Restaurant Settings")
		s.tax_included_in_price = "Tax included in item price"
		s.save()
		p = pos.preview(json.dumps(self.cart([("Nihari", 1)])))
		self.assertAlmostEqual(flt(p["net_total"]), round(900 / 1.18, 2), places=0)   # the price already holds the tax
		s.apply_sales_tax = 0
		s.save()
		template = frappe.db.get_value("POS Profile", PROFILE, "taxes_and_charges")
		rows = frappe.get_all("Sales Taxes and Charges", {"parent": template, "parenttype": "Sales Taxes and Charges Template"}, pluck="description") if template else []
		self.assertEqual(rows, ["FBR POS Service Fee"] if s.fbr_enabled else [], "sales tax is off; only the FBR fee stays")

	# ---------------------------------------------------------------- FBR
	def test_fbr_mock_number_on_receipt(self):
		r, _total = self.pay([("Chicken Seekh Kabab", 1)])
		inv = frappe.db.get_value(self.dt, r["name"], ["fbr_invoice_number", "fbr_status"], as_dict=True)
		self.assertEqual(inv.fbr_status, "Posted")
		self.assertTrue(inv.fbr_invoice_number)
		rec = pos.receipt(r["name"])
		self.assertEqual(rec["qr_value"], inv.fbr_invoice_number)
		self.assertTrue(any(t["description"] == "FBR POS Service Fee" and flt(t["tax_amount"]) == 1 for t in rec["taxes"]))
		self.assertTrue(frappe.db.exists("Integration Request", {"integration_request_service": "FBR", "reference_docname": r["name"]}))

	# ---------------------------------------------------------------- delivery
	def test_foodpanda_invoiced_when_delivered(self):
		from restaurant_os.integrations.aggregators.foodpanda import simulate_order

		order = simulate_order(1)
		self.assertFalse(order.invoice, "not invoiced on acceptance")
		while frappe.db.get_value("Restaurant Order", order.name, "status") != "Picked Up":
			kds.advance(order.name)
		self.assertIn(frappe.db.get_value("Restaurant Order", order.name, "stock_status"), ("Posted", "Not Needed"))
		self.assertFalse(frappe.db.get_value("Restaurant Order", order.name, "invoice"))
		self.assertEqual(kds.advance(order.name)["status"], "Delivered")   # Foodpanda's rider: no Out for Delivery step
		inv = frappe.db.get_value("Restaurant Order", order.name, "invoice")
		si = frappe.db.get_value("Sales Invoice", inv, ["customer", "docstatus", "fbr_status", "selling_price_list"], as_dict=True)
		self.assertEqual((si.customer, si.docstatus, si.selling_price_list, si.fbr_status), ("Foodpanda", 1, "Foodpanda", "Posted"))

	def test_own_delivery_cash_on_delivery(self):
		from restaurant_os.services.orders import create_order

		order = create_order(masters.BRANCH, [{"item_code": "Chicken Tikka", "qty": 1, "rate": 650}], channel="Web", order_type="Delivery",
							 customer=masters.WALK_IN)
		for expected in ("Preparing", "Ready", "Picked Up", "Out for Delivery"):
			kds.advance(order.name)
		self.assertFalse(frappe.db.get_value("Restaurant Order", order.name, "invoice"))
		self.assertEqual(kds.advance(order.name)["status"], "Delivered")
		inv = frappe.db.get_value("Restaurant Order", order.name, "invoice")
		self.assertTrue(inv)
		self.assertGreater(flt(frappe.db.get_value("Sales Invoice", inv, "outstanding_amount")), 0, "cash is received at the counter later")

	# ---------------------------------------------------------------- availability, wastage, variance
	def _issue_all(self, item):
		kitchen = masters.acct("Gulberg Kitchen")
		qty = flt(frappe.db.get_value("Bin", {"item_code": item, "warehouse": kitchen}, "actual_qty"))
		se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "purpose": "Material Issue", "company": masters.COMPANY,
							 "items": [{"item_code": item, "qty": qty, "s_warehouse": kitchen}]})
		se.insert(); se.submit()

	def test_sold_out_dish_is_locked_and_refused(self):
		from restaurant_os.services.availability import get_items, portions

		self._issue_all("Mutton")
		self.assertEqual(portions(masters.BRANCH, ["Mutton Chops"])["Mutton Chops"], 0)
		items = get_items(0, 100, "Standard Selling", "", PROFILE, "Mutton")["items"]
		chops = next(i for i in items if i["item_code"] == "Mutton Chops")
		self.assertEqual((chops["ros_recipe"], chops["actual_qty"]), (1, 0))
		with self.assertRaises(frappe.ValidationError):
			self.pay([("Mutton Chops", 1)])

	def test_wastage_and_variance(self):
		from restaurant_os.restaurant_os.report.ingredient_variance.ingredient_variance import execute

		kitchen = masters.acct("Gulberg Kitchen")
		before = flt(frappe.db.get_value("Bin", {"item_code": "Onion", "warehouse": kitchen}, "actual_qty"))
		w = frappe.get_doc({"doctype": "Wastage Log", "branch": masters.BRANCH, "warehouse": kitchen, "reason": "Spoiled",
							"items": [{"item_code": "Onion", "qty": 2}]})
		w.insert(); w.submit()
		self.assertEqual(frappe.db.get_value("Stock Entry", w.stock_entry, "ros_source"), "Wastage")
		self.assertGreater(flt(w.total_cost), 0)
		# physical count finds 1 kg less than the books → −1 variance
		rate = flt(frappe.db.get_value("Bin", {"item_code": "Onion", "warehouse": kitchen}, "valuation_rate"))
		sr = frappe.get_doc({"doctype": "Stock Reconciliation", "company": masters.COMPANY, "purpose": "Stock Reconciliation",
							 "items": [{"item_code": "Onion", "warehouse": kitchen, "qty": before - 3, "valuation_rate": rate}]})
		sr.insert(); sr.submit()
		_cols, data = execute({"branch": masters.BRANCH})
		onion = next(r for r in data if r.item_code == "Onion")
		self.assertAlmostEqual(flt(onion.wastage), 2, places=3)
		self.assertAlmostEqual(flt(onion.variance), -1, places=3)
		self.assertLess(flt(onion.variance_value), 0)

	# ---------------------------------------------------------------- riders (own + Foodpanda)
	def _as(self, user, fn, *a, **kw):
		frappe.set_user(user)
		try:
			return fn(*a, **kw)
		finally:
			frappe.set_user("Administrator")

	def _free_riders(self):
		"""Earlier tests leave deliveries on the riders (and offers waiting): clear them so this test starts fresh."""
		for da in frappe.get_all("Delivery Assignment", {"status": ["in", ["Offered", "Accepted", "Picked Up"]]}, ["name", "order"]):
			frappe.db.set_value("Delivery Assignment", da.name, "status", "Cancelled")
			frappe.db.set_value("Restaurant Order", da.order, {"delivery_assignment": None, "rider": None})
		for name in frappe.get_all("Rider", {"status": "On Delivery"}, pluck="name"):
			frappe.db.set_value("Rider", name, "status", "Available")
		frappe.db.set_value("Restaurant Order", {"status": "Ready", "order_type": "Delivery"}, "delivery_by", "Foodpanda Rider")   # nothing else waiting

	def _ready(self, order):
		while frappe.db.get_value("Restaurant Order", order, "status") != "Ready":
			kds.advance(order)

	def test_own_rider_end_to_end(self):
		from restaurant_os.api import riders as api

		riders = frappe.get_all("Rider", {"branch": masters.BRANCH}, ["name", "user"], order_by="rider_name")
		self._free_riders()
		for r in riders:
			self._as(r.user, api.set_duty, 1)
		o = api.new_delivery_order(json.dumps({"customer_name": "Test Diner", "phone": "+92 300 0000001", "address": "House 1, Gulberg",
											   "lat": 31.53, "lng": 74.36, "items": [{"item_code": "Chicken Tikka", "qty": 2}]}))
		order = frappe.get_doc("Restaurant Order", o["order"])
		self.assertEqual((order.delivery_by, order.channel), ("Own Rider", "Phone"))
		self.assertTrue(order.tracking_key and order.delivery_otp and order.cod_amount > 0)
		self._ready(order.name)
		da = frappe.get_doc("Delivery Assignment", frappe.db.get_value("Restaurant Order", order.name, "delivery_assignment"))
		self.assertEqual(da.status, "Offered")
		# the first rider says no → offered to the next
		first = next(r for r in riders if r.name == da.rider)
		self._as(first.user, api.reject, da.name, "Puncture")
		da2 = frappe.get_doc("Delivery Assignment", frappe.db.get_value("Restaurant Order", order.name, "delivery_assignment"))
		self.assertNotEqual(da2.rider, first.name)
		rider = next(r for r in riders if r.name == da2.rider)
		self._as(rider.user, api.accept, da2.name)
		self._as(rider.user, api.location, 31.521, 74.359, 8)
		self._as(rider.user, api.pickup, da2.name)
		self.assertEqual(frappe.db.get_value("Restaurant Order", order.name, "status"), "Out for Delivery")
		t = api.track(order.tracking_key)
		self.assertEqual((t["status"], t["rider"]["lat"]), ("Out for Delivery", 31.521))
		with self.assertRaises(frappe.ValidationError):
			self._as(rider.user, api.deliver, da2.name, otp="0000" if order.delivery_otp != "0000" else "1111")
		cod = flt(frappe.db.get_value("Restaurant Order", order.name, "cod_amount"))
		res = self._as(rider.user, api.deliver, da2.name, otp=order.delivery_otp, cash=cod)
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", res["invoice"], "outstanding_amount")), 0, "rider's cash settles the invoice")
		self.assertAlmostEqual(flt(frappe.db.get_value("Rider", rider.name, "cash_in_hand")), cod, places=2)
		# hand the cash to the counter: it lands in the cashier's shift
		before = next(m for m in pos.shift_summary()["modes"] if m["mode_of_payment"] == "Cash")["expected"]
		api.handover(rider.name)
		after = next(m for m in pos.shift_summary()["modes"] if m["mode_of_payment"] == "Cash")["expected"]
		self.assertAlmostEqual(after - before, cod, places=2)
		self.assertEqual(flt(frappe.db.get_value("Rider", rider.name, "cash_in_hand")), 0)
		self.assertEqual(api.track(order.tracking_key)["status"], "Delivered")

	def test_manual_dispatch(self):
		from restaurant_os.api import riders as api

		rider = frappe.get_all("Rider", {"branch": masters.BRANCH}, ["name", "user"], limit=1)[0]
		self._as(rider.user, api.set_duty, 1)
		o = api.simulate_delivery_order()
		self.assertEqual(api.assign(o["order"], rider.name)["assignment"][:3], "DA-")
		self.assertEqual(frappe.db.get_value("Restaurant Order", o["order"], "rider"), rider.name)
		board = api.dispatch()
		self.assertTrue(any(x["name"] == o["order"] for x in board["orders"]))

	def test_foodpanda_rider_tracked(self):
		from restaurant_os.api import riders as api
		from restaurant_os.integrations.aggregators.foodpanda import simulate_order

		order = simulate_order(1)
		self.assertEqual(order.delivery_by, "Foodpanda Rider")
		self._ready(order.name)
		doc = frappe.get_doc("Restaurant Order", order.name)
		self.assertTrue(doc.ext_rider_name, "Foodpanda (mock) assigns its rider at Ready")
		self.assertFalse(doc.delivery_assignment, "own riders are not offered Foodpanda-rider orders")
		kds.advance(order.name)                              # Foodpanda rider picks up
		t = api.track(doc.tracking_key)
		self.assertEqual(t["rider"]["by"], "Foodpanda Rider")
		self.assertIsNotNone(t["rider"]["lat"])

	def test_rider_duty_is_hr_checkin(self):
		from restaurant_os.api import riders as api

		rider = frappe.get_all("Rider", {"branch": masters.BRANCH}, ["name", "user", "employee"], limit=1)[0]
		frappe.db.set_value("Rider", rider.name, "status", "Off Duty")
		self._as(rider.user, api.set_duty, 1, 31.52, 74.36)
		ci = frappe.get_all("Employee Checkin", {"employee": rider.employee}, ["log_type", "latitude", "device_id"], order_by="creation desc", limit=1)[0]
		self.assertEqual((ci.log_type, flt(ci.latitude)), ("IN", 31.52))
		self._as(rider.user, api.set_duty, 0)
		self.assertEqual(frappe.get_all("Employee Checkin", {"employee": rider.employee}, pluck="log_type", order_by="creation desc", limit=1)[0], "OUT")

	# ---------------------------------------------------------------- owner analytics
	def test_owner_analytics(self):
		from restaurant_os.api import analytics

		r, _total = self.pay([("Chicken Tikka", 2), ("Coke 345ml", 1)])
		order = frappe.db.get_value("Restaurant Order", {"invoice": r["name"]}, "name")
		while frappe.db.get_value("Restaurant Order", order, "status") not in ("Completed",):
			kds.advance(order)
		live = analytics.live()
		self.assertGreater(live["today"]["net"], 0)
		self.assertEqual(len(live["hours"]), 24)
		by_channel = analytics.sales(json.dumps({"group_by": "Channel"}))
		self.assertTrue(any(row["group"] == "POS" and row["net_sales"] >= 1450 for row in by_channel))
		by_part = analytics.sales(json.dumps({"group_by": "Day Part"}))
		self.assertTrue(all(row["group"] in ("Breakfast", "Lunch", "Evening", "Dinner", "Late Night") for row in by_part))
		me = analytics.menu_engineering()
		tikka = next(i for i in me["items"] if i.item_code == "Chicken Tikka")
		self.assertIn(tikka["class"], ("Star", "Plowhorse", "Puzzle", "Dog"))
		self.assertGreater(tikka.unit_cost, 0)
		k = analytics.kitchen()
		self.assertTrue(any(s.dishes > 0 for s in k["stations"]))
		self.assertIn("retention_pct", analytics.customers())

	# ---------------------------------------------------------------- online ordering & kiosk
	def test_online_menu_and_delivery_order(self):
		from restaurant_os.api import online

		m = online.menu()
		malai = next(i for i in m["items"] if i.item_code == "Chicken Malai Boti")
		self.assertTrue(any(g["group"] == "Spice Level" for g in malai.modifiers))
		self.assertNotIn("Delivery Charge", [i.item_code for i in m["items"]])
		cart = [{"item_code": "Chicken Malai Boti", "qty": 2, "modifiers": [{"group": "Spice Level", "name": "Hot"}, {"group": "Cheese", "name": "Extra Cheese"}]}]
		with self.assertRaises(frappe.ValidationError):        # spice level is required
			online.quote(json.dumps({"order_type": "Pickup", "items": [{"item_code": "Chicken Malai Boti", "qty": 1}]}))
		q = online.quote(json.dumps({"order_type": "Delivery", "items": cart}))
		codes = [l["item_code"] for l in q["lines"]]
		self.assertEqual(codes, ["Chicken Malai Boti", "Extra Cheese", "Delivery Charge"], "add-on item and delivery fee become lines")
		self.assertGreater(q["tax"], 0)
		r = online.place_order(json.dumps({"order_type": "Delivery", "items": cart, "customer_name": "Online Test", "phone": "+92 300 1112233",
										   "address": "House 9, Gulberg", "lat": 31.525, "lng": 74.355, "client_order_uuid": "u-123"}))
		again = online.place_order(json.dumps({"order_type": "Delivery", "items": cart, "customer_name": "Online Test", "phone": "+92 300 1112233",
											   "address": "House 9, Gulberg", "client_order_uuid": "u-123"}))
		self.assertEqual(again["order"], r["order"])
		o = frappe.get_doc("Restaurant Order", r["order"])
		self.assertEqual((o.channel, o.order_type, o.delivery_by), ("Web", "Delivery", "Own Rider"))
		self.assertAlmostEqual(flt(o.cod_amount), q["total"], places=2)
		self.assertEqual(frappe.db.get_value("Customer", o.customer, "mobile_no"), "+92 300 1112233")
		dish = next(i for i in o.items if i.item_code == "Chicken Malai Boti")
		self.assertIn("Spice Level: Hot", dish.modifiers)
		with self.assertRaises(frappe.ValidationError):        # outside the delivery radius
			online.place_order(json.dumps({"order_type": "Delivery", "items": cart, "customer_name": "Far", "phone": "+92 300 9998877",
										   "address": "Islamabad", "lat": 33.68, "lng": 73.04}))

	def test_online_pickup_invoiced_when_collected(self):
		from restaurant_os.api import online
		from restaurant_os.api.riders import track

		cart = [{"item_code": "Chicken Karahi", "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]
		r = online.place_order(json.dumps({"order_type": "Pickup", "items": cart, "customer_name": "Pickup Test", "phone": "03001234567"}))
		self.assertEqual(track(r["tracking_key"])["steps"][-1], "Collected")
		while frappe.db.get_value("Restaurant Order", r["order"], "status") != "Completed":
			kds.advance(r["order"])
		inv = frappe.db.get_value("Restaurant Order", r["order"], "invoice")
		self.assertTrue(inv)
		self.assertAlmostEqual(flt(frappe.db.get_value("Sales Invoice", inv, "rounded_total")), flt(r["total"]), places=2, msg="quote = invoice")

	def test_kiosk_order_waits_on_the_counter(self):
		from restaurant_os.api import online

		r = online.kiosk_order(json.dumps({"order_type": "Dine-in", "name": "Ali", "items": [
			{"item_code": "French Fries", "qty": 1, "modifiers": [{"group": "Cheese", "name": "Extra Cheese"}]}]}))
		self.assertTrue(r["number"].startswith("K"))
		held = pos.held_invoices(PROFILE)
		self.assertTrue(any(h.name == r["invoice"] and h.remarks.startswith("Kiosk K") for h in held), "the cashier sees kiosk orders")
		self.assertFalse(frappe.db.exists("Restaurant Order", {"invoice": r["invoice"]}), "the kitchen waits for payment")

	def test_online_payment_success_and_decline(self):
		from restaurant_os.api import online, payments

		cart = [{"item_code": "Chicken Tikka", "qty": 2, "modifiers": [{"group": "Spice Level", "name": "Medium"}]}]
		r = online.place_order(json.dumps({"order_type": "Delivery", "payment": "Online", "items": cart, "customer_name": "Card Diner",
										   "phone": "+92 300 4445566", "address": "House 5, Gulberg", "lat": 31.522, "lng": 74.357}))
		self.assertTrue(r["payment_url"].startswith("/ros/pay/"))
		o = frappe.get_doc("Restaurant Order", r["order"])
		self.assertEqual((o.status, o.payment_status, flt(o.cod_amount)), ("Awaiting Payment", "Awaiting", 0))
		self.assertFalse(any(c["name"] == o.name for c in kds.board()["cards"]), "unpaid online orders stay off the KDS")
		session = r["payment_url"].rsplit("/", 1)[1]
		payments.mock_pay(session, "fail")
		self.assertEqual(frappe.db.get_value("Restaurant Order", o.name, "payment_status"), "Failed")
		session = payments.retry(r["tracking_key"])["payment_url"].rsplit("/", 1)[1]
		payments.mock_pay(session, "success")
		o.reload()
		self.assertEqual((o.status, o.payment_status), ("Accepted", "Paid"))
		self.assertTrue(any(c["name"] == o.name for c in kds.board()["cards"]))
		# delivered (KDS taps) → invoiced and already paid by the online payment
		while frappe.db.get_value("Restaurant Order", o.name, "status") != "Delivered":
			kds.advance(o.name)
		inv = frappe.db.get_value("Restaurant Order", o.name, "invoice")
		self.assertEqual(flt(frappe.db.get_value("Sales Invoice", inv, "outstanding_amount")), 0)
		self.assertTrue(frappe.db.exists("Payment Entry", {"mode_of_payment": "Online Payment", "docstatus": 1, "reference_no": o.payment_reference}))

	def test_paid_online_pickup_shows_nothing_to_pay(self):
		from restaurant_os.api import online, payments
		from restaurant_os.api.riders import track

		r = online.place_order(json.dumps({"order_type": "Pickup", "payment": "Online", "customer_name": "Paid Pickup", "phone": "03005556677",
										   "items": [{"item_code": "Chicken Karahi", "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]}))
		self.assertGreater(track(r["tracking_key"])["eta_minutes"], 0)
		payments.mock_pay(r["payment_url"].rsplit("/", 1)[1], "success")
		t = track(r["tracking_key"])
		self.assertEqual((t["payment_status"], t["cod_amount"]), ("Paid", 0))

	def test_assign_rider_from_kds(self):
		from restaurant_os.api import riders as api

		rider = frappe.get_all("Rider", {"branch": masters.BRANCH}, ["name", "user"], limit=1)[0]
		self._as(rider.user, api.set_duty, 1)
		o = api.simulate_delivery_order()
		self.assertTrue(any(r.name == rider.name for r in kds.board()["riders"]))
		kds.assign_rider(o["order"], rider.name)
		card = next(c for c in kds.board()["cards"] if c["name"] == o["order"])
		self.assertEqual(card["rider"], rider.name)

	def test_kds_check_in_and_assign_off_duty_rider(self):
		frappe.db.savepoint("kds_check_in")                 # rider duty states are shared by later tests: undo ours
		try:
			self._check_in_and_assign()
		finally:
			frappe.db.rollback(save_point="kds_check_in")

	def _check_in_and_assign(self):
		riders = frappe.get_all("Rider", {"branch": masters.BRANCH, "disabled": 0}, ["name", "user", "employee"])
		from restaurant_os.api import riders as api

		o = api.simulate_delivery_order()
		for r in riders:                                     # everyone off duty
			if frappe.db.get_value("Rider", r.name, "status") != "Off Duty" and not frappe.db.count("Delivery Assignment", {"rider": r.name, "status": ["in", ["Accepted", "Picked Up"]]}):
				self._as(r.user, api.set_duty, 0)
		off = next(r for r in riders if frappe.db.get_value("Rider", r.name, "status") == "Off Duty")
		self.assertIn(off.name, [r.name for r in kds.board()["riders"]], "off-duty riders are listed on the KDS")
		with self.assertRaises(frappe.ValidationError):
			kds.assign_rider(o["order"], off.name)
		kds.assign_rider(o["order"], off.name, check_in=1)
		self.assertNotEqual(frappe.db.get_value("Rider", off.name, "status"), "Off Duty")
		self.assertEqual(frappe.db.get_value("Restaurant Order", o["order"], "rider"), off.name)
		self.assertTrue(frappe.db.exists("Employee Checkin", {"employee": off.employee, "log_type": "IN"}))

	# ---------------------------------------------------------------- phase 9: promotions, loyalty, reviews, campaigns
	def _deliver(self, order):
		while frappe.db.get_value("Restaurant Order", order, "status") not in ("Delivered", "Completed"):
			kds.advance(order)
		return frappe.db.get_value("Restaurant Order", order, "invoice")

	def test_online_offers_and_coupon(self):
		from restaurant_os.api import online

		cart = [{"item_code": "Chicken Karahi", "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]
		q = online.quote(json.dumps({"order_type": "Pickup", "items": cart, "coupon_code": "WELCOME10"}))
		self.assertIn("Raita", [l["item_code"] for l in q["lines"] if l.get("is_free_item")], "free raita offer online")
		self.assertEqual(q["coupon"], "WELCOME10")
		self.assertGreater(q["discount"], 0)
		used = frappe.db.get_value("POS Coupon", "WELCOME10", "used") or 0
		r = online.place_order(json.dumps({"order_type": "Pickup", "items": cart, "coupon_code": "WELCOME10", "customer_name": "Offer Diner", "phone": "03001110000"}))
		o = frappe.get_doc("Restaurant Order", r["order"])
		self.assertTrue(any(i.item_code == "Raita" and i.is_free_item for i in o.items), "the kitchen makes the free raita")
		inv = self._deliver(o.name)
		self.assertAlmostEqual(flt(frappe.db.get_value("Sales Invoice", inv, "rounded_total")), q["total"], places=2, msg="quote = invoice with offers")
		self.assertEqual(frappe.db.get_value("POS Coupon", "WELCOME10", "used"), used + 1, "coupon use counted")

	def test_loyalty_earn_and_redeem_online(self):
		from restaurant_os.api import online
		from restaurant_os.services.loyalty import balance

		cart = [{"item_code": "Mutton Chops", "qty": 2, "modifiers": [{"group": "Spice Level", "name": "Hot"}]}]
		r = online.place_order(json.dumps({"order_type": "Pickup", "items": cart, "customer_name": "Points Diner", "phone": "03002223344"}))
		customer = frappe.db.get_value("Restaurant Order", r["order"], "customer")
		self.assertEqual(frappe.db.get_value("Customer", customer, "loyalty_program"), "Saffron Rewards")
		self._deliver(r["order"])
		earned = balance(customer)["points"]
		self.assertGreater(earned, 30, "≈ 1 point per Rs 100")
		self.assertEqual(online.loyalty("03002223344")["points"], earned)
		q = online.quote(json.dumps({"order_type": "Pickup", "items": cart, "phone": "03002223344", "redeem_points": 20}))
		self.assertEqual((q["points"], q["points_value"]), (20, 20))
		r2 = online.place_order(json.dumps({"order_type": "Pickup", "items": cart, "customer_name": "Points Diner", "phone": "03002223344", "redeem_points": 20}))
		inv = self._deliver(r2["order"])
		si = frappe.db.get_value("Sales Invoice", inv, ["redeem_loyalty_points", "loyalty_points", "outstanding_amount", "rounded_total"], as_dict=True)
		self.assertEqual((si.redeem_loyalty_points, si.loyalty_points), (1, 20))
		self.assertAlmostEqual(flt(si.outstanding_amount), flt(si.rounded_total) - 20, places=2)

	def test_review_and_low_rating_alert(self):
		from restaurant_os.api import online
		from restaurant_os.api.riders import track

		r = online.place_order(json.dumps({"order_type": "Pickup", "customer_name": "Review Diner", "phone": "03004445555",
										   "items": [{"item_code": "Nihari", "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]}))
		with self.assertRaises(frappe.ValidationError):
			online.review(r["tracking_key"], json.dumps({"rating_overall": 5}))   # not delivered yet
		self._deliver(r["order"])
		self.assertTrue(track(r["tracking_key"])["can_review"])
		rv = online.review(r["tracking_key"], json.dumps({"rating_overall": 1, "rating_food": 2, "comment": "Cold food",
														  "items": [{"item_code": "Nihari", "rating": 1}]}))["review"]
		doc = frappe.get_doc("Order Review", rv)
		self.assertEqual((doc.rating_overall, doc.alerted, len(doc.items)), (1, 1, 1))
		self.assertTrue(frappe.db.exists("Notification Log", {"document_type": "Order Review", "document_name": rv}))
		self.assertEqual(frappe.db.get_value("Restaurant Order", r["order"], "rating"), 1)
		with self.assertRaises(frappe.ValidationError):
			online.review(r["tracking_key"], json.dumps({"rating_overall": 5}))   # once per order

	def test_review_request_and_campaign(self):
		from restaurant_os.api import online
		from restaurant_os.services.reviews import request_due

		r = online.place_order(json.dumps({"order_type": "Pickup", "customer_name": "Lapsed Diner", "phone": "03006667777",
										   "items": [{"item_code": "Chicken Korma", "qty": 1, "modifiers": [{"group": "Spice Level", "name": "Mild"}]}]}))
		self._deliver(r["order"])
		frappe.db.set_value("Restaurant Order", r["order"], {"completed_at": frappe.utils.add_to_date(None, hours=-2),
															 "placed_at": frappe.utils.add_to_date(None, days=-45)})
		self.assertGreaterEqual(request_due(), 1)
		self.assertTrue(frappe.db.get_value("Restaurant Order", r["order"], "review_requested_at"))
		c = frappe.get_doc({"doctype": "Restaurant Campaign", "title": "We miss you", "segment": "Lapsed customers", "lapsed_days": 30,
							"pos_coupon": "WELCOME10", "message": "Hi {name}, use {coupon} at {restaurant}: {link}"}).insert()
		self.assertGreaterEqual(online.campaign_preview(c.name)["count"], 1)
		res = online.send_campaign(c.name)
		self.assertGreaterEqual(res["sent"], 1)
		self.assertEqual(frappe.db.get_value("Restaurant Campaign", c.name, "status"), "Sent")

	# ---------------------------------------------------------------- phase 11: hardening
	def test_counter_access_guard(self):
		for user in ("Guest", "rider1@saffrongrill.example"):
			with self.assertRaises(frappe.PermissionError, msg=user):
				self._as(user, pos.get_context)
			with self.assertRaises(frappe.PermissionError, msg=user):
				self._as(user, pos.preview, json.dumps(self.cart([("Chicken Tikka", 1)])))
		self.assertTrue(self._as("cashier@saffrongrill.example", pos.get_context)["profiles"])

	def test_manager_approval_for_discount_and_return(self):
		from frappe.utils.password import update_password

		from restaurant_os.services.approvals import ApprovalRequired

		cashier, manager = "cashier@saffrongrill.example", "manager@saffrongrill.example"
		frappe.db.savepoint("approval")
		try:
			update_password(manager, "Mgr-test-123")
			frappe.set_user(cashier)
			_close_open_shifts_for(cashier)
			pos.open_shift(PROFILE, OPENING)
			cart = self.cart([("Chicken Tikka", 2)], discount_percentage=5)
			self.assertFalse(pos.preview(json.dumps(cart))["needs_approval"], "5% is within the cashier's limit")
			cart = self.cart([("Chicken Tikka", 2)], discount_percentage=25)
			p = pos.preview(json.dumps(cart))
			self.assertTrue(p["needs_approval"])
			self.assertAlmostEqual(p["manual_discount_pct"], 25, delta=0.5)
			pay = {**cart, "payments": [{"mode_of_payment": "Cash", "amount": p["rounded_total"]}]}
			with self.assertRaises(ApprovalRequired):
				pos.submit_invoice(json.dumps(pay))
			with self.assertRaises(ApprovalRequired):
				pos.submit_invoice(json.dumps({**pay, "approval": {"user": manager, "password": "wrong"}}))
			with self.assertRaises(ApprovalRequired):     # a cashier can't approve
				pos.submit_invoice(json.dumps({**pay, "approval": {"user": cashier, "password": "x"}}))
			r = pos.submit_invoice(json.dumps({**pay, "approval": {"user": manager, "password": "Mgr-test-123"}}))
			self.assertTrue(frappe.db.exists("Comment", {"reference_name": r["name"], "content": ["like", "%approved by%"]}))
			with self.assertRaises(ApprovalRequired):
				pos.return_invoice(r["name"])
			ret = pos.return_invoice(r["name"], approval=json.dumps({"user": manager, "password": "Mgr-test-123"}))
			self.assertLess(flt(ret["grand_total"]), 0)
			frappe.set_user(manager)                       # a manager returns without a second sign-in
			self.assertTrue(frappe.db.get_value(self.dt, r["name"], "docstatus") == 1)
		finally:
			frappe.set_user("Administrator")
			frappe.cache.delete_value(f"ros:approval_fail:{cashier}")
			frappe.db.rollback(save_point="approval")

	def test_mock_webhooks_reject_strangers(self):
		from restaurant_os.integrations.payments.gateway import gateway

		self.assertFalse(gateway().verify_webhook({}, b"{}"), "the mock gateway has no webhook")
		frappe.set_user("Guest")
		try:
			from restaurant_os.integrations.aggregators.foodpanda import adapter

			self.assertFalse(adapter().verify({}, b"{}"), "mock Foodpanda webhook needs a signed-in manager")
		finally:
			frappe.set_user("Administrator")

	def test_cashier_runs_tables_and_phone_orders(self):
		"""Counter staff (Sales User) must be able to seat, send, settle and take phone orders — not only managers."""
		from restaurant_os.api import riders as api

		cashier = "cashier@saffrongrill.example"
		frappe.db.savepoint("cashier_tables")
		try:
			frappe.set_user(cashier)
			_close_open_shifts_for(cashier)
			pos.open_shift(PROFILE, OPENING)
			t = frappe.db.get_value("Restaurant Table", {"branch": masters.BRANCH, "status": "Free"}, "name")
			tables.seat(t, 2)
			tables.send(t, json.dumps([{"item_code": "Chicken Tikka", "qty": 1}]))
			bill = tables.view(t)["bill"]
			tables.settle(t, json.dumps([{"mode_of_payment": "Cash", "amount": bill["rounded_total"]}]))
			tables.end_sitting(t)
			self.assertEqual(frappe.db.get_value("Restaurant Table", t, "status"), "Free")
			o = api.new_delivery_order(json.dumps({"customer_name": "Phone Diner", "phone": "03001234567", "address": "Gulberg",
												   "items": [{"item_code": "Chicken Tikka", "qty": 1}]}))
			self.assertTrue(o["order"])
		finally:
			frappe.set_user("Administrator")
			frappe.db.rollback(save_point="cashier_tables")

	def test_cashier_closes_own_shift(self):
		"""POS Awesome grants Sales User nothing on the shift doctypes; restaurant_os adds what a cashier needs."""
		from restaurant_os.setup.install import shift_permissions

		cashier = "cashier@saffrongrill.example"
		frappe.db.savepoint("cashier_close")
		try:
			shift_permissions()
			frappe.set_user(cashier)
			_close_open_shifts_for(cashier)
			pos.open_shift(PROFILE, OPENING)
			self.pay([("Chicken Tikka", 1)])
			counted = {m["mode_of_payment"]: m["expected"] for m in pos.shift_summary()["modes"]}
			res = pos.close_shift(json.dumps(counted))
			self.assertTrue(res)
			self.assertFalse(pos._open_shift(PROFILE), "the cashier's shift is closed")
		finally:
			frappe.set_user("Administrator")
			frappe.db.rollback(save_point="cashier_close")

	def test_receive_stock_search_finds_ingredients(self):
		"""Receive stock must find raw ingredients, not only the menu's sellable items."""
		items = self._as("cashier@saffrongrill.example", pos.stock_items, PROFILE, "tomato")["items"]
		self.assertIn("Tomato", [i.item_code for i in items])
		self.assertNotIn("Chicken Karahi", [i.item_code for i in pos.stock_items(PROFILE, "karahi")["items"]], "recipe dishes aren't stock")
