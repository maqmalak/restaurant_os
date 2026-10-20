# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class RestaurantBranch(Document):
	def validate(self):
		for field in ("store_warehouse", "kitchen_warehouse"):
			wh = self.get(field)
			if wh and frappe.db.get_value("Warehouse", wh, "company") != self.company:
				frappe.throw(_("{0} {1} does not belong to {2}.").format(self.meta.get_label(field), wh, self.company))
		if self.store_warehouse and self.store_warehouse == self.kitchen_warehouse:
			frappe.throw(_("The kitchen and the central store must be different warehouses."))
		if self.cost_center and frappe.db.get_value("Cost Center", self.cost_center, "company") != self.company:
			frappe.throw(_("Cost Center {0} does not belong to {1}.").format(self.cost_center, self.company))
		seen = set()
		for row in self.pos_profiles:
			if row.pos_profile in seen:
				frappe.throw(_("Row {0}: POS Profile {1} is listed twice.").format(row.idx, row.pos_profile))
			seen.add(row.pos_profile)


def branch_for_pos_profile(pos_profile):
	"""The branch a counter belongs to (None when it isn't linked to one)."""
	return frappe.db.get_value("Restaurant Branch POS Profile", {"pos_profile": pos_profile, "parenttype": "Restaurant Branch"}, "parent")
