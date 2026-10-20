# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt


class RestaurantOrder(Document):
	def before_insert(self):
		from restaurant_os.services.riders import prepare

		prepare(self)                                         # delivery: tracking link, delivery code, who delivers, distance

	def validate(self):
		if not self.items:
			frappe.throw(_("An order needs at least one item."))
		for row in self.items:
			row.amount = flt(row.qty) * flt(row.rate)
			if not row.item_name:
				row.item_name = frappe.get_cached_value("Item", row.item_code, "item_name")
		if self.table and frappe.db.get_value("Restaurant Table", self.table, "branch") != self.branch:
			frappe.throw(_("Table {0} is not in branch {1}.").format(self.table, self.branch))
		if not self.grand_total:
			self.grand_total = sum(flt(r.amount) for r in self.items)

	def on_update(self):
		if self.flags.ros_assign:
			self.flags.ros_assign = False
			from restaurant_os.services.orders import enqueue

			enqueue("restaurant_os.services.riders.auto_assign", order=self.name)
		if self.flags.ros_deduct:
			self.flags.ros_deduct = False
			from restaurant_os.services.orders import enqueue

			enqueue("restaurant_os.services.stock_deduction.post_for_order", order=self.name)
