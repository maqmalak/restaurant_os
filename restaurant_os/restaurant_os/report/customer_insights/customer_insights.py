"""Named customers in the period: orders, spend, average ticket, lifetime value, new vs returning (walk-in / aggregator excluded)."""

from frappe import _

from restaurant_os.services.analytics import customers


def execute(filters=None):
	c = lambda fn, label, ft="Currency", w=110: {"fieldname": fn, "label": _(label), "fieldtype": ft, "width": w}
	cols = [c("customer", "Customer", "Link", 160) | {"options": "Customer"}, c("customer_name", "Name", "Data", 160), c("type", "Type", "Data", 90),
			c("orders", "Orders", "Int", 70), c("spend", "Spend"), c("avg_ticket", "Avg Ticket"), c("first_order", "First Order", "Date", 100),
			c("last_order", "Last Order", "Date", 100), c("lifetime_orders", "Lifetime Orders", "Int", 110), c("ltv", "Lifetime Value")]
	data = customers(filters or {})
	msg = (f"{data['new']} new, {data['returning']} returning. Retention: {data['retained']} of {data['previous_customers']} customers "
		   f"from the previous period came back ({data['retention_pct']:.0f}%).")
	return cols, data["rows"], msg
