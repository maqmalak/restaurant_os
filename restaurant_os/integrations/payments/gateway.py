"""Online payment gateway adapters. Mode Mock (default): a built-in test page (/ros/pay/<session>) — no money moves.
Mode Live: the provider in Restaurant Settings (Safepay, PayFast, JazzCash, Easypaisa, a bank gateway) — its hosted
checkout URL and webhook verification go in its adapter once the merchant account and keys exist."""

import hashlib
import hmac

import frappe
from frappe import _


class Gateway:
	name = "Gateway"

	def __init__(self, settings):
		self.settings = settings

	def checkout_url(self, session, amount, order) -> str:
		raise NotImplementedError

	def verify_webhook(self, headers, body) -> bool:
		raise NotImplementedError


class MockGateway(Gateway):
	name = "Mock"

	def checkout_url(self, session, amount, order):
		return f"/ros/pay/{session}"

	def verify_webhook(self, headers, body):
		return False                                          # the test gateway pays through mock_pay, never the webhook


class LiveGateway(Gateway):
	"""Placeholder for the real provider: hosted checkout + signed webhook (HMAC-SHA256 with the secret)."""

	@property
	def name(self):
		return self.settings.payment_gateway

	def checkout_url(self, session, amount, order):
		raise NotImplementedError(_("{0} checkout: add the provider's API call once the merchant account and keys are set.").format(self.name))

	def verify_webhook(self, headers, body):
		secret = self.settings.get_password("gateway_secret", raise_exception=False)
		sig = (headers or {}).get("X-Signature") or ""
		return bool(secret) and hmac.compare_digest(sig, hmac.new(secret.encode(), body, hashlib.sha256).hexdigest())


def gateway():
	s = frappe.get_single("Restaurant Settings")
	return MockGateway(s) if s.payment_gateway_mode != "Live" else LiveGateway(s)
