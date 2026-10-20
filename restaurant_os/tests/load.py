"""Load test of the hot paths, in-process, inside one transaction that is rolled back (the demo data stays as it was).

    bench --site restaurant.localhost execute restaurant_os.tests.load.run --kwargs '{"orders": 60}'

Times each call (p50 / p95 / max, ms) against the spec's budgets: an order is on the KDS < 1 s after it is placed, and the
POS checkout feels instant (< 300 ms server time). It measures the application (Python + MariaDB), not the network or the
web server — `bench serve` is a single-threaded dev server; production runs gunicorn workers behind nginx (docs/SETUP.md).
"""

import json
import random
import statistics
import time

import frappe
from frappe.utils import flt

BUDGET_MS = {"pos.submit_invoice": 300, "pos.preview": 300, "online.place_order → on KDS": 1000, "kds.board": 1000,
			 "kds.advance": 300, "online.quote": 500, "online.menu": 500, "riders.track": 300}


def _timed(stats, name, fn, *a, **kw):
	t0 = time.perf_counter()
	out = fn(*a, **kw)
	stats.setdefault(name, []).append((time.perf_counter() - t0) * 1000)
	return out


def _pct(xs, p):
	xs = sorted(xs)
	return xs[min(len(xs) - 1, int(round(p / 100 * (len(xs) - 1))))]


def run(orders: int = 60, seed: int = 7):
	from frappe.rate_limiter import rate_limit  # noqa: F401  (guest endpoints are called directly: no rate limit here)

	from restaurant_os.api import kds, online, pos
	from restaurant_os.api.riders import track
	from restaurant_os.setup import masters

	random.seed(seed)
	frappe.set_user("Administrator")
	frappe.flags.in_test = True                               # no real realtime fan-out to browsers during the run
	stats = {}
	menu = online.menu()
	dishes = [i for i in menu["items"] if not i["sold_out"] and flt(i["price"]) >= 400]   # mains: carts clear the minimum order
	shift = pos._open_shift(masters.PROFILE)
	try:
		if not shift:
			pos.open_shift(masters.PROFILE, json.dumps([{"mode_of_payment": "Cash", "opening_amount": 5000}]))
		for n in range(int(orders)):
			# a counter sale
			items = [{"item_code": d["item_code"], "qty": random.choice([1, 1, 2])} for d in random.sample(dishes, 2)]
			p = _timed(stats, "pos.preview", pos.preview, json.dumps({"pos_profile": masters.PROFILE, "items": items}))
			_timed(stats, "pos.submit_invoice", pos.submit_invoice, json.dumps({"pos_profile": masters.PROFILE, "items": items,
				"payments": [{"mode_of_payment": "Cash", "amount": flt(p["rounded_total"])}]}))
			# an online order: quote, place, and how long until the kitchen screen has it
			cart = [{"item_code": d["item_code"], "qty": 1, "modifiers": _defaults(d)} for d in random.sample(dishes, 2)]
			body = {"order_type": random.choice(["Delivery", "Pickup"]), "items": cart, "customer_name": f"Load {n}",
					"phone": f"0300{n:07d}", "address": "Gulberg III", "lat": 31.52, "lng": 74.355}
			_timed(stats, "online.quote", online.quote, json.dumps(body))
			t0 = time.perf_counter()
			r = online.place_order(json.dumps(body))
			board = _timed(stats, "kds.board", kds.board)
			assert any(c["name"] == r["order"] for c in board["cards"]), "order missing on the KDS"
			stats.setdefault("online.place_order → on KDS", []).append((time.perf_counter() - t0) * 1000)
			_timed(stats, "kds.advance", kds.advance, r["order"])
			_timed(stats, "riders.track", track, r["tracking_key"])
			if n % 10 == 0:
				_timed(stats, "online.menu", online.menu)
	finally:
		frappe.db.rollback()                                  # leave the site exactly as it was
		frappe.flags.in_test = False
	return report(stats, orders)


def _defaults(d):
	return [{"group": g["group"], "name": g["options"][0]["name"]} for g in d.get("modifiers") or [] if g.get("required") and g.get("options")]


def report(stats, orders):
	rows, fails = [], []
	for name, xs in stats.items():
		row = {"call": name, "n": len(xs), "p50_ms": round(statistics.median(xs), 1), "p95_ms": round(_pct(xs, 95), 1),
			   "max_ms": round(max(xs), 1), "budget_ms": BUDGET_MS.get(name)}
		row["ok"] = row["budget_ms"] is None or row["p95_ms"] <= row["budget_ms"]
		if not row["ok"]:
			fails.append(name)
		rows.append(row)
	rows.sort(key=lambda r: -r["p95_ms"])
	print(f"\nRestaurant OS load test — {orders} rounds (1 counter sale + 1 online order each), rolled back\n")
	print(f"{'call':32} {'n':>4} {'p50':>8} {'p95':>8} {'max':>8} {'budget':>8}")
	for r in rows:
		print(f"{r['call']:32} {r['n']:>4} {r['p50_ms']:>8} {r['p95_ms']:>8} {r['max_ms']:>8} {str(r['budget_ms'] or '—'):>8} {'✓' if r['ok'] else '✗ over'}")
	print("\nAll within budget." if not fails else f"\nOver budget (p95): {', '.join(fails)}")
	return {"rows": rows, "over_budget": fails}
