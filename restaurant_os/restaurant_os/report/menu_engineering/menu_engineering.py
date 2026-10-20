"""Menu engineering (Kasavana–Smith): each dish's popularity and contribution margin → Star / Plowhorse / Puzzle / Dog."""

from frappe import _

from restaurant_os.services.analytics import menu_engineering


def execute(filters=None):
	c = lambda fn, label, ft="Currency", w=110: {"fieldname": fn, "label": _(label), "fieldtype": ft, "width": w}
	cols = [c("item_name", "Dish", "Data", 180), c("item_group", "Category", "Data", 120), c("qty", "Sold", "Float", 70), c("mix", "Menu Mix %", "Percent", 100),
			c("price", "Avg Price"), c("unit_cost", "Food Cost / Unit"), c("food_cost_pct", "Food Cost %", "Percent", 100), c("cm", "Margin / Unit"),
			c("total_cm", "Total Margin"), c("popularity", "Popularity", "Data", 90), c("profitability", "Profitability", "Data", 100), c("class", "Class", "Data", 100)]
	data = menu_engineering(filters or {})
	msg = (f"Average margin per dish {data['avg_cm']:.0f}; popular = at least {data['popularity_threshold']:.1f}% of dishes sold. "
		   f"Food cost {data['food_cost_pct']:.1f}% of sales.")
	return cols, data["items"], msg
