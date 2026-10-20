# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document


class RestaurantSettings(Document):
	def validate(self):
		if self.kds_red_minutes and self.kds_amber_minutes and self.kds_red_minutes <= self.kds_amber_minutes:
			frappe.throw(_("Red must come after amber on the KDS."))
		seen = set()
		for row in self.payment_modes:
			if row.mode_of_payment in seen:
				frappe.throw(_("Row {0}: {1} is listed twice.").format(row.idx, row.mode_of_payment))
			seen.add(row.mode_of_payment)

	def on_update(self):
		from restaurant_os.services.settings_sync import sync

		sync(self)                                            # tax template, invoice mode, payment modes → every counter
