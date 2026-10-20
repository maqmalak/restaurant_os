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
		self.assertEqual((order.channel, order.order_type, order.status), ("Foodpanda", "Delivery", "Accepted"))
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
