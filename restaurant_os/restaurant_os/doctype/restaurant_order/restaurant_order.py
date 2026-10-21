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
		self._keep_stock_marks()

	def _keep_stock_marks(self):
		"""Ingredient issue is written with db_set in the background (services.stock_deduction). A copy of the order loaded
		before that and saved after (rider app, KDS) must not undo it — or the next status issues the recipe again."""
		if self.is_new() or self.flags.ros_stock_reset:
			return
		posted = set(frappe.get_all("Restaurant Order Item", {"parent": self.name, "parenttype": self.doctype, "stock_posted": 1}, pluck="name"))
		for row in self.items:
			if row.name in posted:
				row.stock_posted = 1
		db = frappe.db.get_value(self.doctype, self.name, ["stock_status", "stock_entry"], as_dict=True)
		if db and db.stock_entry and not self.stock_entry:
			self.stock_entry = db.stock_entry
		if db and db.stock_status == "Posted" and self.stock_status != "Posted":
			self.stock_status, self.stock_error = "Posted", None

	def on_update(self):
		if self.status in ("Delivered", "Completed", "Cancelled", "Rejected", "Returned") and self.has_value_changed("status"):
			from restaurant_os.services.riders import close_assignments

			close_assignments(self, skip=self.flags.ros_rider_assignment)
		if self.flags.ros_assign:
			self.flags.ros_assign = False
			from restaurant_os.services.orders import enqueue

			enqueue("restaurant_os.services.riders.auto_assign", order=self.name)
		if self.flags.ros_deduct:
			self.flags.ros_deduct = False
			from restaurant_os.services.orders import enqueue

			enqueue("restaurant_os.services.stock_deduction.post_for_order", order=self.name)
