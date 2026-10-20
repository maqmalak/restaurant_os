"""WhatsApp adapter. Mode Mock (default): every message is logged as an Integration Request and nothing is sent.
Mode Live: provider (Meta WhatsApp Cloud API / Twilio / the bench's Frappe WhatsApp app) set in Restaurant Settings."""

import frappe

from restaurant_os.integrations.log import log
from restaurant_os.integrations.messaging.base import MessagingAdapter


class WhatsAppAdapter(MessagingAdapter):
	service = "WhatsApp"

	def send(self, to, text, reference=None):
		mode = self.settings.messaging_mode
		log(self.service, {"to": to, "text": text, "mode": mode, "provider": self.settings.whatsapp_provider}, reference=reference)
		if mode == "Live":
			raise NotImplementedError(f"WhatsApp Live via {self.settings.whatsapp_provider}: add the provider call once credentials are provided")
		return {"sent": False, "mock": True}


def send(to, text, reference=None):
	return WhatsAppAdapter(frappe.get_single("Restaurant Settings")).send(to, text, reference)
