"""Aggregator adapter interface: normalise an incoming order, push status / menu availability back."""


class AggregatorAdapter:
	service = "Aggregator"

	def __init__(self, settings):
		self.settings = settings

	def verify(self, headers, body) -> bool:
		"""Is this webhook really from the aggregator?"""
		raise NotImplementedError

	def normalise(self, payload) -> dict:
		"""Aggregator order → {external_order_id, branch, order_type, customer_name, notes, items: [{item_code, qty, rate, notes}]}."""
		raise NotImplementedError

	def push_status(self, order) -> None:
		"""Tell the aggregator the order moved on (accepted / ready / picked up / cancelled)."""
		raise NotImplementedError

	def push_availability(self, item_code, available) -> None:
		raise NotImplementedError
