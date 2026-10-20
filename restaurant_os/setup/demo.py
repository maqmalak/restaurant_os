"""`bench --site restaurant.localhost ros-demo` — the fictional Saffron Grill menu, recipes and stock. Re-run safe.

Menu items (with photos from Wikimedia Commons, credits in demo/image_credits.json) are sales items priced on Standard
Selling; recipe dishes are non-stock items with a default BOM (their recipe: ingredients per plate), so Phase 5 can consume
the ingredients from the kitchen; bottled drinks are stock items sold as they are. Ingredients are stock items bought from
fictional suppliers into Central Store, with part transferred to Gulberg Kitchen and reorder levels on both (kitchen →
Material Transfer request, central store → Purchase request). Also POS Awesome offers + a coupon, KDS stations, the floor
plan and modifier groups.
"""

import json
import os

import frappe
from frappe.utils import flt, nowdate

from restaurant_os.setup.masters import ABBR, BRANCH, COMPANY, PROFILE, acct

HERE = os.path.dirname(__file__)
IMAGES = os.path.join(HERE, "..", "demo", "images")

SUPPLIERS = {
	"meat": "Lahore Fresh Meats (demo)",
	"veg": "Green Valley Produce (demo)",
	"dry": "Metro Wholesale (demo)",
	"drinks": "City Beverages (demo)",
}

# ingredient: (uom, valuation rate, supplier key, raw group, central reorder level, kitchen reorder level, opening qty)
INGREDIENTS = {
	"Chicken Boneless": ("Kg", 1100, "meat", "Meat & Fish", 20, 8, 60),
	"Chicken Whole": ("Kg", 650, "meat", "Meat & Fish", 20, 8, 60),
	"Mutton": ("Kg", 2600, "meat", "Meat & Fish", 10, 4, 25),
	"Beef Boneless": ("Kg", 1500, "meat", "Meat & Fish", 10, 4, 30),
	"Beef Mince": ("Kg", 1300, "meat", "Meat & Fish", 10, 4, 30),
	"Beef Trotters": ("Kg", 900, "meat", "Meat & Fish", 8, 3, 20),
	"Fish Rahu": ("Kg", 1100, "meat", "Meat & Fish", 10, 4, 25),
	"Potato": ("Kg", 120, "veg", "Vegetables & Fruit", 30, 10, 80),
	"Onion": ("Kg", 150, "veg", "Vegetables & Fruit", 30, 10, 80),
	"Tomato": ("Kg", 180, "veg", "Vegetables & Fruit", 30, 10, 80),
	"Cabbage": ("Kg", 100, "veg", "Vegetables & Fruit", 10, 4, 25),
	"Mixed Vegetables": ("Kg", 200, "veg", "Vegetables & Fruit", 10, 4, 25),
	"Orange": ("Kg", 250, "veg", "Vegetables & Fruit", 15, 5, 40),
	"Lemon": ("Kg", 400, "veg", "Vegetables & Fruit", 5, 2, 12),
	"Mint": ("Kg", 300, "veg", "Vegetables & Fruit", 3, 1, 8),
	"Yogurt": ("Kg", 280, "dry", "Dairy", 15, 5, 40),
	"Milk": ("Litre", 220, "dry", "Dairy", 20, 8, 60),
	"Butter": ("Kg", 2400, "dry", "Dairy", 5, 2, 12),
	"Cream": ("Litre", 1200, "dry", "Dairy", 5, 2, 12),
	"Mozzarella Cheese": ("Kg", 2600, "dry", "Dairy", 5, 2, 12),
	"Cooking Oil": ("Litre", 550, "dry", "Dry Store", 30, 10, 80),
	"Atta Flour": ("Kg", 140, "dry", "Dry Store", 30, 10, 80),
	"Maida Flour": ("Kg", 160, "dry", "Dry Store", 15, 5, 40),
	"Semolina": ("Kg", 180, "dry", "Dry Store", 5, 2, 15),
	"Chana Dal": ("Kg", 320, "dry", "Dry Store", 8, 3, 20),
	"Moong Dal": ("Kg", 340, "dry", "Dry Store", 8, 3, 20),
	"White Chickpeas": ("Kg", 380, "dry", "Dry Store", 8, 3, 20),
	"Spice Mix": ("Kg", 1600, "dry", "Dry Store", 5, 2, 12),
	"Ginger Garlic Paste": ("Kg", 600, "dry", "Dry Store", 5, 2, 12),
	"Sugar": ("Kg", 160, "dry", "Dry Store", 15, 5, 40),
	"Tea Leaves": ("Kg", 1800, "dry", "Dry Store", 3, 1, 8),
	"Coffee Beans": ("Kg", 6000, "dry", "Dry Store", 2, 1, 5),
	"Mayonnaise": ("Kg", 900, "dry", "Dry Store", 5, 2, 12),
	"Bread Slices": ("Nos", 15, "dry", "Dry Store", 100, 40, 300),
	"Eggs": ("Nos", 30, "dry", "Dry Store", 60, 24, 180),
	"Charcoal": ("Kg", 120, "dry", "Dry Store", 30, 10, 80),
	"Ice": ("Kg", 30, "drinks", "Dry Store", 20, 8, 60),
}

# bottled drinks sold as they are (stock items): item -> (price, valuation, image, opening qty)
DRINKS = {
	"Coke 345ml": (150, 80, "coke_regular.jpg", 240),
	"Sprite 345ml": (150, 80, "sprite_regular.jpg", 240),
	"Mineral Water 500ml": (80, 40, "mineral_water_half_liter.jpg", 240),
}

# recipe dishes: item -> (menu group, price, image, {ingredient: qty per plate})
MENU = {
	"Chicken Tikka": ("BBQ", 650, "chicken_tikka_v2.jpg", {"Chicken Whole": 0.35, "Yogurt": 0.05, "Spice Mix": 0.015, "Lemon": 0.01, "Charcoal": 0.2}),
	"Chicken Malai Boti": ("BBQ", 750, "chicken_malai_boti.jpg", {"Chicken Boneless": 0.25, "Cream": 0.04, "Mozzarella Cheese": 0.02, "Spice Mix": 0.01, "Charcoal": 0.2}),
	"Chicken Seekh Kabab": ("BBQ", 600, "chicken_seekh_kabab.jpg", {"Chicken Boneless": 0.22, "Onion": 0.03, "Spice Mix": 0.012, "Charcoal": 0.2}),
	"Beef Seekh Kabab": ("BBQ", 650, "beef_seekh_kabab.jpg", {"Beef Mince": 0.22, "Onion": 0.03, "Spice Mix": 0.012, "Charcoal": 0.2}),
	"Beef Bihari Boti": ("BBQ", 800, "beef_bihari_boti.jpg", {"Beef Boneless": 0.25, "Yogurt": 0.04, "Spice Mix": 0.015, "Cooking Oil": 0.02, "Charcoal": 0.2}),
	"Reshmi Kabab": ("BBQ", 700, "reshmi_kabab.jpg", {"Chicken Boneless": 0.22, "Cream": 0.03, "Eggs": 1, "Spice Mix": 0.01, "Charcoal": 0.2}),
	"Chicken Wings BBQ": ("BBQ", 650, "chicken_wings_bbq.jpg", {"Chicken Whole": 0.3, "Spice Mix": 0.012, "Cooking Oil": 0.02, "Charcoal": 0.15}),
	"Mutton Chops": ("BBQ", 1800, "mutton_chops.jpg", {"Mutton": 0.4, "Yogurt": 0.05, "Spice Mix": 0.015, "Charcoal": 0.25}),
	"Chicken Karahi": ("Handi", 1400, "chicken_karahi.jpg", {"Chicken Whole": 0.6, "Tomato": 0.3, "Cooking Oil": 0.08, "Ginger Garlic Paste": 0.03, "Spice Mix": 0.02}),
	"Chicken Korma": ("Handi", 1200, "chicken_korma.jpg", {"Chicken Whole": 0.5, "Onion": 0.2, "Yogurt": 0.1, "Cooking Oil": 0.08, "Spice Mix": 0.02}),
	"Nihari": ("Handi", 900, "nihari.jpg", {"Beef Boneless": 0.3, "Atta Flour": 0.03, "Cooking Oil": 0.06, "Spice Mix": 0.02, "Ginger Garlic Paste": 0.02}),
	"Paye": ("Handi", 800, "paye.jpg", {"Beef Trotters": 0.5, "Onion": 0.1, "Cooking Oil": 0.06, "Spice Mix": 0.02}),
	"Dal Chana": ("Handi", 380, "dall_chana.jpg", {"Chana Dal": 0.12, "Onion": 0.05, "Tomato": 0.05, "Cooking Oil": 0.03, "Spice Mix": 0.008}),
	"Dal Moong": ("Handi", 380, "dall_monghi.jpg", {"Moong Dal": 0.12, "Onion": 0.05, "Tomato": 0.05, "Cooking Oil": 0.03, "Spice Mix": 0.008}),
	"Mix Sabzi": ("Handi", 350, "sabzi.jpg", {"Mixed Vegetables": 0.25, "Tomato": 0.05, "Cooking Oil": 0.03, "Spice Mix": 0.008}),
	"Grilled Fish": ("Fish", 1500, "grilled_fish.jpg", {"Fish Rahu": 0.5, "Lemon": 0.02, "Spice Mix": 0.015, "Butter": 0.02, "Charcoal": 0.2}),
	"Fried Fish": ("Fish", 1300, "fry_fish_rahu.jpg", {"Fish Rahu": 0.5, "Maida Flour": 0.05, "Spice Mix": 0.015, "Cooking Oil": 0.15}),
	"Halwa Puri": ("Breakfast", 450, "halwa_puri.jpg", {"Maida Flour": 0.15, "Semolina": 0.06, "Sugar": 0.05, "White Chickpeas": 0.06, "Cooking Oil": 0.1}),
	"Paratha": ("Breakfast", 90, "paratha_sada.jpg", {"Atta Flour": 0.1, "Butter": 0.015}),
	"Aloo Paratha": ("Breakfast", 220, "paratha_aloo_wala.jpg", {"Atta Flour": 0.1, "Potato": 0.08, "Butter": 0.015, "Spice Mix": 0.003}),
	"Chicken Paratha": ("Breakfast", 320, "paratha_chicken.jpg", {"Atta Flour": 0.1, "Chicken Boneless": 0.06, "Butter": 0.015, "Spice Mix": 0.003}),
	"Chanay": ("Breakfast", 300, "chanay_white.jpg", {"White Chickpeas": 0.12, "Onion": 0.03, "Tomato": 0.03, "Cooking Oil": 0.03, "Spice Mix": 0.006}),
	"Doodh Patti Tea": ("Beverages", 120, "tea_milk.jpg", {"Milk": 0.2, "Tea Leaves": 0.006, "Sugar": 0.015}),
	"Cappuccino": ("Beverages", 550, "cappuccino.jpg", {"Milk": 0.2, "Coffee Beans": 0.018, "Sugar": 0.01}),
	"Iced Latte": ("Beverages", 600, "iced_latte.jpg", {"Milk": 0.22, "Coffee Beans": 0.018, "Ice": 0.15, "Sugar": 0.012}),
	"Fresh Orange Juice": ("Beverages", 450, "fresh_orange_juice.jpg", {"Orange": 0.6, "Sugar": 0.01, "Ice": 0.1}),
	"Mint Lemonade": ("Beverages", 350, "mint_lemonade.jpg", {"Lemon": 0.05, "Mint": 0.01, "Sugar": 0.03, "Ice": 0.15}),
	"French Fries": ("Sides & Add-ons", 350, "french_fries.jpg", {"Potato": 0.25, "Cooking Oil": 0.08, "Spice Mix": 0.003}),
	"Garlic Bread": ("Sides & Add-ons", 380, "garlic_bread.jpg", {"Bread Slices": 4, "Butter": 0.03, "Ginger Garlic Paste": 0.01, "Mozzarella Cheese": 0.02}),
	"Onion Rings": ("Sides & Add-ons", 400, "onion_rings.jpg", {"Onion": 0.2, "Maida Flour": 0.06, "Cooking Oil": 0.1}),
	"Coleslaw": ("Sides & Add-ons", 200, "coleslaw.jpg", {"Cabbage": 0.12, "Mayonnaise": 0.04}),
	"Raita": ("Sides & Add-ons", 120, "raita.jpg", {"Yogurt": 0.15, "Mint": 0.003}),
	"Fresh Salad": ("Sides & Add-ons", 150, "salad.jpg", {"Tomato": 0.06, "Onion": 0.05, "Cabbage": 0.05, "Lemon": 0.01}),
	"Roti": ("Sides & Add-ons", 30, "roti.jpg", {"Atta Flour": 0.07}),
	"Extra Cheese": ("Sides & Add-ons", 150, "extra_cheese.jpg", {"Mozzarella Cheese": 0.04}),
}

STATIONS = {
	"Grill": {"groups": ["BBQ", "Fish"]},
	"Handi": {"groups": ["Handi"]},
	"Fryer": {"items": ["French Fries", "Onion Rings", "Garlic Bread", "Fried Fish"]},
	"Tandoor & Breakfast": {"groups": ["Breakfast"], "items": ["Roti"]},
	"Drinks": {"groups": ["Beverages"]},
	"Cold Kitchen": {"items": ["Coleslaw", "Raita", "Fresh Salad"]},
}

FLOOR = {"Main Hall": ("T", 8, 4), "Family Hall": ("F", 6, 6), "Rooftop": ("R", 4, 4)}


# ------------------------------------------------------------------ masters
def _uom(name, whole=0):
	if not frappe.db.exists("UOM", name):
		frappe.get_doc({"doctype": "UOM", "uom_name": name, "must_be_whole_number": whole}).insert(ignore_permissions=True)


def _group(name, parent):
	if not frappe.db.exists("Item Group", name):
		frappe.get_doc({"doctype": "Item Group", "item_group_name": name, "parent_item_group": parent,
						"is_group": 0 if parent != "All Item Groups" else 1}).insert(ignore_permissions=True)


def ensure_masters():
	for u, whole in (("Kg", 0), ("Litre", 0), ("Nos", 1), ("Plate", 0)):   # half plates (single / full karahi) are sold
		_uom(u, whole)
	frappe.db.set_value("UOM", "Plate", "must_be_whole_number", 0)
	_group("Menu", "All Item Groups")
	_group("Ingredients", "All Item Groups")
	for g in ("BBQ", "Handi", "Fish", "Breakfast", "Beverages", "Sides & Add-ons"):
		_group(g, "Menu")
	for g in ("Meat & Fish", "Vegetables & Fruit", "Dairy", "Dry Store"):
		_group(g, "Ingredients")
	group = frappe.db.get_value("Supplier Group", {"is_group": 0}, "name") or "All Supplier Groups"
	for s in SUPPLIERS.values():
		if not frappe.db.exists("Supplier", s):
			frappe.get_doc({"doctype": "Supplier", "supplier_name": s, "supplier_group": group, "supplier_type": "Company",
							"country": "Pakistan"}).insert(ignore_permissions=True)
	if not frappe.db.exists("Price List", "Foodpanda"):
		frappe.get_doc({"doctype": "Price List", "price_list_name": "Foodpanda", "currency": "PKR", "selling": 1,
						"enabled": 1}).insert(ignore_permissions=True)


def _attach_image(item_code, filename):
	if not filename:
		return None
	url = frappe.db.get_value("File", {"attached_to_doctype": "Item", "attached_to_name": item_code, "file_name": filename}, "file_url")
	if url:
		return url
	path = os.path.join(IMAGES, filename)
	if not os.path.exists(path):
		return None
	f = frappe.get_doc({"doctype": "File", "file_name": filename, "is_private": 0, "attached_to_doctype": "Item",
						"attached_to_name": item_code, "content": open(path, "rb").read()})
	f.insert(ignore_permissions=True)
	return f.file_url


def _item(code, group, uom, stock, sales, purchase, valuation=0, supplier=None, image=None, reorder=None):
	store, kitchen = acct("Central Store"), acct(f"{BRANCH} Kitchen")
	doc = frappe.get_doc("Item", code) if frappe.db.exists("Item", code) else frappe.new_doc("Item")
	doc.update({"item_code": code, "item_name": code, "item_group": group, "stock_uom": uom, "is_stock_item": stock,
				"is_sales_item": sales, "is_purchase_item": purchase, "include_item_in_manufacturing": 1 if stock else 0,
				"valuation_rate": valuation or doc.get("valuation_rate"), "description": code})
	if not any(d.company == COMPANY for d in doc.item_defaults):
		doc.append("item_defaults", {"company": COMPANY, "default_warehouse": store if purchase else kitchen,
									 "default_supplier": supplier})
	if reorder and not doc.reorder_levels:
		central_level, kitchen_level = reorder
		doc.append("reorder_levels", {"warehouse": store, "warehouse_reorder_level": central_level,
									  "warehouse_reorder_qty": central_level * 2, "material_request_type": "Purchase"})
		doc.append("reorder_levels", {"warehouse": kitchen, "warehouse_reorder_level": kitchen_level,
									  "warehouse_reorder_qty": kitchen_level * 2, "material_request_type": "Transfer"})
	doc.flags.ignore_permissions = True
	doc.save()
	if image and not doc.image:
		url = _attach_image(code, image)
		if url:
			doc.db_set("image", url)
	return doc.name


def _price(item, rate, price_list="Standard Selling"):
	name = frappe.db.get_value("Item Price", {"item_code": item, "price_list": price_list}, "name")
	if name:
		frappe.db.set_value("Item Price", name, "price_list_rate", rate)
	else:
		frappe.get_doc({"doctype": "Item Price", "item_code": item, "price_list": price_list, "price_list_rate": rate}).insert(ignore_permissions=True)


def ensure_items():
	for name, (uom, rate, sup, group, central, kitchen, _qty) in INGREDIENTS.items():
		_item(name, group, uom, 1, 0, 1, rate, SUPPLIERS[sup], reorder=(central, kitchen))
	for name, (price, rate, image, _qty) in DRINKS.items():
		_item(name, "Beverages", "Nos", 1, 1, 1, rate, SUPPLIERS["drinks"], image, reorder=(48, 24))
		_price(name, price)
		_price(name, round(price * 1.15), "Foodpanda")
	for name, (group, price, image, _recipe) in MENU.items():
		_item(name, group, "Plate", 0, 1, 0, image=image)
		_price(name, price)
		_price(name, round(price * 1.15 / 10) * 10, "Foodpanda")   # aggregator price list: +15%, rounded to 10


# ------------------------------------------------------------------ stock
def ensure_stock():
	"""Opening stock: a Material Receipt into Central Store, then a Material Transfer of ~40% to the kitchen (once)."""
	if frappe.db.exists("Stock Entry", {"remarks": "Restaurant OS demo: opening stock", "docstatus": 1}):
		return
	store, kitchen = acct("Central Store"), acct(f"{BRANCH} Kitchen")
	lines = [(n, v[6], v[1]) for n, v in INGREDIENTS.items()] + [(n, v[3], v[1]) for n, v in DRINKS.items()]
	receipt = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "purpose": "Material Receipt",
							  "company": COMPANY, "posting_date": nowdate(), "remarks": "Restaurant OS demo: opening stock",
							  "items": [{"item_code": n, "qty": q, "t_warehouse": store, "basic_rate": r, "set_basic_rate_manually": 1}
										for n, q, r in lines]})
	receipt.insert(ignore_permissions=True)
	receipt.submit()
	transfer = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Transfer", "purpose": "Material Transfer",
							   "company": COMPANY, "posting_date": nowdate(), "remarks": "Restaurant OS demo: kitchen issue",
							   "items": [{"item_code": n, "qty": flt(q * 0.4, 3), "s_warehouse": store, "t_warehouse": kitchen}
										 for n, q, _r in lines]})
	transfer.insert(ignore_permissions=True)
	transfer.submit()


def ensure_recipes():
	"""One default, submitted BOM per dish — its recipe (ingredients per plate)."""
	for name, (_g, _p, _i, recipe) in MENU.items():
		if frappe.db.exists("BOM", {"item": name, "is_default": 1, "docstatus": 1}):
			continue
		bom = frappe.get_doc({"doctype": "BOM", "item": name, "company": COMPANY, "quantity": 1, "uom": "Plate",
							  "is_active": 1, "is_default": 1, "rm_cost_as_per": "Valuation Rate", "with_operations": 0,
							  "items": [{"item_code": ing, "qty": qty, "uom": INGREDIENTS[ing][0]} for ing, qty in recipe.items()]})
		bom.insert(ignore_permissions=True)
		bom.submit()


# ------------------------------------------------------------------ offers, coupon (POS Awesome)
OFFERS = [
	{"title": "Breakfast Hour 20% Off", "apply_on": "Item Group", "item_group": "Breakfast", "offer": "Item Price",
	 "discount_type": "Discount Percentage", "discount_percentage": 20, "auto": 1,
	 "description": "20% off every breakfast plate."},
	{"title": "Free Raita with Karahi", "apply_on": "Item Code", "item": "Chicken Karahi", "offer": "Give Product",
	 "apply_type": "Item Code", "apply_item_code": "Raita", "given_qty": 1, "auto": 1,
	 "description": "A free raita with every chicken karahi."},
	{"title": "Big Table 5% Off", "apply_on": "Transaction", "offer": "Grand Total", "min_amt": 5000,
	 "discount_type": "Discount Percentage", "discount_percentage": 5, "auto": 1,
	 "description": "5% off bills of Rs 5,000 or more."},
	{"title": "Welcome 10% Off", "apply_on": "Transaction", "offer": "Grand Total", "coupon_based": 1,
	 "discount_type": "Discount Percentage", "discount_percentage": 10, "auto": 0,
	 "description": "10% off the bill with coupon WELCOME10."},
]


def ensure_offers():
	for o in OFFERS:
		if not frappe.db.exists("POS Offer", o["title"]):
			frappe.get_doc({"doctype": "POS Offer", "company": COMPANY, "valid_from": nowdate(), **o}).insert(ignore_permissions=True)
	if not frappe.db.exists("POS Coupon", "WELCOME10"):
		frappe.get_doc({"doctype": "POS Coupon", "coupon_name": "WELCOME10", "coupon_code": "WELCOME10", "coupon_type": "Promotional",
						"pos_offer": "Welcome 10% Off", "company": COMPANY, "maximum_use": 500,
						"description": "Welcome offer for first-time diners"}).insert(ignore_permissions=True)


# ------------------------------------------------------------------ KDS stations, floor plan, modifiers
def ensure_kitchen():
	for station, spec in STATIONS.items():
		name = f"{BRANCH}-{station}"
		if frappe.db.exists("Kitchen Station", name):
			continue
		frappe.get_doc({"doctype": "Kitchen Station", "station_name": station, "branch": BRANCH,
						"item_groups": [{"item_group": g} for g in spec.get("groups", [])],
						"items": [{"item": i} for i in spec.get("items", [])]}).insert(ignore_permissions=True)
	for area, (prefix, count, seats) in FLOOR.items():
		if not frappe.db.exists("Floor Area", f"{BRANCH}-{area}"):
			frappe.get_doc({"doctype": "Floor Area", "area_name": area, "branch": BRANCH}).insert(ignore_permissions=True)
		for n in range(1, count + 1):
			if not frappe.db.exists("Restaurant Table", f"{BRANCH}-{prefix}{n}"):
				frappe.get_doc({"doctype": "Restaurant Table", "table_number": f"{prefix}{n}", "branch": BRANCH,
								"floor_area": f"{BRANCH}-{area}", "seats": seats, "shape": "Round" if prefix == "F" else "Square",
								"pos_x": ((n - 1) % 4) * 120, "pos_y": ((n - 1) // 4) * 120}).insert(ignore_permissions=True)
	groups = [
		{"group_name": "Spice Level", "min_select": 1, "max_select": 1, "required": 1,
		 "modifiers": [{"modifier_name": "Mild"}, {"modifier_name": "Medium", "is_default": 1}, {"modifier_name": "Hot"}],
		 "items": [n for n, v in MENU.items() if v[0] in ("BBQ", "Handi", "Fish")]},
		{"group_name": "Bread", "min_select": 0, "max_select": 2,
		 "modifiers": [{"modifier_name": "2 Roti", "price": 60, "item": "Roti"}, {"modifier_name": "Paratha", "price": 90, "item": "Paratha"}],
		 "items": [n for n, v in MENU.items() if v[0] == "Handi"]},
		{"group_name": "Cheese", "min_select": 0, "max_select": 1,
		 "modifiers": [{"modifier_name": "Extra Cheese", "price": 150, "item": "Extra Cheese"}],
		 "items": ["French Fries", "Garlic Bread", "Chicken Malai Boti"]},
	]
	for g in groups:
		if not frappe.db.exists("Menu Modifier Group", g["group_name"]):
			frappe.get_doc({"doctype": "Menu Modifier Group", **{k: v for k, v in g.items() if k != "items"},
							"items": [{"item": i} for i in g["items"]]}).insert(ignore_permissions=True)


def ensure_counter_groups():
	"""The menu groups on the counter's POS Profile — the terminal's category chips (and only menu items are shown)."""
	prof = frappe.get_doc("POS Profile", PROFILE)
	have = {g.item_group for g in prof.item_groups}
	missing = [g for g in ("BBQ", "Handi", "Fish", "Breakfast", "Beverages", "Sides & Add-ons") if g not in have]
	for g in missing:
		prof.append("item_groups", {"item_group": g})
	if missing:
		prof.save(ignore_permissions=True)


def run():
	if not frappe.db.exists("Company", COMPANY):
		frappe.throw(f"Run `bench --site {frappe.local.site} ros-setup` first.")
	ensure_masters()
	ensure_items()
	frappe.db.commit()
	ensure_stock()
	ensure_recipes()
	ensure_offers()
	ensure_kitchen()
	ensure_counter_groups()
	frappe.db.commit()
	print(f"ros-demo: {len(MENU) + len(DRINKS)} menu items, {len(INGREDIENTS)} ingredients, {len(MENU)} recipes, "
		  f"{len(OFFERS)} offers, {len(STATIONS)} stations, {sum(v[1] for v in FLOOR.values())} tables — counter {PROFILE} ({ABBR})")
