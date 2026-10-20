"""Messaging adapter interface (WhatsApp / SMS): review links, order updates, campaigns."""


class MessagingAdapter:
	service = "Messaging"

	def __init__(self, settings):
		self.settings = settings

	def send(self, to, text, reference=None) -> dict:
		raise NotImplementedError
