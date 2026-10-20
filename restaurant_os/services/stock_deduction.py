"""Recipe stock deduction: a Restaurant Order's ingredients leave the branch kitchen (Stock Entry, Material Issue).

Each non-stock menu item with a default BOM consumes BOM qty × ordered qty of every ingredient (BOM stock qty / BOM
quantity, so recipes written per 1 plate or per 10 plates both work). Stock items sold as they are (bottled drinks) are
already issued by the invoice itself (update_stock) and are skipped. Runs as a background job; a failure (e.g. not
enough stock) is kept on the order (`stock_status` Failed + the reason) and logged, never raised into the sale.
"""

import frappe
from frappe.utils import flt, nowdate


def recipe_lines(order):
	"""{ingredient: (qty in stock UOM, stock UOM)} for an order."""
	need = {}
	for row in order.items:
		if row.kds_status == "Void" or row.stock_posted or frappe.get_cached_value("Item", row.item_code, "is_stock_item"):
			continue
		bom = frappe.db.get_value("BOM", {"item": row.item_code, "is_default": 1, "is_active": 1, "docstatus": 1}, ["name", "quantity"], as_dict=True)
		if not bom:
			continue
		for b in frappe.get_all("BOM Item", {"parent": bom.name, "parenttype": "BOM"}, ["item_code", "stock_qty", "stock_uom"]):
			qty = flt(b.stock_qty) / (flt(bom.quantity) or 1) * flt(row.qty)
			have = need.get(b.item_code, (0, b.stock_uom))
			need[b.item_code] = (have[0] + qty, b.stock_uom)
	return need


def post_for_order(order):
	doc = frappe.get_doc("Restaurant Order", order)
	if doc.status in ("Cancelled", "Rejected"):
		return None
	need = recipe_lines(doc)                                  # lines not issued yet (a dine-in table may add rounds)
	if not need:
		if doc.stock_status != "Posted":
			doc.db_set({"stock_status": "Not Needed", "stock_error": None})
		return doc.stock_entry
	warehouse = frappe.db.get_value("Restaurant Branch", doc.branch, "kitchen_warehouse")
	frappe.db.savepoint("ros_stock")                          # inline runs share the caller's transaction (KDS bump…)
	try:
		se = frappe.get_doc({
			"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "purpose": "Material Issue", "company": doc.company,
			"posting_date": nowdate(), "from_warehouse": warehouse, "ros_source": "Recipe",
			"ros_reference_doctype": "Restaurant Order", "ros_reference_name": doc.name,
			"remarks": f"Recipe ingredients for Restaurant Order {doc.name} (#{doc.order_no}){f' — {doc.invoice}' if doc.invoice else ''}",
			"items": [{"item_code": code, "qty": flt(qty, 6), "uom": uom, "stock_uom": uom, "conversion_factor": 1, "s_warehouse": warehouse,
					   "cost_center": frappe.db.get_value("Restaurant Branch", doc.branch, "cost_center")}
					  for code, (qty, uom) in sorted(need.items())],
		})
		se.flags.ignore_permissions = True
		se.insert()
		se.submit()
	except Exception as e:
		frappe.db.rollback(save_point="ros_stock")
		frappe.clear_messages()
		reason = frappe.utils.strip_html(str(e))[:500]
		frappe.db.set_value("Restaurant Order", doc.name, {"stock_status": "Failed", "stock_error": reason})
		frappe.log_error(title=f"Recipe stock for {doc.name} failed", message=frappe.get_traceback())
		return None
	for row in doc.items:
		if row.kds_status != "Void" and not row.stock_posted:
			row.db_set("stock_posted", 1)
	doc.db_set({"stock_status": "Posted", "stock_entry": se.name, "stock_error": None})
	from restaurant_os.services.orders import publish

	publish(doc, "stock")
	return se.name


def retry_failed():
	"""Scheduler: try failed deductions again (stock may have arrived since)."""
	for name in frappe.get_all("Restaurant Order", {"stock_status": "Failed", "status": ["in", ["Completed", "Delivered"]]}, pluck="name", limit=50):
		post_for_order(name)
