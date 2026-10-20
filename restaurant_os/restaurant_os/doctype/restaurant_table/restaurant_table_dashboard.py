from frappe import _


def get_data():
	return {"fieldname": "table", "internal_links": {"Floor Area": "floor_area", "Restaurant Branch": "branch"},
			"transactions": [{"label": _("Orders"), "items": ["Restaurant Order"]}, {"label": _("Related"), "items": ["Floor Area", "Restaurant Branch"]}]}
