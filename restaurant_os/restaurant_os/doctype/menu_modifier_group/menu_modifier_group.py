# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class MenuModifierGroup(Document):
	def validate(self):
		if self.max_select and self.min_select > self.max_select:
			frappe.throw(_("Min choices ({0}) can't exceed max choices ({1}).").format(self.min_select, self.max_select))
		if self.required and not self.min_select:
			self.min_select = 1
		if self.max_select and sum(1 for m in self.modifiers if m.is_default) > self.max_select:
			frappe.throw(_("More defaults than the group allows choosing."))
