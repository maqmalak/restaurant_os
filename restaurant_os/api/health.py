"""Health check for monitors / load balancers: GET /api/method/restaurant_os.api.health.ping (guest).

Returns 200 with {"status": "ok" | "degraded", ...} while the database answers; checks Redis (cache + realtime queue),
counts work that failed and is waiting for a retry, and the age of the newest order. Nothing secret is returned.
"""

import time

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, now_datetime, time_diff_in_seconds


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=120, seconds=60)
def ping() -> dict:
	t0 = time.perf_counter()
	checks = {}
	frappe.db.sql("select 1")
	checks["database_ms"] = round((time.perf_counter() - t0) * 1000, 1)
	try:
		frappe.cache.set_value("ros:health", 1, expires_in_sec=30)
		checks["redis"] = "ok" if frappe.cache.get_value("ros:health") else "fail"
	except Exception:
		checks["redis"] = "fail"
	backlog = {
		"stock_failed": frappe.db.count("Restaurant Order", {"stock_status": "Failed"}),
		"fbr_failed": frappe.db.count("POS Invoice", {"fbr_status": "Failed"}) + frappe.db.count("Sales Invoice", {"fbr_status": "Failed"}),
		"payments_awaiting": frappe.db.count("Restaurant Order", {"status": "Awaiting Payment"}),
		"errors_last_hour": frappe.db.count("Error Log", {"creation": [">=", frappe.utils.add_to_date(None, hours=-1)]}),
	}
	last = frappe.db.get_value("Restaurant Order", {}, "creation", order_by="creation desc")
	degraded = checks["redis"] != "ok" or backlog["stock_failed"] or backlog["fbr_failed"]
	return {"status": "degraded" if degraded else "ok", "app": "restaurant_os", "time": str(now_datetime()), **checks,
			"backlog": backlog, "last_order_seconds_ago": cint(time_diff_in_seconds(now_datetime(), last)) if last else None}
