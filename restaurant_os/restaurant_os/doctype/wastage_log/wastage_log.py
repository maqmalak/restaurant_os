# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class WastageLog(Document):
	"""Food thrown away: valued at the warehouse's rate and issued out of stock (Material Issue) on submit."""

	def validate(self):
		if not self.warehouse:
			self.warehouse = frappe.db.get_value("Restaurant Branch", self.branch, "kitchen_warehouse")
		self.company = self.company or frappe.db.get_value("Restaurant Branch", self.branch, "company")
		if frappe.db.get_value("Warehouse", self.warehouse, "company") != self.company:
			frappe.throw(_("Warehouse {0} is not in {1}.").format(self.warehouse, self.company))
		for row in self.items:
			if flt(row.qty) <= 0:
				frappe.throw(_("Row {0}: quantity must be positive.").format(row.idx))
			if not frappe.get_cached_value("Item", row.item_code, "is_stock_item"):
				frappe.throw(_("Row {0}: {1} is not a stock item — log its ingredients instead.").format(row.idx, row.item_code))
			row.uom = row.uom or frappe.get_cached_value("Item", row.item_code, "stock_uom")
			row.valuation_rate = flt(frappe.db.get_value("Bin", {"item_code": row.item_code, "warehouse": self.warehouse}, "valuation_rate")) \
				or flt(frappe.get_cached_value("Item", row.item_code, "valuation_rate"))
			row.amount = flt(row.qty) * flt(row.valuation_rate)
		self.total_cost = sum(flt(r.amount) for r in self.items)

	def on_submit(self):
		se = frappe.get_doc({
			"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "purpose": "Material Issue", "company": self.company,
			"posting_date": self.posting_date, "from_warehouse": self.warehouse, "ros_source": "Wastage",
			"ros_reference_doctype": "Wastage Log", "ros_reference_name": self.name,
			"remarks": f"Wastage ({self.reason}) — {self.name}{f': {self.remarks}' if self.remarks else ''}",
			"items": [{"item_code": r.item_code, "qty": r.qty, "uom": r.uom, "stock_uom": r.uom, "conversion_factor": 1,
					   "s_warehouse": self.warehouse, "cost_center": frappe.db.get_value("Restaurant Branch", self.branch, "cost_center")}
					  for r in self.items],
		})
		se.flags.ignore_permissions = True
		se.insert()
		se.submit()
		self.db_set("stock_entry", se.name)

	def on_cancel(self):
		if self.stock_entry and frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus") == 1:
			se = frappe.get_doc("Stock Entry", self.stock_entry)
			se.flags.ignore_permissions = True
			se.cancel()
