"""Per-IP rate limiting for the public endpoints — Frappe's `rate_limit` with its expiry race fixed.

Frappe reads the counter, sets an expiry only when it was missing, then increments. When the key expires between those
two calls, INCRBY recreates it *without* an expiry, and that IP stays blocked from the endpoint for good (seen on the
tracking page). Here the counter is incremented first and the expiry is (re)applied whenever the key has none.
"""

from functools import wraps

import frappe
from frappe import _


def rate_limit(limit: int = 5, seconds: int = 60, methods: str | list = "ALL"):
	def decorator(fn):
		@wraps(fn)
		def wrapper(*args, **kwargs):
			if not frappe.request or (methods != "ALL" and (frappe.request.method or "").upper() not in methods):
				return fn(*args, **kwargs)
			ip = frappe.local.request_ip or "-"
			key = frappe.cache.make_key(f"ros:rl:{frappe.form_dict.cmd}:{ip}:{seconds}")
			count = frappe.cache.incrby(key, 1)
			if count == 1 or frappe.cache.ttl(key) < 0:      # new window, or a key that lost its expiry
				frappe.cache.expire(key, seconds)
			if count > (limit() if callable(limit) else limit):
				frappe.throw(_("You hit the rate limit because of too many requests. Please try after sometime."),
							 frappe.RateLimitExceededError)
			return fn(*args, **kwargs)

		return wrapper

	return decorator
