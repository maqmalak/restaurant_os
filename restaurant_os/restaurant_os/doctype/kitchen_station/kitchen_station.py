# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class KitchenStation(Document):
	pass


def station_for_item(branch, item_code):
	"""The branch's KDS station for a menu item: one listing the item itself wins over one listing its item group."""
	stations = frappe.get_all("Kitchen Station", {"branch": branch, "disabled": 0}, pluck="name")
	if not stations:
		return None
	hit = frappe.db.get_value("Kitchen Station Item", {"parent": ["in", stations], "item": item_code}, "parent")
	if hit:
		return hit
	group = frappe.get_cached_value("Item", item_code, "item_group")
	return frappe.db.get_value("Kitchen Station Item Group", {"parent": ["in", stations], "item_group": group}, "parent")
