"""Procurement automation: reorder levels → Material Requests → one draft Purchase Order per preferred supplier.

ERPNext's own daily job (`erpnext.stock.reorder_item.reorder_item`, on when Stock Settings → auto_indent) raises the
Material Requests: Purchase for the central store, Transfer for the kitchens. `purchase_orders_from_requests` then turns
every submitted, still-pending Purchase request into draft POs grouped by each item's default supplier (Item Defaults),
for a buyer to review and submit. Items without a default supplier stay on the request.
"""

import frappe
from frappe.utils import flt


def purchase_orders_from_requests(company=None):
	from erpnext.stock.doctype.material_request.material_request import get_item_default_suppliers, make_purchase_orders_by_supplier

	filters = {"docstatus": 1, "material_request_type": "Purchase", "status": ["in", ["Pending", "Partially Ordered"]]}
	if company:
		filters["company"] = company
	made = []
	for mr in frappe.get_all("Material Request", filters, pluck="name", order_by="creation"):
		rows = [r for r in get_item_default_suppliers(mr) if r.get("supplier") and flt(r.get("pending_qty")) > 0]
		if not rows:
			continue
		try:
			made += make_purchase_orders_by_supplier(mr, [{"material_request_item": r["material_request_item"], "item_code": r["item_code"],
														   "supplier": r["supplier"], "qty": r["pending_qty"]} for r in rows]) or []
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"Restaurant OS: PO from {mr} failed")
	return made


def daily():
	"""Scheduler (daily, after ERPNext's reorder job has raised the requests)."""
	if frappe.db.get_single_value("Stock Settings", "auto_indent"):
		purchase_orders_from_requests(frappe.db.get_single_value("Restaurant Settings", "company"))


def run():
	"""`bench ros-procure`: reorder now (ERPNext's reorder job), then draft the purchase orders."""
	from erpnext.stock.reorder_item import reorder_item

	reorder_item()
	frappe.db.commit()
	pos = purchase_orders_from_requests(frappe.db.get_single_value("Restaurant Settings", "company"))
	print(f"ros-procure: {len(pos)} draft purchase order(s): {', '.join(pos) or '—'}")
