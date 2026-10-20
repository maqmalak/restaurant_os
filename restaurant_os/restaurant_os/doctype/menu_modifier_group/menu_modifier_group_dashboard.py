from frappe import _


def get_data():
	return {"fieldname": "menu_modifier_group", "internal_links": {"Item": ["items", "item"]},
			"transactions": [{"label": _("Menu Items"), "items": ["Item"]}]}
