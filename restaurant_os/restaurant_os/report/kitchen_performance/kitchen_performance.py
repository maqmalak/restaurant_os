"""Average wait (placed → started), cook (started → ready) and total time per kitchen station, and late lines."""

from frappe import _

from restaurant_os.services.analytics import kitchen


def execute(filters=None):
	c = lambda fn, label, ft="Float", w=120: {"fieldname": fn, "label": _(label), "fieldtype": ft, "width": w, "precision": 1}
	cols = [c("station", "Station", "Data", 180), c("dishes", "Dishes", "Int", 90), c("wait", "Avg Wait (min)"), c("cook", "Avg Cook (min)"),
			c("total", "Avg Total (min)"), c("late", "Late Dishes", "Int", 100)]
	data = kitchen(filters or {})
	return cols, data["stations"], f"Late = more than {data['red_minutes']} min from order to ready. Delivery: avg {data['delivery']['avg_minutes']:.0f} min, {data['delivery']['late']} late of {data['delivery']['delivered']}."
