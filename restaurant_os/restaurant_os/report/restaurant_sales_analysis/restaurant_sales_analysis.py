"""Sales by channel, order type, branch, item, category, hour, day part, weekday, date or cashier (net, before tax)."""

from frappe import _

from restaurant_os.services.analytics import sales


def execute(filters=None):
	f = filters or {}
	c = lambda fn, label, ft="Currency", w=120: {"fieldname": fn, "label": _(label), "fieldtype": ft, "width": w}
	cols = [c("group", f.get("group_by") or "Channel", "Data", 200), c("orders", "Orders", "Int", 80), c("qty", "Qty", "Float", 80),
			c("net_sales", "Net Sales"), c("share", "Share %", "Percent", 90), c("avg_ticket", "Avg Ticket"), c("food_cost", "Food Cost"),
			c("food_cost_pct", "Food Cost %", "Percent", 100), c("margin", "Gross Margin")]
	rows = sales(f)
	chart = {"data": {"labels": [r["group"] for r in rows][:20], "datasets": [{"name": _("Net Sales"), "values": [round(r["net_sales"]) for r in rows][:20]}]},
			 "type": "bar"}
	return cols, rows, None, chart
