"""Menu availability: how many portions of each dish the branch kitchen can still make, and sold-out propagation.

A recipe dish (non-stock item with a default BOM) has `min(kitchen qty ÷ qty per portion)` portions over its ingredients;
a stock item sold as it is (bottled drinks) has its kitchen qty. A dish at 0 is sold out: the POS terminal and the table
order screen show it locked (they read it through ERPNext's point_of_sale.get_items, wrapped below), sales of it are
refused when Restaurant Settings → Block Sold-out Items is on, and every change (sold out ↔ back) is pushed to the
aggregators (Foodpanda) and published as `ros_availability`.
"""

import math

import frappe
from frappe import _
from frappe.utils import cint, flt

CACHE = "ros:soldout:{}"


def _kitchen(branch):
	return frappe.get_cached_value("Restaurant Branch", branch, "kitchen_warehouse")


def portions(branch, item_codes=None):
	"""{item_code: portions left} for menu items (recipe dishes and stocked items) in the branch kitchen."""
	wh = _kitchen(branch)
	if not wh:
		return {}
	cond = " and i.name in %(items)s" if item_codes else ""
	items = frappe.db.sql(f"""select i.name, i.is_stock_item from tabItem i where i.is_sales_item = 1 and i.disabled = 0 {cond}""",
						  {"items": list(item_codes or []) or [""]}, as_dict=True)
	stock = dict(frappe.db.sql("select item_code, actual_qty from tabBin where warehouse = %s", wh))
	boms = {}
	recipe_items = [i.name for i in items if not i.is_stock_item]
	if recipe_items:
		for item, ing, qty, bom_qty in frappe.db.sql("""select b.item, bi.item_code, bi.stock_qty, b.quantity from tabBOM b
				join `tabBOM Item` bi on bi.parent = b.name and bi.parenttype = 'BOM'
				where b.item in %s and b.is_default = 1 and b.is_active = 1 and b.docstatus = 1""", (recipe_items,)):
			boms.setdefault(item, []).append((ing, flt(qty) / (flt(bom_qty) or 1)))
	out = {}
	for i in items:
		if i.is_stock_item:
			out[i.name] = max(flt(stock.get(i.name)), 0)
		elif i.name in boms:
			out[i.name] = max(min(math.floor(flt(stock.get(ing)) / per + 1e-9) if per > 0 else 10**6 for ing, per in boms[i.name]), 0)
	return out


def sold_out(branch):
	return sorted(k for k, v in portions(branch).items() if v <= 0)


def check(branch, lines):
	"""Refuse lines the kitchen can't make (Restaurant Settings → Block Sold-out Items)."""
	if not branch or not cint(frappe.db.get_single_value("Restaurant Settings", "block_sold_out")):
		return
	need = {}
	for l in lines:
		need[l["item_code"]] = need.get(l["item_code"], 0) + flt(l.get("qty"))
	left = portions(branch, list(need))
	for code, qty in need.items():
		if code in left and qty > left[code] + 1e-9:
			name = frappe.get_cached_value("Item", code, "item_name")
			frappe.throw(_("{0} is sold out.").format(name) if left[code] <= 0 else _("Only {0} portion(s) of {1} left.").format(int(left[code]), name),
						 title=_("Sold out"))


def refresh(branch):
	"""Recompute the branch's sold-out list; push and publish what changed."""
	now = set(sold_out(branch))
	key = CACHE.format(branch)
	before = frappe.cache.get_value(key)
	frappe.cache.set_value(key, sorted(now))
	if before is None:
		return
	before = set(before)
	changed = {**{i: False for i in now - before}, **{i: True for i in before - now}}
	if not changed:
		return
	frappe.publish_realtime("ros_availability", {"branch": branch, "sold_out": sorted(now), "changed": changed}, after_commit=True)
	try:
		from restaurant_os.integrations.aggregators.foodpanda import adapter

		fp = adapter()
		for item, available in changed.items():
			fp.push_availability(item, available)
	except Exception:
		frappe.log_error(title="Restaurant OS: availability push failed")


def on_bin_update(doc, method=None):
	"""Bin of a branch kitchen changed: refresh that branch's availability once, after the transaction commits."""
	branch = frappe.db.get_value("Restaurant Branch", {"kitchen_warehouse": doc.warehouse}, "name")
	if not branch:
		return
	pending = frappe.local.flags.setdefault("ros_availability", set())
	if branch in pending:
		return
	pending.add(branch)
	frappe.db.after_commit.add(lambda: _refresh_after_commit(branch))


def _refresh_after_commit(branch):
	try:
		refresh(branch)
	finally:
		frappe.local.flags.get("ros_availability", set()).discard(branch)


@frappe.whitelist()
def get_items(start, page_length, price_list, item_group, pos_profile, search_term=""):
	"""ERPNext's point_of_sale.get_items, plus portions left for recipe dishes (`ros_recipe`, `actual_qty`) — the POS
	terminal and table orders lock dishes at 0."""
	from erpnext.selling.page.point_of_sale.point_of_sale import get_items as erpnext_get_items

	res = erpnext_get_items(start, page_length, price_list, item_group, pos_profile, search_term)
	from restaurant_os.restaurant_os.doctype.restaurant_branch.restaurant_branch import branch_for_pos_profile

	branch = branch_for_pos_profile(pos_profile) or frappe.db.get_single_value("Restaurant Settings", "default_branch")
	items = (res or {}).get("items") or []
	if branch and items:
		left = portions(branch, [i["item_code"] for i in items])
		for i in items:
			if i["item_code"] in left and not i.get("is_stock_item"):
				i["ros_recipe"] = 1
				i["actual_qty"] = left[i["item_code"]]
	return res


@frappe.whitelist()
def board(branch: str | None = None) -> dict:
	"""Portions left per menu item for a branch (the KDS "86" list and the admin view)."""
	branch = branch or frappe.db.get_single_value("Restaurant Settings", "default_branch")
	left = portions(branch)
	names = dict(frappe.get_all("Item", {"name": ["in", list(left) or [""]]}, ["name", "item_name"], as_list=True))
	rows = sorted(({"item_code": k, "item_name": names.get(k, k), "portions": v} for k, v in left.items()), key=lambda r: (r["portions"], r["item_name"]))
	return {"branch": branch, "items": rows, "sold_out": [r for r in rows if r["portions"] <= 0]}
