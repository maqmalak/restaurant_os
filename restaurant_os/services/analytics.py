"""Owner analytics: one source for the dashboard and the script reports.

Figures come from Restaurant Orders (every channel, one queue) and their lines — net sales are line amounts before tax,
cancelled orders and voided lines excluded. Food cost of a line = qty × unit cost (default BOM cost per portion for recipe
dishes, warehouse valuation for stock items). Kitchen times come from the line stamps (placed → started → ready), delivery
times from the order (placed → delivered) and Delivery Assignments.
"""

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime, nowdate, time_diff_in_seconds

LIVE = ("Placed", "Accepted", "Preparing", "Ready", "Picked Up", "Out for Delivery")
DEAD = ("Cancelled", "Rejected")
DAY_PARTS = [(6, 11, "Breakfast"), (11, 16, "Lunch"), (16, 19, "Evening"), (19, 23, "Dinner")]
GROUPS = {"Channel": "o.channel", "Order Type": "o.order_type", "Branch": "o.branch", "Item": "it.item_code", "Item Group": "i.item_group",
		  "Hour": "hour(o.placed_at)", "Day Part": "hour(o.placed_at)", "Cashier": "o.owner", "Date": "date(o.placed_at)",
		  "Weekday": "weekday(o.placed_at)"}
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def day_part(hour):
	h = cint(hour)
	return next((name for a, b, name in DAY_PARTS if a <= h < b), "Late Night")


def _filters(f):
	f = frappe._dict(f or {})
	f.from_date = getdate(f.from_date or add_days(nowdate(), -6))
	f.to_date = getdate(f.to_date or nowdate())
	cond, vals = ["o.status not in %(dead)s", "date(o.placed_at) between %(from)s and %(to)s"], {"dead": DEAD, "from": f.from_date, "to": f.to_date}
	if f.branch:
		cond.append("o.branch = %(branch)s"); vals["branch"] = f.branch
	if f.channel:
		cond.append("o.channel = %(channel)s"); vals["channel"] = f.channel
	return f, " and ".join(cond), vals


def unit_costs(item_codes, warehouse=None):
	"""{item: cost per unit}: default BOM cost per portion, else the warehouse / item valuation."""
	codes = list(item_codes) or [""]
	out = dict(frappe.db.sql("""select item, total_cost / quantity from tabBOM where item in %s and is_default = 1 and docstatus = 1""", (codes,)))
	rest = [c for c in codes if c not in out]
	if rest:
		vals = {"c": rest}
		if warehouse:
			out.update(dict(frappe.db.sql("select item_code, valuation_rate from tabBin where item_code in %(c)s and warehouse = %(w)s",
										  {**vals, "w": warehouse})))
		for c, v in frappe.db.sql("select name, valuation_rate from tabItem where name in %(c)s", vals):
			out.setdefault(c, flt(v))
	return {k: flt(v) for k, v in out.items()}


def _lines(where, vals):
	return frappe.db.sql(f"""select o.name as order_name, o.channel, o.order_type, o.branch, o.owner, o.customer, o.placed_at, o.guests,
			it.item_code, it.item_name, i.item_group, it.qty, it.qty * it.rate as amount, it.is_free_item
		from `tabRestaurant Order` o join `tabRestaurant Order Item` it on it.parent = o.name and it.parenttype = 'Restaurant Order'
		join tabItem i on i.name = it.item_code
		where {where} and it.kds_status != 'Void'""", vals, as_dict=True)


# ------------------------------------------------------------------ sales analysis
def sales(filters):
	"""Rows grouped by filters.group_by: orders, qty, net sales, share, avg ticket, food cost, margin."""
	f, where, vals = _filters(filters)
	group = f.group_by if f.group_by in GROUPS else "Channel"
	lines = _lines(where, vals)
	costs = unit_costs({l.item_code for l in lines})
	names = {}
	if group == "Cashier":
		names = dict(frappe.get_all("User", {"name": ["in", list({l.owner for l in lines}) or [""]]}, ["name", "full_name"], as_list=True))
	rows = {}
	for l in lines:
		if group == "Day Part":
			key = day_part(get_datetime(l.placed_at).hour)
		elif group == "Hour":
			key = f"{get_datetime(l.placed_at).hour:02d}:00"
		elif group == "Date":
			key = str(getdate(l.placed_at))
		elif group == "Weekday":
			key = WEEKDAYS[getdate(l.placed_at).weekday()]
		elif group == "Item":
			key = l.item_name
		elif group == "Cashier":
			key = names.get(l.owner) or l.owner
		else:
			key = l[{"Channel": "channel", "Order Type": "order_type", "Branch": "branch", "Item Group": "item_group"}[group]] or "—"
		r = rows.setdefault(key, frappe._dict(group=key, orders=set(), qty=0, net_sales=0, food_cost=0))
		r.orders.add(l.order_name)
		r.qty += flt(l.qty)
		r.net_sales += flt(l.amount)
		r.food_cost += flt(l.qty) * costs.get(l.item_code, 0)
	total = sum(r.net_sales for r in rows.values()) or 1
	out = []
	for r in rows.values():
		n = len(r.orders)
		out.append({"group": r.group, "orders": n, "qty": r.qty, "net_sales": r.net_sales, "share": r.net_sales / total * 100,
					"avg_ticket": r.net_sales / n if n else 0, "food_cost": r.food_cost, "margin": r.net_sales - r.food_cost,
					"food_cost_pct": r.food_cost / r.net_sales * 100 if r.net_sales else 0})
	order = {"Hour": lambda x: x["group"], "Date": lambda x: x["group"], "Day Part": lambda x: [p for *_, p in DAY_PARTS + [(0, 0, "Late Night")]].index(x["group"]),
			 "Weekday": lambda x: WEEKDAYS.index(x["group"])}.get(group, lambda x: -x["net_sales"])
	return sorted(out, key=order)


# ------------------------------------------------------------------ kitchen & delivery performance
def kitchen(filters):
	"""Per station: lines, avg wait (placed → started), cook (started → ready), total (placed → ready), late; plus ticket and
	delivery times and rider performance."""
	f, where, vals = _filters(filters)
	red = cint(frappe.db.get_single_value("Restaurant Settings", "kds_red_minutes")) or 15
	stations = frappe.db.sql(f"""select ifnull(ks.station_name, it.station) as station, count(*) as dishes,
			avg(timestampdiff(second, o.placed_at, it.started_at)) / 60 as wait,
			avg(timestampdiff(second, it.started_at, it.ready_at)) / 60 as cook,
			avg(timestampdiff(second, o.placed_at, it.ready_at)) / 60 as total,
			sum(timestampdiff(second, o.placed_at, it.ready_at) > %(red)s * 60) as late
		from `tabRestaurant Order` o join `tabRestaurant Order Item` it on it.parent = o.name and it.parenttype = 'Restaurant Order'
		left join `tabKitchen Station` ks on ks.name = it.station
		where {where} and it.station is not null and it.ready_at is not null and it.kds_status != 'Void'
		group by it.station order by total desc""", {**vals, "red": red}, as_dict=True)
	tickets = frappe.db.sql(f"""select o.order_type, count(*) as orders,
			avg(timestampdiff(second, o.placed_at, o.ready_at)) / 60 as to_ready,
			avg(timestampdiff(second, o.placed_at, o.completed_at)) / 60 as to_done,
			sum(timestampdiff(second, o.placed_at, o.ready_at) > %(red)s * 60) as late
		from `tabRestaurant Order` o where {where} and o.ready_at is not null group by o.order_type""", {**vals, "red": red}, as_dict=True)
	riders = frappe.db.sql(f"""select r.rider_name as rider, sum(da.status = 'Delivered') as delivered, sum(da.status = 'Rejected') as rejected,
			avg(if(da.status = 'Delivered', da.delivery_minutes, null)) as avg_minutes, avg(if(da.status = 'Delivered', da.distance_km, null)) as avg_km,
			sum(if(da.status = 'Delivered', da.cash_collected, 0)) as cash
		from `tabDelivery Assignment` da join tabRider r on r.name = da.rider join `tabRestaurant Order` o on o.name = da.order
		where {where} group by da.rider order by delivered desc""", vals, as_dict=True)
	sla = frappe.db.sql(f"""select avg(timestampdiff(second, o.placed_at, o.completed_at)) / 60, count(*),
			sum(timestampdiff(minute, o.placed_at, o.completed_at) > ifnull(b.delivery_sla_minutes, 45))
		from `tabRestaurant Order` o join `tabRestaurant Branch` b on b.name = o.branch
		where {where} and o.order_type = 'Delivery' and o.status = 'Delivered'""", vals)[0]
	return {"stations": stations, "tickets": tickets, "riders": riders, "red_minutes": red,
			"delivery": {"avg_minutes": flt(sla[0]), "delivered": cint(sla[1]), "late": cint(sla[2])}}


# ------------------------------------------------------------------ menu engineering
def menu_engineering(filters):
	"""Kasavana–Smith: popularity (share of items sold vs 70% of an even share) × contribution margin (vs the weighted average)."""
	f, where, vals = _filters(filters)
	lines = [l for l in _lines(where, vals) if not l.is_free_item]
	costs = unit_costs({l.item_code for l in lines})
	items = {}
	for l in lines:
		r = items.setdefault(l.item_code, frappe._dict(item_code=l.item_code, item_name=l.item_name, item_group=l.item_group, qty=0, sales=0))
		r.qty += flt(l.qty)
		r.sales += flt(l.amount)
	n = len(items)
	total_qty = sum(r.qty for r in items.values()) or 1
	out = []
	for r in items.values():
		r.unit_cost = costs.get(r.item_code, 0)
		r.price = r.sales / r.qty if r.qty else 0
		r.cm = r.price - r.unit_cost
		r.total_cm = r.cm * r.qty
		r.food_cost_pct = r.unit_cost / r.price * 100 if r.price else 0
		r.mix = r.qty / total_qty * 100
		out.append(r)
	avg_cm = sum(r.total_cm for r in out) / total_qty if out else 0
	pop_threshold = (100 / n) * 0.7 if n else 0
	for r in out:
		hi_pop, hi_cm = r.mix >= pop_threshold, r.cm >= avg_cm
		r.popularity = "High" if hi_pop else "Low"
		r.profitability = "High" if hi_cm else "Low"
		r["class"] = "Star" if hi_pop and hi_cm else "Plowhorse" if hi_pop else "Puzzle" if hi_cm else "Dog"
	return {"items": sorted(out, key=lambda r: -r.total_cm), "avg_cm": avg_cm, "popularity_threshold": pop_threshold,
			"food_cost_pct": sum(r.unit_cost * r.qty for r in out) / (sum(r.sales for r in out) or 1) * 100}


# ------------------------------------------------------------------ customers
def _anonymous():
	"""Walk-in and aggregator customers — not real people to retain."""
	names = set(frappe.get_all("POS Profile", pluck="customer")) | {frappe.db.get_single_value("Restaurant Settings", "aggregator_customer")}
	return [n for n in names if n] or [""]


def customers(filters):
	f, where, vals = _filters(filters)
	vals["anon"] = _anonymous()
	period = frappe.db.sql(f"""select o.customer, count(*) as orders, sum(o.grand_total) as spend, max(o.placed_at) as last_order
		from `tabRestaurant Order` o where {where} and ifnull(o.customer, '') != '' and o.customer not in %(anon)s
		group by o.customer""", vals, as_dict=True)
	names = [r.customer for r in period] or [""]
	life = {r.customer: r for r in frappe.db.sql("""select customer, count(*) as orders, sum(grand_total) as ltv, min(placed_at) as first_order
		from `tabRestaurant Order` where customer in %s and status not in %s group by customer""", (names, DEAD), as_dict=True)}
	cname = dict(frappe.get_all("Customer", {"name": ["in", names]}, ["name", "customer_name"], as_list=True))
	rows = []
	for r in period:
		lt = life.get(r.customer) or frappe._dict(orders=r.orders, ltv=r.spend, first_order=r.last_order)
		new = getdate(lt.first_order) >= f.from_date
		rows.append({"customer": r.customer, "customer_name": cname.get(r.customer, r.customer), "orders": r.orders, "spend": flt(r.spend),
					 "avg_ticket": flt(r.spend) / r.orders if r.orders else 0, "first_order": str(getdate(lt.first_order)),
					 "last_order": str(getdate(r.last_order)), "lifetime_orders": lt.orders, "ltv": flt(lt.ltv), "type": "New" if new else "Returning"})
	span = (f.to_date - f.from_date).days + 1
	prev_from, prev_to = add_days(f.from_date, -span), add_days(f.from_date, -1)
	prev = set(frappe.db.sql_list("""select distinct customer from `tabRestaurant Order` where date(placed_at) between %s and %s
		and status not in %s and ifnull(customer, '') != '' and customer not in %s""", (prev_from, prev_to, DEAD, vals["anon"])))
	now_set = {r["customer"] for r in rows}
	return {"rows": sorted(rows, key=lambda r: -r["spend"]), "new": sum(r["type"] == "New" for r in rows),
			"returning": sum(r["type"] == "Returning" for r in rows), "previous_customers": len(prev),
			"retained": len(prev & now_set), "retention_pct": len(prev & now_set) / len(prev) * 100 if prev else 0,
			"avg_ltv": sum(r["ltv"] for r in rows) / len(rows) if rows else 0}


# ------------------------------------------------------------------ live dashboard
def live(branch=None):
	s = frappe.get_cached_doc("Restaurant Settings")
	branch = branch or s.default_branch
	today, yesterday = getdate(nowdate()), add_days(nowdate(), -1)
	red = cint(s.kds_red_minutes) or 15

	def day(d):
		f = {"branch": branch, "from_date": d, "to_date": d}
		_f, where, vals = _filters(f)
		lines = _lines(where, vals)
		costs = unit_costs({l.item_code for l in lines})
		orders = {l.order_name for l in lines}
		net = sum(flt(l.amount) for l in lines)
		cost = sum(flt(l.qty) * costs.get(l.item_code, 0) for l in lines)
		hours = [0.0] * 24
		for l in lines:
			hours[get_datetime(l.placed_at).hour] += flt(l.amount)
		channels, items = {}, {}
		for l in lines:
			channels[l.channel] = channels.get(l.channel, 0) + flt(l.amount)
			if not l.is_free_item:
				it = items.setdefault(l.item_name, [0, 0])
				it[0] += flt(l.qty); it[1] += flt(l.amount)
		return {"net": net, "orders": len(orders), "avg_ticket": net / len(orders) if orders else 0, "food_cost": cost,
				"food_cost_pct": cost / net * 100 if net else 0, "hours": hours, "channels": channels, "items": items}

	t, y = day(today), day(yesterday)
	open_orders = frappe.db.sql("""select name, order_no, status, channel, order_type, placed_at, table_name, customer_name, grand_total from (
			select name, order_no, status, channel, order_type, placed_at, `table` as table_name, customer_name, grand_total
			from `tabRestaurant Order` where branch = %s and status in %s) x order by placed_at""", (branch, LIVE), as_dict=True)
	now = now_datetime()
	for o in open_orders:
		o.age_minutes = round(time_diff_in_seconds(now, o.placed_at) / 60) if o.placed_at else 0
	kitchen_load = frappe.db.sql("""select ifnull(ks.station_name, '—') as station, sum(it.kds_status = 'Queued') as queued,
			sum(it.kds_status = 'Preparing') as preparing
		from `tabRestaurant Order Item` it join `tabRestaurant Order` o on o.name = it.parent
		left join `tabKitchen Station` ks on ks.name = it.station
		where o.branch = %s and o.status in %s and it.kds_status in ('Queued', 'Preparing') group by it.station order by station""",
								 (branch, LIVE), as_dict=True)
	ticket = frappe.db.sql("""select avg(timestampdiff(second, placed_at, ready_at)) / 60 from `tabRestaurant Order`
		where branch = %s and date(placed_at) = %s and ready_at is not null""", (branch, today))[0][0]
	tables = frappe.db.sql("""select count(*), sum(status = 'Occupied'), sum(if(status = 'Occupied', guests, 0)) from `tabRestaurant Table`
		where branch = %s and disabled = 0""", branch)[0]
	riders = dict(frappe.db.sql("select status, count(*) from tabRider where branch = %s and disabled = 0 group by status", branch))
	kitchen_wh = frappe.db.get_value("Restaurant Branch", branch, "kitchen_warehouse")
	low = frappe.db.sql("""select i.item_name, b.actual_qty, r.warehouse_reorder_level, i.stock_uom from tabBin b join tabItem i on i.name = b.item_code
		join `tabItem Reorder` r on r.parent = i.name and r.warehouse = b.warehouse
		where b.warehouse = %s and b.actual_qty <= r.warehouse_reorder_level order by b.actual_qty / nullif(r.warehouse_reorder_level, 0) limit 10""",
						kitchen_wh, as_dict=True)
	from restaurant_os.services.availability import sold_out

	wastage = flt(frappe.db.sql("""select sum(total_cost) from `tabWastage Log` where branch = %s and docstatus = 1 and posting_date = %s""",
								(branch, today))[0][0])
	alerts = []
	fbr_failed = sum(frappe.db.count(dt, {"docstatus": 1, "fbr_status": "Failed"}) for dt in ("POS Invoice", "Sales Invoice"))
	if fbr_failed:
		alerts.append({"level": "critical", "text": f"{fbr_failed} invoice(s) not accepted by FBR — retried hourly"})
	stock_failed = frappe.db.count("Restaurant Order", {"stock_status": "Failed", "branch": branch})
	if stock_failed:
		alerts.append({"level": "warning", "text": f"{stock_failed} order(s) could not deduct ingredients (stock short)"})
	late = [o for o in open_orders if o.status in ("Placed", "Accepted", "Preparing") and o.age_minutes >= red]
	if late:
		alerts.append({"level": "warning", "text": f"{len(late)} order(s) in the kitchen longer than {red} min"})
	waiting = frappe.db.count("Restaurant Order", {"branch": branch, "status": "Ready", "order_type": "Delivery", "delivery_by": "Own Rider",
												   "rider": ["is", "not set"]})
	if waiting:
		alerts.append({"level": "warning", "text": f"{waiting} delivery order(s) ready with no rider"})
	low_reviews = frappe.db.count("Order Review", {"branch": branch, "status": "New",
												   "rating_overall": ["<=", cint(s.low_rating_alert) or 2]})
	if low_reviews:
		alerts.append({"level": "critical", "text": f"{low_reviews} low rating(s) waiting for a reply — see Reviews"})
	return {
		"branch": branch, "branches": frappe.get_all("Restaurant Branch", {"disabled": 0}, pluck="name"), "now": str(now),
		"today": {k: v for k, v in t.items() if k not in ("hours", "channels", "items")},
		"yesterday": {k: v for k, v in y.items() if k not in ("hours", "channels", "items")},
		"hours": [{"hour": h, "today": t["hours"][h], "yesterday": y["hours"][h]} for h in range(24)],
		"channels": sorted(({"channel": k, "amount": v} for k, v in t["channels"].items()), key=lambda x: -x["amount"]),
		"top_items": sorted(({"item": k, "qty": v[0], "amount": v[1]} for k, v in t["items"].items()), key=lambda x: -x["amount"])[:8],
		"open": {"count": len(open_orders), "late": len(late), "by_status": _count(open_orders, "status"), "by_channel": _count(open_orders, "channel"),
				 "orders": open_orders[-10:]},
		"kitchen_load": kitchen_load, "avg_ticket_minutes": flt(ticket), "red_minutes": red,
		"tables": {"total": cint(tables[0]), "occupied": cint(tables[1]), "guests": cint(tables[2])},
		"riders": {"available": riders.get("Available", 0), "on_delivery": riders.get("On Delivery", 0), "off_duty": riders.get("Off Duty", 0)},
		"deliveries": {"on_road": frappe.db.count("Restaurant Order", {"branch": branch, "status": ["in", ["Picked Up", "Out for Delivery"]]}),
					   "waiting_rider": waiting},
		"low_stock": low, "sold_out": sold_out(branch), "wastage_today": wastage, "alerts": alerts,
		"reviews": _reviews(branch),
	}


def _reviews(branch):
	since = add_days(nowdate(), -7)
	avg, count = frappe.db.sql("""select avg(rating_overall), count(*) from `tabOrder Review` where branch = %s and date(creation) >= %s""",
							   (branch, since))[0]
	recent = frappe.get_all("Order Review", {"branch": branch}, ["name", "order", "customer_name", "rating_overall", "comment", "channel", "status", "creation"],
							order_by="creation desc", limit=5)
	for r in recent:
		r.creation = str(r.creation)
	low = frappe.db.count("Order Review", {"branch": branch, "status": "New",
											"rating_overall": ["<=", cint(frappe.db.get_single_value("Restaurant Settings", "low_rating_alert")) or 2]})
	return {"avg_7d": round(flt(avg), 1), "count_7d": cint(count), "recent": recent, "open_low": low}


def _count(rows, key):
	out = {}
	for r in rows:
		out[r[key]] = out.get(r[key], 0) + 1
	return out
