from frappe import _


def get_data():
	return {
		"fieldname": "branch",
		"internal_links": {"POS Profile": ["pos_profiles", "pos_profile"], "Warehouse": "kitchen_warehouse", "Cost Center": "cost_center"},
		"transactions": [
			{"label": _("Orders"), "items": ["Restaurant Order", "Delivery Assignment"]},
			{"label": _("Kitchen & Floor"), "items": ["Kitchen Station", "Floor Area", "Restaurant Table"]},
			{"label": _("People"), "items": ["Rider"]},
			{"label": _("Stock"), "items": ["Wastage Log", "Warehouse"]},
			{"label": _("Setup"), "items": ["POS Profile", "Cost Center"]},
		],
	}
