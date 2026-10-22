// Restaurant OS — one video per operation. Run: node run.js <id> [<id> …]  (ids below)
const L = require("./lib");
const { caption: cap, human: H } = L;

const OPS = {};

OPS["01-sign-in-and-open-shift"] = async () => {
  const r = await L.recording("01-sign-in-and-open-shift");
  const p = r.page;
  await p.goto(`${L.BASE}/ros/login`);
  await L.titleCard(p, "Restaurant OS · Counter", "Sign in & open the shift", "The cashier signs in and counts the opening cash in the drawer");
  await cap(p, "Sign in with your ERPNext account", "Cashier: Ayesha Khan", 1200);
  await H.type(p.locator("#usr"), L.USERS.cashier);
  await p.locator("#pwd").pressSequentially(L.pwd("cashier"), { delay: 40 });
  await H.click(p.getByRole("button", { name: /sign in/i }), 2500);
  await p.goto(`${L.BASE}/ros/pos/terminal`);
  await p.getByText("Open POS shift").waitFor();
  await cap(p, "No shift is open yet — count the drawer", "Enter the opening cash, or tap a quick amount", 2200);
  await H.click(p.getByRole("button", { name: /5,000\.00/ }).first(), 1200);
  await cap(p, "Opening float: <b>Rs 5,000</b> cash", "Card and bank transfer usually start at zero", 1800);
  await H.click(p.getByRole("button", { name: /open shift/i }), 3000);
  await cap(p, "Shift open — the terminal is ready to sell", "POS Awesome opening shift recorded in ERPNext", 3000);
  await L.endCard(p, "Shift opened");
  return L.finish(r);
};

async function addItem(p, query, tile, note) {
  const search = p.getByPlaceholder(/Search by item code/);
  await H.type(search, query);
  await p.waitForTimeout(700);
  if (note) await cap(p, note[0], note[1], 1200);
  await H.click(p.getByRole("button", { name: new RegExp(`(^|\\s)${tile}\\s`) }).first(), 1300);
}

OPS["02-counter-sale"] = async () => {
  const r = await L.recording("02-counter-sale", { who: "cashier" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/terminal`);
  await p.getByPlaceholder(/Search by item code/).waitFor();
  await L.titleCard(p, "Restaurant OS · Counter", "Counter sale", "Ring up dishes, let offers apply automatically, take cash and print the receipt");
  await cap(p, "Find a dish by name, code or barcode", "Or tap a category and a tile", 1500);
  await addItem(p, "karahi", "Chicken Karahi", ["Tap the dish to add it", "Chicken Karahi — Rs 1,400 a plate"]);
  await cap(p, "Pick the portion: Single, Full, or a rupee amount", "Full plate here", 1200);
  await H.click(p.getByRole("button", { name: "Full", exact: true }).first(), 1500);
  await cap(p, "Offer applied automatically: <b>free Raita with Karahi</b>", "POS Offers run on the server — the cashier does nothing", 2600);
  await addItem(p, "roti", "Roti", ["Add bread", "Roti — Rs 30"]);
  await H.click(p.getByRole("button", { name: "Full", exact: true }).last(), 900);
  await addItem(p, "lemonade", "Mint Lemonade", ["And a drink", "Mint Lemonade — Rs 350"]);
  await H.click(p.getByRole("button", { name: "Full", exact: true }).last(), 900);
  await cap(p, "Totals come from ERPNext: 18% sales tax + FBR fee", "Exactly what will be invoiced", 2400);
  await L.shot(p, "02-cart");
  await H.click(p.getByRole("button", { name: /Checkout/ }), 1500);
  await cap(p, "Payment: Cash → Card → Bank Transfer, or split", "The customer hands over Rs 2,500", 1600);
  await H.click(p.getByRole("button", { name: /2,500\.00/ }).first(), 1200);
  await cap(p, "Change is worked out for the cashier", "", 1800);
  await H.click(p.getByRole("button", { name: /Complete sale/ }), 3500);
  await L.shot(p, "02-done");
  await cap(p, "Sale posted: POS Invoice, FBR number and QR, kitchen order sent", "The receipt prints with the logo and FBR QR", 3200);
  await L.endCard(p, "Sale completed");
  return L.finish(r);
};

async function terminal(r, kicker, title, sub) {
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/terminal`);
  await p.getByPlaceholder(/Search by item code/).waitFor();
  await p.waitForTimeout(800);
  await L.titleCard(p, kicker, title, sub);
  return p;
}

OPS["03-discount-manager-approval"] = async () => {
  const r = await L.recording("03-discount-manager-approval", { who: "cashier" });
  const p = await terminal(r, "Restaurant OS · Counter", "Discount with manager approval", "Cashier discounts above 10% of the bill need a manager to sign in at the terminal");
  await addItem(p, "mutton", "Mutton Chops", ["A regular asks for a discount", "Mutton Chops — Rs 1,800"]);
  await H.click(p.getByRole("button", { name: "Full", exact: true }).first(), 900);
  await cap(p, "Bill discount in percent", "25% — above the cashier's 10% limit", 1500);
  await H.click(p.getByRole("button", { name: "%", exact: true }), 500);
  await H.type(p.locator("#pos-disc"), "25");
  await p.waitForTimeout(1500);
  await H.click(p.getByRole("button", { name: /Checkout/ }), 1500);
  await H.click(p.getByRole("button", { name: /Complete sale/ }), 2000);
  await L.shot(p, "03-approval");
  await cap(p, "The server asks for a manager", "The sale can't post until a manager approves", 2400);
  const dlg = p.getByRole("dialog").last();
  await H.type(dlg.getByLabel(/Manager/), L.USERS.manager);
  await dlg.getByLabel(/Password/).pressSequentially(L.pwd("manager"), { delay: 40 });
  await cap(p, "The manager signs in on the spot", "Wrong passwords are throttled", 1200);
  await H.click(dlg.getByRole("button", { name: "Approve" }), 3500);
  await L.shot(p, "03-done");
  await cap(p, "Approved and posted", "The invoice timeline notes who approved it and which cashier rang it up", 3000);
  await L.endCard(p, "Discount approved");
  return L.finish(r);
};

OPS["04-hold-and-resume"] = async () => {
  const r = await L.recording("04-hold-and-resume", { who: "cashier" });
  const p = await terminal(r, "Restaurant OS · Counter", "Hold & resume a sale", "Park an order while the customer decides, serve the next one, then bring it back");
  await addItem(p, "nihari", "Nihari", ["Customer orders Nihari…", ""]);
  await addItem(p, "paratha", "Paratha", ["…and parathas", ""]);
  await cap(p, "…then steps away to call a friend", "Hold parks the sale on the server", 1600);
  await H.click(p.getByRole("button", { name: "Hold", exact: true }), 2200);
  await cap(p, "The terminal is free for the next customer", "", 2000);
  await H.click(p.getByRole("button", { name: "Held", exact: true }), 1800);
  await L.shot(p, "04-held");
  await cap(p, "Held sales — including self-order kiosk orders", "Tap one to bring it back", 2000);
  await H.click(p.getByRole("dialog").getByRole("button", { name: /Resume|Nihari|Walk-in/ }).first(), 2200);
  await cap(p, "Back in the cart, ready to finish", "", 2400);
  await H.click(p.getByRole("button", { name: /Checkout/ }), 1400);
  await H.click(p.getByRole("button", { name: /Complete sale/ }), 3000);
  await cap(p, "Paid and sent to the kitchen", "", 2200);
  await L.endCard(p, "Held sale completed");
  return L.finish(r);
};

OPS["05-return-with-approval"] = async () => {
  const r = await L.recording("05-return-with-approval", { who: "cashier" });
  const p = await terminal(r, "Restaurant OS · Counter", "Return & refund", "Refund part of a sale — returns always need a manager");
  await H.click(p.getByRole("button", { name: "Return invoice" }), 1800);
  await cap(p, "Find the sale in Invoice Management", "Today's counter sales, newest first", 2200);
  await H.click(p.getByRole("button", { name: "Return", exact: true }).first(), 2000);
  await L.shot(p, "05-return");
  await cap(p, "Pick what comes back and how to refund", "Quantities already returned are respected", 2400);
  await H.click(p.getByRole("button", { name: /Process return/ }), 2000);
  await cap(p, "Returns need a manager", "", 1500);
  const dlg = p.getByRole("dialog").last();
  await H.type(dlg.getByLabel(/Manager/), L.USERS.manager);
  await dlg.getByLabel(/Password/).pressSequentially(L.pwd("manager"), { delay: 40 });
  await H.click(dlg.getByRole("button", { name: "Approve" }), 3200);
  await L.shot(p, "05-done");
  await cap(p, "Return posted and refunded from this shift", "Stock comes back; the approval is noted on the return", 3000);
  await L.endCard(p, "Return processed");
  return L.finish(r);
};

OPS["06-cash-in-out"] = async () => {
  const r = await L.recording("06-cash-in-out", { who: "cashier" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/cash`);
  await p.getByText("Cash receipts & payments").waitFor();
  await L.titleCard(p, "Restaurant OS · Counter", "Cash in & out", "Pay a small expense from the drawer — it is counted in the shift's cash-up");
  await H.click(p.getByRole("button", { name: /Cash payment/ }), 900);
  await cap(p, "Cash payment: money out of the drawer", "Rs 500 for staff tea", 1200);
  await H.type(p.getByRole("spinbutton").first(), "500");
  const sel = p.locator("select").filter({ has: p.locator("option", { hasText: "Expense account" }) });
  if (await sel.count()) {
    const opts = await sel.locator("option").allTextContents();
    const pick = opts.find((o) => /Tea|Entertainment|Miscellaneous|Office|Expense/i.test(o) && !/Expense account/i.test(o)) || opts[1];
    await sel.selectOption({ label: pick }); await p.waitForTimeout(900);
  } else {
    await H.click(p.getByText(/Expense account/), 700); await L.shot(p, "06-acct");
    await H.click(p.getByRole("option").first(), 900);
  }
  await H.type(p.getByPlaceholder(/Tea for staff/), "Tea for kitchen staff");
  await cap(p, "Choose the expense account and add a note", "", 1200);
  await L.shot(p, "06-form");
  await H.click(p.getByRole("button", { name: /^Pay / }), 2500);
  await L.shot(p, "06-done");
  await cap(p, "Recorded in this shift (POS Cash Movement)", "Close-shift expects Rs 500 less cash in the drawer", 2800);
  await L.endCard(p, "Cash payment recorded");
  return L.finish(r);
};

OPS["07-table-map-dine-in"] = async () => {
  const r = await L.recording("07-table-map-dine-in", { who: "cashier" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/tables`);
  await p.getByText("Pick a table").waitFor();
  await L.titleCard(p, "Restaurant OS · Dine-in", "Table map", "Seat guests, send rounds to the kitchen, settle one bill, free the table");
  await cap(p, "Free tables are white, occupied tables green with the time seated", "Floor areas: Family Hall, Main Hall, Rooftop", 2200);
  const floor = await L.api(r, "restaurant_os.api.tables.floor", {}, "GET");
  const free = (floor.tables || []).filter((t) => t.status === "Free" && /^F\d/.test(t.table_number || t.label || "")).map((t) => t.table_number || t.label);
  const T = free[0] || "F4";
  await H.click(p.getByText(T, { exact: true }).first(), 1500);
  await cap(p, `Table ${T} — free`, "Seat the guests", 1200);
  await H.click(p.getByRole("button", { name: /Seat Guests/ }).first(), 1200);
  const plus = p.locator("button:has(svg.lucide-plus)").last();
  await H.click(plus, 500);
  await H.click(plus, 700);
  await cap(p, "4 guests", "", 900);
  await H.click(p.getByRole("button", { name: "Seat guests", exact: true }).last(), 2000);
  await cap(p, "Seated — the timer starts", "Now take the first round", 1500);
  const round = async (items, note) => {
    await H.click(p.getByRole("button", { name: /Take Order|Add Items/ }), 1500);
    const d = p.getByRole("dialog").last();
    for (const [name, times] of items) {
      for (let k = 0; k < times; k++) await H.click(d.getByRole("button", { name: new RegExp(`^${name}`) }).first(), 450);
    }
    if (note) { await H.type(d.getByPlaceholder("Order note"), note); }
    await p.waitForTimeout(700);
    await H.click(d.getByRole("button", { name: /Send to kitchen/ }), 2200);
  };
  await cap(p, "Round 1: tap the dishes", "Chicken Karahi and two Chicken Tikka", 600);
  await round([["Chicken Karahi", 1], ["Chicken Tikka", 2]], "Karahi medium spicy");
  await cap(p, "Sent — the kitchen display shows the ticket instantly", "", 2200);
  await cap(p, "Round 2: bread and drinks", "Marked “+ New Items” on the KDS", 600);
  await round([["Roti", 4], ["Mint Lemonade", 2]]);
  await cap(p, "The table shows the running total", "", 1800);
  await H.click(p.getByRole("button", { name: /^View Order/ }), 1000);
  await cap(p, "View the order by round, with tax and total", "", 2600);
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);
  await H.click(p.getByRole("button", { name: /^Settle/ }), 1000);
  await cap(p, "Settle one bill for the whole sitting", "The guests pay by card", 1500);
  const d = p.getByRole("dialog").last();
  await H.click(d.getByRole("button", { name: "Credit Card", exact: true }), 900);
  await H.click(d.getByRole("button", { name: /Settle/ }), 3000);
  await cap(p, "One invoice for every round — nothing is cooked twice", "", 2200);
  await H.click(p.getByRole("button", { name: /End Sitting/ }), 2200);
  await cap(p, `Table ${T} is free again`, "", 2200);
  await L.endCard(p, "Table settled");
  return L.finish(r);
};

async function orderNo(r, order) {
  return (await L.api(r, "frappe.client.get_value", { doctype: "Restaurant Order", filters: order, fieldname: "order_no" }, "GET")).order_no;
}

function kdsCard(p, label, who) { // a ticket is an <article>; numbers restart daily, so match the customer too
  let loc = p.locator("article").filter({ hasText: label });
  if (who) loc = loc.filter({ hasText: who });
  return loc.first();
}

OPS["08-kitchen-display"] = async () => {
  const r = await L.recording("08-kitchen-display", { who: "cashier" });
  const p = r.page;
  const o = await L.api(r, "restaurant_os.api.riders.new_delivery_order", { data: JSON.stringify({
    customer_name: "Hamza Ali", phone: "03214567890", address: "House 21, Peoples Colony No. 2, Faisalabad", lat: 31.4021, lng: 73.1180,
    items: [{ item_code: "Chicken Tikka", qty: 2 }, { item_code: "Fried Fish", qty: 1 }, { item_code: "Coke 345ml", qty: 2 }] }) });
  const no = await orderNo(r, o.order);
  await p.goto(`${L.BASE}/ros/kds`);
  await p.getByText("Placed", { exact: true }).first().waitFor();
  await L.titleCard(p, "Restaurant OS · Kitchen", "Kitchen display (KDS)", "Every channel in one queue — bump lines, move tickets, assign the rider");
  await cap(p, "Columns: Placed → Preparing → Ready → Completed", "Live over Socket.IO; filter by station at the top", 2400);
  const card = kdsCard(p, `Delivery #${no}`, "Hamza Ali");
  await card.scrollIntoViewIfNeeded();
  await cap(p, `New phone order <b>#${no}</b> just arrived`, "Lines are routed to stations: Grill, Fryer, Drinks", 2400);
  await H.click(card.locator("button[title='Start cooking']").first(), 1800);
  await cap(p, "Start cooking — the ticket moves to Preparing", "", 1600);
  const lineBtns = () => kdsCard(p, `Delivery #${no}`, "Hamza Ali").locator("button:has(span.min-w-0)");
  const n = await lineBtns().count();
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 3; tries++) {                // a tap during a refresh is lost: repeat until the line shows its check
      if (await lineBtns().nth(k).locator("svg.lucide-check").count()) break;
      await H.click(lineBtns().nth(k), 1300);
    }
  }
  await cap(p, "Each cook bumps their line when it's done", "All lines ready → the ticket moves to Ready by itself", 2400);
  const c2 = kdsCard(p, `Delivery #${no}`, "Hamza Ali");
  await c2.scrollIntoViewIfNeeded();
  for (let tries = 0; tries < 3; tries++) {
    const card = kdsCard(p, `Delivery #${no}`, "Hamza Ali");
    if (await card.getByText(/Imran Ali ·/).count()) break;
    if (!(await card.getByRole("button", { name: /Imran Ali/ }).count())) await H.click(card.getByRole("button", { name: /Assign rider/ }).last(), 1200);
    if (tries === 0) await cap(p, "Assign the rider from the ticket", "Off-duty riders can be checked in and assigned in one tap", 2000);
    await card.getByRole("button", { name: /Imran Ali/ }).first().click();
    await p.waitForTimeout(2500);
  }
  await cap(p, "Imran is on duty and has the delivery", "His rider app shows it straight away", 2600);
  await L.shot(p, "08-done");
  await L.endCard(p, "Ticket cooked & rider assigned");
  return L.finish(r);
};

function riderCard(p, who, no) {      // a job is an <article>; skip the "new offer" copy of the same order
  return p.locator("article").filter({ hasText: `Order #${no}` }).filter({ hasText: who }).filter({ has: p.getByRole("link", { name: "Route" }) }).last();
}

OPS["09-rider-app"] = async () => {
  const r = await L.recording("09-rider-app", { who: "rider1", size: L.PHONE, geo: { latitude: 31.4067, longitude: 73.1135 } });
  const p = r.page;
  const o = (await L.staff("frappe.client.get_list", { doctype: "Restaurant Order", filters: JSON.stringify({ customer_name: "Hamza Ali", status: ["in", ["Ready", "Picked Up", "Out for Delivery"]] }),
    fields: JSON.stringify(["name", "order_no", "delivery_otp", "cod_amount"]), order_by: "creation desc", limit_page_length: 1 }, "GET"))[0];
  if (!o) throw new Error("no ready Hamza Ali order — run 08 first");
  await p.goto(`${L.BASE}/ros/rider`);
  await p.getByText("Cash in hand").waitFor();
  await L.titleCard(p, "Restaurant OS · Rider app", "Rider app", "Accept, pick up, navigate and deliver with the customer's code — cash is tracked");
  await cap(p, "Imran's phone: on duty, live GPS shared", "Offers and his deliveries", 2400);
  const card = riderCard(p, "Hamza Ali", o.order_no);
  await card.scrollIntoViewIfNeeded();
  await cap(p, `Order #${o.order_no} — Hamza Ali, Main Market`, "Call or open the route in Maps", 2400);
  await L.shot(p, "09-card");
  await H.click(card.getByRole("button", { name: /Picked up/ }), 2200);
  await cap(p, "Picked up at the counter — the customer sees “Out for delivery”", "", 2400);
  await cap(p, "At the door: tap Delivered", "", 900);
  await H.click(riderCard(p, "Hamza Ali", o.order_no).getByRole("button", { name: /Delivered/ }), 1400);
  await L.shot(p, "09-sheet");
  await cap(p, "Enter the customer's 4-digit code", "Proof of delivery (or a photo)", 1000);
  await H.type(p.getByPlaceholder("4 digits"), o.delivery_otp);
  const cash = p.getByRole("spinbutton").last();
  if (await cash.count()) { await H.type(cash, String(Math.round(o.cod_amount))); }
  await cap(p, `Cash collected: Rs ${Math.round(o.cod_amount).toLocaleString()}`, "It goes into Imran's cash in hand until he hands it over", 1800);
  await H.click(p.getByRole("button", { name: /Confirm|Delivered|Complete/ }).last(), 3000);
  await L.shot(p, "09-done");
  await cap(p, "Delivered — invoice made, cash in hand updated", "The customer's tracking page asks for a rating", 3000);
  await L.endCard(p, "Delivered");
  return L.finish(r);
};

OPS["10-dispatch-phone-order"] = async () => {
  const r = await L.recording("10-dispatch-phone-order", { who: "cashier" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/dispatch`);
  await p.getByRole("button", { name: /Phone order/ }).waitFor();
  await p.waitForTimeout(1500);
  await L.titleCard(p, "Restaurant OS · Delivery", "Dispatch & phone orders", "Take a phone order, see riders and orders on the map, assign, and collect rider cash");
  await cap(p, "Every delivery and rider on one map", "Own riders (blue) and Foodpanda riders (pink), with ETAs", 2600);
  await H.click(p.getByRole("button", { name: /Phone order/ }), 1200);
  const d = p.getByRole("dialog").last();
  const inputs = d.locator("input:not([placeholder='Search the menu'])");
  await cap(p, "A customer calls to order", "", 600);
  await H.type(inputs.nth(0), "Sana Tariq");
  await H.type(inputs.nth(1), "03331234567");
  await H.type(inputs.nth(2), "12-B, Madina Town, Faisalabad");
  await cap(p, "Pin the drop-off on the map", "Distance and ETA come from the pin", 900);
  const mini = d.locator(".leaflet-container").first();
  const box = await mini.boundingBox();
  await p.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.7); await p.waitForTimeout(900);
  await cap(p, "Add the dishes", "", 500);
  await H.click(d.getByRole("button", { name: /^Chicken Karahi/ }), 500);
  await H.click(d.getByRole("button", { name: /^Garlic Bread/ }), 500);
  await H.click(d.getByRole("button", { name: /^Mint Lemonade/ }), 500);
  await H.click(d.getByRole("button", { name: /^Mint Lemonade/ }), 700);
  await L.shot(p, "10-form");
  await H.click(d.getByRole("button", { name: /Send to kitchen/ }), 2500);
  await cap(p, "On the KDS straight away, cash on delivery", "When it's ready, the nearest free rider is offered it", 2600);
  await L.shot(p, "10-sent");
  // the rider list: cash in hand → hand over at the counter
  const cashBtn = p.locator("button").filter({ hasText: /₨[1-9][\d,]*\.\d\d/ }).filter({ has: p.locator("svg") }).first();
  if (await cashBtn.count()) {
    await cashBtn.scrollIntoViewIfNeeded();
    await cap(p, "Imran is back with cash from his delivery", "Tap his cash to hand it over", 2200);
    await H.click(cashBtn, 1500);
    await cap(p, "Handed over — the cash lands in this shift's drawer", "A journal from Rider Cash to Cash, counted at close", 3000);
  }
  await L.endCard(p, "Phone order dispatched");
  return L.finish(r);
};

async function webAdd(p, name) {
  await H.click(p.getByRole("button", { name: new RegExp(name) }).first(), 1200);
  const add = p.getByRole("button", { name: /^Add · / });
  await H.click(add, 1200);
}

OPS["11-online-order"] = async () => {
  const r = await L.recording("11-online-order", { size: L.PHONE, geo: { latitude: 31.4025, longitude: 73.1190 } });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/order`);
  await p.getByRole("button", { name: /Chicken Karahi/ }).first().waitFor();
  await L.titleCard(p, "Restaurant OS · Online", "Order online", "The customer's ordering site / installable app: menu, add-ons, promo code, checkout, tracking");
  await cap(p, "The menu — sold-out dishes hide by themselves", "", 2200);
  await H.click(p.getByRole("button", { name: /Chicken Karahi/ }).first(), 1300);
  await cap(p, "Choose add-ons", "Bread and spice level — priced live", 1200);
  await H.click(p.getByRole("button", { name: /2 Roti/ }), 800);
  await H.click(p.getByRole("button", { name: /^Hot/ }), 900);
  await H.click(p.getByRole("button", { name: /^Add · / }), 1200);
  await webAdd(p, "Garlic Bread");
  await webAdd(p, "Mint Lemonade");
  await cap(p, "Cart total at the bottom", "", 1400);
  await p.getByRole("button", { name: /\d+ items?/ }).last().click({ position: { x: 50, y: 25 } });   // the toast covers its right side
  await p.waitForTimeout(1200);
  await cap(p, "Checkout — the offer added a free Raita", "Delivery or pickup", 2200);
  await H.type(p.getByLabel(/Your name/), "Sara Khan");
  await H.type(p.getByLabel(/Mobile number/), "03119998877");
  await H.type(p.getByLabel(/Delivery address/), "House 45, Peoples Colony No. 2, Faisalabad");
  await H.click(p.getByRole("button", { name: /Use my location/ }), 1500);
  await cap(p, "Pinned by GPS — inside the delivery area", "", 1400);
  await H.type(p.getByPlaceholder("Promo code"), "WELCOME10");
  await H.click(p.getByRole("button", { name: "Apply", exact: true }), 2000);
  await cap(p, "Promo code applied", "New mobile numbers join Saffron Rewards and earn points", 2200);
  await p.getByText(/Total|To pay/).last().scrollIntoViewIfNeeded();
  await L.shot(p, "11-totals");
  await p.waitForTimeout(1500);
  await cap(p, "Pay cash on delivery — or online", "", 1200);
  await H.click(p.getByRole("button", { name: /Place order/ }), 3500);
  await L.shot(p, "11-track");
  await cap(p, "Tracking page: steps, ETA, rider on the map, delivery code", "The link is also sent by WhatsApp", 3200);
  await L.endCard(p, "Order placed");
  return L.finish(r);
};

OPS["12-online-payment"] = async () => {
  const r = await L.recording("12-online-payment", { size: L.PHONE });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/order`);
  await p.getByRole("button", { name: /Chicken Karahi/ }).first().waitFor();
  await L.titleCard(p, "Restaurant OS · Online", "Pay online", "Card / wallet through the payment gateway — unpaid orders stay off the kitchen screen");
  await webAdd(p, "Chicken Tikka");
  await webAdd(p, "Fresh Orange Juice");
  await p.getByRole("button", { name: /\d+ items?/ }).last().click({ position: { x: 50, y: 25 } });
  await p.waitForTimeout(1200);
  await H.click(p.getByRole("button", { name: /Pickup/ }), 900);
  await cap(p, "Pickup order", "", 800);
  await H.type(p.getByLabel(/Your name/), "Bilal Ahmed");
  await H.type(p.getByLabel(/Mobile number/), "03125556677");
  await H.click(p.getByRole("button", { name: /Pay online/ }), 1200);
  await cap(p, "Pay online — card or wallet", "Test gateway: no real money moves", 1800);
  await H.click(p.getByRole("button", { name: /^Pay · / }), 3000);
  await L.shot(p, "12-gateway");
  await cap(p, "The payment page (Safepay / PayFast / JazzCash once live)", "The order waits off the KDS until paid", 2400);
  await H.click(p.getByRole("button", { name: /Approve|Pay|Success/ }).first(), 3500);
  await L.shot(p, "12-paid");
  await cap(p, "Paid — now the kitchen starts cooking", "Nothing to collect at pickup; a Payment Entry settles the invoice", 3200);
  await L.endCard(p, "Paid online");
  return L.finish(r);
};

OPS["13-kiosk-self-order"] = async () => {
  const r = await L.recording("13-kiosk-self-order", { who: "cashier" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/kiosk`);
  await p.getByRole("button", { name: /Touch to order/ }).waitFor();
  await L.titleCard(p, "Restaurant OS · Kiosk", "Self-order kiosk", "Guests order on the tablet; the cashier takes payment and the kitchen starts");
  await cap(p, "Touch to order", "Resets itself after 90 s idle", 1400);
  await H.click(p.getByRole("button", { name: /Touch to order/ }), 1300);
  await H.click(p.getByRole("button", { name: /Eat in/ }), 1500);
  await cap(p, "Big photos, big buttons", "Categories down the side", 1600);
  await H.click(p.getByRole("button", { name: /Chicken Malai Boti/ }).first(), 1300);
  await H.click(p.getByRole("button", { name: /Extra Cheese/ }), 700);
  await H.click(p.getByRole("button", { name: /^Hot/ }), 700);
  await H.click(p.getByRole("button", { name: /^Add · / }), 1300);
  await H.click(p.getByRole("button", { name: /Sides & Add-ons/ }), 1000);
  await H.click(p.getByRole("button", { name: /French Fries/ }).first(), 1200);
  await H.click(p.getByRole("button", { name: /^Add · / }), 1200);
  await H.type(p.getByPlaceholder(/Your name/), "Usman");
  await cap(p, "Order — pay at the counter", "", 900);
  await H.click(p.getByRole("button", { name: /Order · pay at counter/ }), 3000);
  await L.shot(p, "13-number");
  await cap(p, "The guest gets an order number", "The sale waits on the counter as a held sale — the kitchen waits for payment", 3000);
  // the counter
  await p.goto(`${L.BASE}/ros/pos/terminal`);
  await p.getByPlaceholder(/Search by item code/).waitFor();
  await cap(p, "At the counter: Held sales", "Kiosk orders appear here with their number", 1400);
  await H.click(p.getByRole("button", { name: "Held", exact: true }), 1600);
  await L.shot(p, "13-held");
  await H.click(p.getByRole("dialog").getByRole("button", { name: /Resume/ }).first(), 2000);
  await cap(p, "The kiosk order is in the cart", "Take payment", 1600);
  await H.click(p.getByRole("button", { name: /Checkout/ }), 1400);
  await H.click(p.getByRole("button", { name: /Complete sale/ }), 3000);
  await cap(p, "Paid — now it goes to the kitchen (channel: Kiosk)", "", 2800);
  await L.endCard(p, "Kiosk order paid");
  return L.finish(r);
};

OPS["14-foodpanda-order"] = async () => {
  const r = await L.recording("14-foodpanda-order", { who: "manager" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/kds`);
  await p.getByText("Placed", { exact: true }).first().waitFor();
  await L.titleCard(p, "Restaurant OS · Aggregators", "Foodpanda order", "Orders arrive by webhook, join the same queue, and are invoiced when delivered");
  await cap(p, "Foodpanda sends an order to our webhook", "Signed with the shared secret once Live; mock mode for now", 1200);
  const fp = await L.staffJson("restaurant_os.api.integrations.foodpanda_order", {
    order_id: `FP-VID-${Date.now().toString(36).toUpperCase()}`, expedition_type: "delivery",
    customer: { name: "Mehreen Q.", phone: "+92 321 7654321" },
    address: { text: "House 9, Kohinoor City, Faisalabad", latitude: 31.4125, longitude: 73.1052 },
    products: [{ remote_code: "Chicken Seekh Kabab", quantity: 2, unit_price: 690 }, { remote_code: "French Fries", quantity: 1, unit_price: 390 }] });
  const no = fp.order_no;
  await p.waitForTimeout(4500);                              // the board refreshes (Socket.IO / polling)
  const card = () => p.locator("article").filter({ hasText: `#${no}` }).filter({ hasText: "Mehreen Q." }).first();
  await card().waitFor({ timeout: 20000 });
  await card().scrollIntoViewIfNeeded();
  await cap(p, `Foodpanda order <b>#${no}</b> on the kitchen screen`, "Foodpanda prices; Foodpanda delivers it", 2400);
  await H.click(card().locator("button[title='Start cooking']").first(), 1500);
  const lines = () => card().locator("button:has(span.min-w-0)");
  const n = await lines().count();
  for (let k = 0; k < n; k++) {
    for (let t = 0; t < 3; t++) { if (await lines().nth(k).locator("svg.lucide-check").count()) break; await H.click(lines().nth(k), 1200); }
  }
  await card().scrollIntoViewIfNeeded();
  await cap(p, "Ready — Foodpanda's rider is on the way", "Tracked on the dispatch map and the customer's page", 2600);
  await L.shot(p, "14-ready");
  for (let t = 0; t < 2; t++) {
    const b = card().locator("button[title='Serve / hand over'], button[title='Mark delivered']").first();
    if (!(await b.count())) break;
    await H.click(b, 1800);
  }
  await cap(p, "Handed to the Foodpanda rider, then delivered", "Only now is the Sales Invoice made (Foodpanda customer & price list)", 3000);
  await L.shot(p, "14-done");
  await L.endCard(p, "Foodpanda order delivered");
  return L.finish(r);
};

OPS["15-customer-review"] = async () => {
  const r = await L.recording("15-customer-review", { size: L.PHONE });
  const p = r.page;
  const o = (await L.staff("frappe.client.get_list", { doctype: "Restaurant Order", filters: JSON.stringify({ customer_name: "Hamza Ali", status: "Delivered", review: ["is", "not set"] }),
    fields: JSON.stringify(["name", "order_no", "tracking_key"]), order_by: "creation desc", limit_page_length: 1 }, "GET"))[0];
  if (!o) throw new Error("no delivered, unrated Hamza Ali order — run 08/09 first");
  await p.goto(`${L.BASE}/ros/track/${o.tracking_key}`);
  await p.getByText(/How was your order/).waitFor();
  await L.titleCard(p, "Restaurant OS · Reviews", "Rate the order", "After delivery the tracking page (and a WhatsApp link) asks the customer for a review");
  await cap(p, `Order #${o.order_no} delivered — how was it?`, "", 1800);
  await p.getByText(/How was your order/).scrollIntoViewIfNeeded();
  await H.click(p.getByRole("radio", { name: "2 stars" }).first(), 900);
  await cap(p, "Overall, food and delivery — and each dish", "", 1200);
  await H.click(p.getByRole("radiogroup", { name: "Food rating" }).getByRole("radio", { name: "2 stars" }), 600);
  await H.click(p.getByRole("radiogroup", { name: "Delivery rating" }).getByRole("radio", { name: "5 stars" }), 600);
  const fish = p.getByRole("radiogroup", { name: /Fried Fish rating/ });
  if (await fish.count()) await H.click(fish.getByRole("radio", { name: "1 star" }), 600);
  await H.type(p.getByPlaceholder(/Tell us more/), "Fish was cold, rider was quick and polite.");
  await H.click(p.getByRole("button", { name: /Send review/ }), 2500);
  await cap(p, "Thank you!", "2 stars or less alerts the managers straight away", 3000);
  await L.shot(p, "15-done");
  await L.endCard(p, "Review sent");
  return L.finish(r);
};

OPS["16-stock-receive-and-wastage"] = async () => {
  const r = await L.recording("16-stock-receive-and-wastage", { who: "manager" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/stock`);
  await p.getByText("Receive stock").first().waitFor();
  await L.titleCard(p, "Restaurant OS · Stock", "Receive stock & log wastage", "Top up the kitchen from the central store; record food thrown away with a reason");
  await cap(p, "The kitchen shelf, with reorder warnings", "Low items show under Needs restocking", 2200);
  const chip = p.getByRole("button", { name: /^\+?\s*Coffee Beans/ }).first();
  if (await chip.count()) await H.click(chip, 1300);
  else {
    await H.type(p.getByPlaceholder(/Search item or scan barcode/), "Tomato");
    await p.waitForTimeout(900);
    const hit = p.locator("ul li > button").filter({ hasText: /Tomato/ }).first();
    await hit.waitFor({ timeout: 10000 });
    await H.click(hit, 1200);
  }
  await cap(p, "Transfer in from Central Store", "Quantity is editable", 1200);
  await H.type(p.getByPlaceholder(/Morning top-up/), "Top-up for the evening rush");
  await H.click(p.getByRole("button", { name: /^Transfer .* item/ }), 2600);
  await cap(p, "Stock Entry posted — the shelf updates", "Central Store → Gulberg Kitchen", 2400);
  // wastage
  await p.goto(`${L.BASE}/ros/restaurant/wastage/new`);
  await p.getByText("New Wastage Log").first().waitFor();
  await cap(p, "Wastage Log: food thrown away, with a reason", "", 1600);
  const reason = p.locator("select").filter({ has: p.locator("option", { hasText: "Burnt / Overcooked" }) });
  await reason.selectOption({ label: "Burnt / Overcooked" }); await p.waitForTimeout(800);
  await H.click(p.getByRole("button", { name: /Add Row/ }), 900);
  await p.mouse.move(800, 500); await p.mouse.wheel(0, 900); await p.waitForTimeout(700);   // above the sticky Save bar
  const ing = p.locator("input[placeholder*='Search Ingredient']:visible").first();
  await H.type(ing, "Chicken Whole");
  await p.waitForTimeout(1200);
  await L.shot(p, "16-ing");
  await H.click(p.locator("li > button:visible").filter({ hasText: /^\s*Chicken Whole/ }).first(), 900);
  const qty = p.locator("table input:visible").nth(2);       // Ingredient · Item Name · Qty
  await H.type(qty, "1.5");
  await H.type(p.locator("textarea").first(), "Tikka batch burnt on the grill");
  await cap(p, "1.5 kg Chicken Whole, burnt on the grill", "Cost is worked out from the valuation rate", 1400);
  await H.click(p.getByRole("button", { name: "Save", exact: true }).first(), 2500);
  await cap(p, "Saved as draft — submit to take it out of stock", "", 1500);
  await H.click(p.getByRole("button", { name: "Submit", exact: true }).first(), 1500);
  const confirm = p.getByRole("dialog").getByRole("button", { name: /^(Submit|Yes|Confirm)/ });
  if (await confirm.count()) await H.click(confirm.first(), 2500);
  await p.waitForTimeout(1500);
  await L.shot(p, "16-submitted");
  await cap(p, "Submitted — a Material Issue left the kitchen", "Wastage feeds the variance report and food-cost %", 3000);
  await L.endCard(p, "Stock received & wastage logged");
  return L.finish(r);
};

OPS["17-owner-dashboard-reports"] = async () => {
  const r = await L.recording("17-owner-dashboard-reports", { who: "manager" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/restaurant/dashboard`);
  await p.waitForTimeout(3500);
  await L.titleCard(p, "Restaurant OS · Owner", "Owner dashboard & reports", "Today's business live, then sales, kitchen, menu engineering, customers and variance");
  await cap(p, "Today vs yesterday: net sales, orders, ticket, food cost %", "Live — refreshes as orders move", 3000);
  for (const [dy, text, sub] of [[500, "Sales by hour and by channel", "Top items"], [600, "Open orders, late tickets, kitchen load", "Tables, riders, deliveries waiting"], [700, "Low stock, sold-out dishes, reviews", "Alerts: late orders, waiting deliveries, low ratings"]]) {
    await p.mouse.move(800, 500); await p.mouse.wheel(0, dy); await p.waitForTimeout(600);
    await cap(p, text, sub, 2600);
  }
  await p.goto(`${L.BASE}/ros/restaurant/reports`);
  await p.getByRole("button", { name: "Sales", exact: true }).waitFor();
  await p.waitForTimeout(1500);
  await cap(p, "Reports: sales by channel, branch, item, hour, day part, cashier", "Export any table as CSV", 2800);
  const sel = p.locator("select").filter({ has: p.locator("option", { hasText: "Hour" }) });
  if (await sel.count()) { await sel.selectOption({ label: "Hour" }); await p.waitForTimeout(1800); await cap(p, "…grouped by hour", "", 1800); }
  for (const tab of ["Kitchen & Delivery", "Menu Engineering", "Customers", "Variance"]) {
    const t = p.getByRole("button", { name: tab, exact: true });
    await H.click((await t.count()) ? t : p.getByText(tab, { exact: true }).first(), 1500);
    const sub = { "Kitchen & Delivery": "Prep time per station, late tickets, delivery times, riders", "Menu Engineering": "Popularity × margin: stars, plowhorses, puzzles, dogs",
      "Customers": "New vs repeat, lifetime value, review scores", "Variance": "Theoretical (recipes) vs actual (counts) per ingredient" }[tab];
    await cap(p, tab, sub, 2600);
  }
  await L.endCard(p, "Owner dashboard & reports");
  return L.finish(r);
};

OPS["18-reviews-and-campaigns"] = async () => {
  const r = await L.recording("18-reviews-and-campaigns", { who: "manager" });
  const p = r.page;
  p.on("dialog", (d) => d.accept());                       // "Send this campaign…?" confirm
  await p.goto(`${L.BASE}/ros/restaurant/reviews`);
  await p.waitForTimeout(3000);
  await L.titleCard(p, "Restaurant OS · Guests", "Reviews & campaigns", "Answer low ratings, then bring lapsed customers back with a WhatsApp coupon");
  await cap(p, "Every review, newest first", "Low ratings already alerted the managers", 2400);
  await H.click(p.getByText("Hamza Ali").first(), 2000);
  await cap(p, "Stars for overall, food, delivery and each dish", "", 2200);
  const status = p.locator("select").filter({ has: p.locator("option", { hasText: "Acknowledged" }) });
  if (await status.count()) await status.selectOption({ label: "Acknowledged" });
  const note = p.locator("textarea:visible").last();
  await H.type(note, "Called Hamza, apologised, sent a free fish voucher.");
  await H.click(p.getByRole("button", { name: /^(Save|Update)$/ }).first(), 2200);
  await cap(p, "Acknowledged with a manager note", "", 2000);
  await p.goto(`${L.BASE}/ros/restaurant/campaigns/new`);
  await p.getByText("New Campaign").first().waitFor();
  await cap(p, "A WhatsApp campaign", "Segments: lapsed, new this month, top spenders, everyone", 1800);
  await H.type(p.locator("input:visible").first(), "Weekend Karahi treat");
  const seg = p.locator("select").filter({ has: p.locator("option", { hasText: "Everyone with a mobile" }) });
  await seg.selectOption({ label: "Everyone with a mobile" }); await p.waitForTimeout(700);
  const coupon = p.getByPlaceholder(/Search Coupon/);
  await H.type(coupon, "WELCOME10"); await p.waitForTimeout(1000);
  await H.click(p.locator("li > button:visible").filter({ hasText: /WELCOME10/ }).first(), 900);
  await H.click(p.getByRole("button", { name: "Save", exact: true }).first(), 2500);
  await H.click(p.getByRole("button", { name: /^Actions/ }).first(), 900);
  await L.shot(p, "18-actions");
  await H.click(p.getByText("Preview recipients").first(), 2600);
  await cap(p, "Who will get it", "", 2200);
  await H.click(p.getByRole("button", { name: /^Actions/ }).first(), 900);
  await H.click(p.getByText("campaign", { exact: true }).first(), 3000);   // "Send campaign", under Messages
  await cap(p, "Sent (WhatsApp mock) — each recipient is logged", "{name}, {restaurant}, {coupon} and {link} filled in per customer", 3000);
  await L.endCard(p, "Review answered & campaign sent");
  return L.finish(r);
};

OPS["19-customer-display"] = async () => {
  const r = await L.recording("19-customer-display", { who: "cashier" });
  const p = r.page;                                         // recorded: the customer's screen
  await p.goto(`${L.BASE}/ros/display`);
  await p.waitForTimeout(3000);
  await L.titleCard(p, "Restaurant OS · Counter", "Customer-facing display", "The second screen turned to the customer mirrors the terminal live — even offline");
  await cap(p, "Between customers: dishes and today's offers", "Opened from the terminal's Customer display button", 5000);
  const t = await r.ctx.newPage();                          // the cashier's terminal on the same PC
  await t.goto(`${L.BASE}/ros/pos/terminal`);
  await t.getByPlaceholder(/Search by item code/).waitFor();
  await p.bringToFront();
  const ring = async (q, name, full = true) => {
    await t.getByPlaceholder(/Search by item code/).fill(q); await t.waitForTimeout(700);
    await t.getByRole("button", { name: new RegExp(`(^|\\s)${name}\\s`) }).first().click(); await t.waitForTimeout(900);
    if (full) { await t.getByRole("button", { name: "Full", exact: true }).last().click().catch(() => undefined); await t.waitForTimeout(700); }
  };
  await cap(p, "The cashier rings up a Chicken Karahi…", "", 300);
  await ring("karahi", "Chicken Karahi");
  await p.waitForTimeout(2600);
  await cap(p, "…the free Raita offer shows straight away", "Photos, quantities, list price struck through", 2400);
  await ring("tikka", "Chicken Tikka");
  await p.waitForTimeout(1800);
  await ring("lemonade", "Mint Lemonade");
  await p.waitForTimeout(1800);
  await cap(p, "Tax, FBR fee and the total glide in", "", 2600);
  await t.getByRole("button", { name: /Checkout/ }).click(); await t.waitForTimeout(1500);
  await cap(p, "Paying: amount to pay, paid, change", "", 2400);
  const quick = t.getByRole("button", { name: /^₨[\d,]+\.00$/ }).nth(1);
  await quick.click().catch(() => undefined); await t.waitForTimeout(2000);
  await t.getByRole("button", { name: /Complete sale/ }).click(); await t.waitForTimeout(4500);
  await cap(p, "Thank you — change due and the FBR QR to verify", "Back to the menu after 15 seconds", 5000);
  await L.endCard(p, "Customer display");
  await t.close();
  return L.finish(r);
};

OPS["20-close-shift-z-report"] = async () => {
  const r = await L.recording("20-close-shift-z-report", { who: "cashier" });
  const p = await terminal(r, "Restaurant OS · Counter", "Close the shift", "Count the drawer, check the variance, post the closing entry and print the Z-report");
  await H.click(p.getByRole("button", { name: "Close shift", exact: true }).first(), 2000);
  await cap(p, "The shift at a glance: sales, returns, tax, discounts", "Every invoice of the shift is listed", 3000);
  const dlg = p.getByRole("dialog").last();
  await dlg.locator("input[aria-label='Actual Cash'], input[placeholder='Actual Cash']").first().scrollIntoViewIfNeeded().catch(() => undefined);
  await L.shot(p, "20-count");
  await cap(p, "Count each payment mode", "Expected includes cash in / out and rider handovers", 2800);
  await H.click(dlg.getByRole("button", { name: /Close shift & post/ }), 4500);
  await L.shot(p, "20-done");
  await cap(p, "Closing shift posted — POS Invoices merged into Sales Invoices", "Z-report printed for the drawer", 3500);
  await L.endCard(p, "Shift closed");
  return L.finish(r);
};

OPS["21-website-and-demo-request"] = async () => {
  const r = await L.recording("21-website-and-demo-request");
  const p = r.page;
  await p.goto(`${L.BASE}/ros/`);
  await p.getByText("one screen.").first().waitFor();
  await L.titleCard(p, "MicroMax POS · Website", "Website visit & demo request", "What a restaurant owner sees: features, screens, pricing — and booking a demo");
  await cap(p, "The public website", "Prices, plans and contact come from Restaurant → Website Settings", 3000);
  const scrollTo = async (id, t, sub, ms = 3000) => { await p.evaluate((i) => document.getElementById(i)?.scrollIntoView({ behavior: "smooth" }), id); await p.waitForTimeout(1400); await cap(p, t, sub, ms); };
  await scrollTo("features", "How it works", "Every step triggers the next automatically");
  await scrollTo("modules", "Real product screens", "Kitchen display, customer display, kiosk, riders, dashboard");
  for (let k = 0; k < 6; k++) { await p.mouse.wheel(0, 700); await p.waitForTimeout(700); }
  await scrollTo("pricing", "Pricing in PKR, monthly or yearly", "", 1500);
  await H.click(p.getByRole("button", { name: /^Monthly/ }), 1500);
  await H.click(p.getByRole("button", { name: /^Yearly/ }), 1200);
  await cap(p, "Yearly shows the 2 months free", "", 1500);
  await scrollTo("faq", "Common questions", "", 800);
  await H.click(p.getByRole("button", { name: /work when the internet goes down/ }), 2000);
  await scrollTo("demo", "Book a free demo", "Each request becomes a Lead in ERPNext for the sales team", 1200);
  const f = p.locator("#demo form");
  await H.type(f.locator("input").nth(0), "Bilal Ahmed");
  await H.type(f.locator("input").nth(1), "03001112233");
  await H.type(f.locator("input").nth(2), "Cafe Lyallpur");
  await H.type(f.locator("input").nth(3), "Faisalabad");
  await H.click(f.getByRole("button", { name: /Book my free demo/ }), 2500);
  await cap(p, "Sent — the sales team gets the Lead", "", 3000);
  await L.endCard(p, "Website & demo request");
  return L.finish(r);
};

OPS["22-invoice-lists"] = async () => {
  const r = await L.recording("22-invoice-lists", { who: "manager" });
  const p = r.page;
  await p.goto(`${L.BASE}/ros/pos/invoices`);
  await p.getByText("Net sales").first().waitFor(); await p.waitForTimeout(1500);
  await L.titleCard(p, "Restaurant OS · Counter", "Invoice lists", "POS and Sales Invoices with totals, status tabs, search and day groups");
  await cap(p, "Totals for whatever you filter", "Net sales, tax, still to collect, returns", 2800);
  await H.click(p.getByRole("button", { name: /^Paid/ }), 1800);
  await H.click(p.getByRole("button", { name: /^All/ }), 1200);
  await cap(p, "Grouped by day: payment, FBR, cashier, status", "", 2600);
  await p.goto(`${L.BASE}/ros/pos/sales`); await p.getByText("Net sales").first().waitFor(); await p.waitForTimeout(1200);
  await cap(p, "Sales Invoices: deliveries, web, phone, Foodpanda, merged shifts", "", 2400);
  await p.locator("select").filter({ has: p.locator("option", { hasText: "All channels" }) }).selectOption({ label: "Web" }); await p.waitForTimeout(1800);
  await cap(p, "Filter by channel", "", 1500);
  await H.click(p.getByRole("button", { name: /^Unpaid/ }).first().or(p.getByRole("button", { name: /^All/ })).first(), 1800);
  await H.type(p.getByPlaceholder("Invoice or customer…"), "Test"); await p.waitForTimeout(1800);
  await cap(p, "Search by invoice or customer", "Click a row to open the invoice", 2400);
  await L.endCard(p, "Invoice lists");
  return L.finish(r);
};

module.exports = OPS;
