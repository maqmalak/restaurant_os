"""Foodpanda adapter. Mode Mock (default until credentials are given): nothing leaves this server — webhooks are accepted
unsigned, status / availability pushes are only logged, and `simulate_order` fakes an incoming order. Mode Live: the
calls below are where the real Foodpanda (Delivery Hero) POS API goes once its credentials are in Restaurant Settings."""

import hashlib
import hmac
import random
import uuid

import frappe
from frappe import _

from restaurant_os.integrations.aggregators.base import AggregatorAdapter
from restaurant_os.integrations.log import log


class FoodpandaAdapter(AggregatorAdapter):
	service = "Foodpanda"

	@property
	def live(self):
		return self.settings.aggregator_mode == "Live"

	def verify(self, headers, body):
		if not self.live:
			return True
		secret = self.settings.get_password("foodpanda_webhook_secret", raise_exception=False)
		sig = (headers or {}).get("X-Signature") or ""
		return bool(secret) and hmac.compare_digest(sig, hmac.new(secret.encode(), body, hashlib.sha256).hexdigest())

	def normalise(self, payload):
		items = []
		for p in payload.get("products") or []:
			code = p.get("remote_code") or p.get("sku")
			if not frappe.db.exists("Item", code):
				frappe.throw(_("Foodpanda product {0} is not mapped to an item.").format(code))
			items.append({"item_code": code, "qty": float(p.get("quantity") or 1), "rate": float(p.get("unit_price") or 0),
						  "notes": p.get("comment")})
		return {"external_order_id": str(payload.get("order_id") or payload.get("code")), "branch": payload.get("branch"),
				"order_type": "Delivery" if (payload.get("expedition_type") or "delivery") == "delivery" else "Pickup",
				"customer_name": (payload.get("customer") or {}).get("name") or "Foodpanda customer",
				"notes": payload.get("comment"), "items": items}

	def push_status(self, order):
		log(self.service, {"order_id": order.external_order_id, "status": order.status, "mode": self.settings.aggregator_mode},
			reference=("Restaurant Order", order.name))
		if self.live:
			raise NotImplementedError("Foodpanda Live status push: add the API call once credentials are provided")

	def push_availability(self, item_code, available):
		log(self.service, {"item": item_code, "available": available, "mode": self.settings.aggregator_mode})
		if self.live:
			raise NotImplementedError("Foodpanda Live availability push: add the API call once credentials are provided")


def adapter():
	return FoodpandaAdapter(frappe.get_single("Restaurant Settings"))


def receive(payload):
	"""A Foodpanda order (webhook or simulator) → Restaurant Order on the KDS. Idempotent on the Foodpanda order id."""
	from restaurant_os.services.orders import create_order, settings

	data = adapter().normalise(payload)
	branch = data.pop("branch", None) or settings().default_branch
	order = create_order(branch, data.pop("items"), channel="Foodpanda", client_order_uuid=f"foodpanda:{data['external_order_id']}", **data)
	log("Foodpanda", payload, reference=("Restaurant Order", order.name))
	return order


def simulate_order(items=2):
	"""Mock mode: a random Foodpanda order from the menu's Foodpanda prices."""
	menu = frappe.get_all("Item Price", {"price_list": "Foodpanda", "selling": 1}, ["item_code", "price_list_rate"])
	if not menu:
		frappe.throw(_("No items on the Foodpanda price list."))
	picks = random.sample(menu, min(int(items), len(menu)))
	return receive({"order_id": f"FP-{uuid.uuid4().hex[:8].upper()}", "expedition_type": "delivery",
					"customer": {"name": random.choice(["Hira S.", "Usman A.", "Zara K.", "Ali R."])},
					"products": [{"remote_code": p.item_code, "quantity": random.choice([1, 1, 2]), "unit_price": p.price_list_rate} for p in picks]})
