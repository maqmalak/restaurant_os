// Shared helpers for the Restaurant OS operation videos (Playwright + system Chrome).
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = "http://restaurant.localhost:5181";
const OUT = path.join(__dirname, "out");
const SIZE = { width: 1440, height: 810 };

// demo passwords come from the site's secrets file (never printed)
function secret(key) {
  const txt = fs.readFileSync(path.join(process.env.HOME, ".restaurant-site-secrets"), "utf8");
  const m = txt.match(new RegExp(`^${key}=(.*)$`, "m"));
  if (!m) throw new Error(`${key} missing in secrets file`);
  return m[1].trim();
}
const USERS = {
  cashier: "cashier@saffrongrill.example", manager: "manager@saffrongrill.example", admin: "Administrator",
  rider1: "rider1@saffrongrill.example", rider2: "rider2@saffrongrill.example", rider3: "rider3@saffrongrill.example",
};
const pwd = (who) => (who === "admin" ? secret("ADMIN_PASSWORD") : secret("STAFF_DEMO_PASSWORD"));

// caption bar + click ripple, injected into every page of a recording
const OVERLAY = `
(() => {
  const css = \`
  #ros-cap{position:fixed;right:22px;top:66px;z-index:2147483647;max-width:560px;pointer-events:none;
    font:600 19px/1.35 Inter,system-ui,sans-serif;color:#fff;background:rgba(11,94,87,.94);padding:12px 22px;border-radius:14px;
    box-shadow:0 14px 40px rgba(0,0,0,.35);display:none;letter-spacing:.01em}
  #ros-cap small{display:block;font-weight:400;font-size:15px;opacity:.85;margin-top:2px}
  #ros-cap b{color:#99f6e4}
  #ros-title{position:fixed;inset:0;z-index:2147483647;display:none;align-items:center;justify-content:center;flex-direction:column;
    background:linear-gradient(135deg,#0b5e57,#0d9488);color:#fff;font-family:Inter,system-ui,sans-serif;text-align:center}
  #ros-title .k{font-size:16px;letter-spacing:.3em;text-transform:uppercase;opacity:.8}
  #ros-title .t{font-size:52px;font-weight:800;margin:10px 0 8px}
  #ros-title .s{font-size:20px;opacity:.9;max-width:900px}
  @media (max-width:600px){#ros-cap{left:12px;right:12px;top:10px;bottom:auto;max-width:none;font-size:16px;opacity:.96}#ros-cap small{font-size:13px}
    #ros-title .t{font-size:34px}#ros-title .s{font-size:16px;padding:0 18px}}
  .ros-ripple{position:fixed;z-index:2147483646;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
    border:3px solid #f59e0b;background:rgba(245,158,11,.25);pointer-events:none;animation:rosr .6s ease-out forwards}
  @keyframes rosr{from{transform:scale(.4);opacity:1}to{transform:scale(1.6);opacity:0}}\`;
  const mount = () => {
    if (document.getElementById('ros-cap')) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const cap = document.createElement('div'); cap.id = 'ros-cap'; document.body.appendChild(cap);
    const t = document.createElement('div'); t.id = 'ros-title'; document.body.appendChild(t);
    document.addEventListener('mousedown', (e) => { const r = document.createElement('div'); r.className = 'ros-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  window.__rosCaption = (html) => { mount(); const c = document.getElementById('ros-cap'); c.innerHTML = html; c.style.display = html ? 'block' : 'none'; };
  window.__rosTitle = (html) => { mount(); const t = document.getElementById('ros-title'); t.innerHTML = html; t.style.display = html ? 'flex' : 'none'; };
  if (document.readyState !== 'loading') mount(); else document.addEventListener('DOMContentLoaded', mount);
})();`;

let browser;
async function launch() {
  browser ??= await chromium.launch({ channel: "chrome", headless: true, args: ["--disable-features=Translate", "--lang=en-US"] });
  return browser;
}

/** A recording: its own browser context (cookies) and video. */
const PHONE = { width: 430, height: 860 };

async function recording(slug, { who, size = SIZE, geo } = {}) {
  const b = await launch();
  const dir = path.join(OUT, "raw", slug);
  fs.rmSync(dir, { recursive: true, force: true });
  const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 1, locale: "en-US", recordVideo: { dir, size },
    ...(geo ? { geolocation: geo, permissions: ["geolocation"] } : {}), isMobile: size.width < 600, hasTouch: size.width < 600 });
  await ctx.addInitScript(OVERLAY);
  ctx.setDefaultTimeout(15000);
  if (who) await signIn(ctx, who);
  // a separate API session (no CSRF token, which the browser session gets once a page loads)
  const req = await require("playwright-core").request.newContext({ baseURL: BASE });
  if (who) {
    const res = await req.post(`${BASE}/api/method/login`, { form: { usr: USERS[who], pwd: pwd(who) } });
    if (!res.ok()) throw new Error(`api sign-in failed for ${who}`);
  }
  const page = await ctx.newPage();
  module.exports.current = page;
  return { ctx, page, slug, dir, req };
}

async function signIn(ctx, who) {
  const r = await ctx.request.post(`${BASE}/api/method/login`, { form: { usr: USERS[who], pwd: pwd(who) } });
  if (!r.ok()) throw new Error(`sign-in failed for ${who}: ${r.status()}`);
}

async function caption(page, title, sub = "", ms = 1800) {
  const html = sub ? `${title}<small>${sub}</small>` : title;
  await page.evaluate((h) => window.__rosCaption && window.__rosCaption(h), html).catch(() => undefined);
  if (ms) await page.waitForTimeout(ms);
}

async function titleCard(page, kicker, title, sub, ms = 2600) {
  await page.evaluate(([k, t, s]) => window.__rosTitle && window.__rosTitle(`<div class="k">${k}</div><div class="t">${t}</div><div class="s">${s}</div>`), [kicker, title, sub]);
  await page.waitForTimeout(ms);
  await page.evaluate(() => window.__rosTitle && window.__rosTitle(""));
}

async function endCard(page, text, ms = 2200) {
  await page.evaluate((t) => window.__rosTitle && window.__rosTitle(`<div class="k">Done</div><div class="t">${t}</div><div class="s">Restaurant OS · Saffron Grill demo</div>`), text);
  await page.waitForTimeout(ms);
}

/** Close the context and move its video to out/<slug>.webm */
async function finish(rec) {
  const video = rec.page.video();
  await rec.req?.dispose();
  await rec.ctx.close();
  const src = await video.path();
  const dst = path.join(OUT, `${rec.slug}.webm`);
  fs.renameSync(src, dst);
  fs.rmSync(rec.dir, { recursive: true, force: true });
  return dst;
}

async function shot(page, name) {
  const p = path.join(OUT, "debug", `${name}.png`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p });
  return p;
}

/** Slow, visible typing / clicking for tutorials. */
const human = {
  async type(loc, text) { await loc.click(); await loc.fill(""); await loc.pressSequentially(text, { delay: 55 }); },
  async click(loc, pause = 650) { await loc.scrollIntoViewIfNeeded().catch(() => undefined); await loc.hover().catch(() => undefined); await loc.page().waitForTimeout(250); await loc.click(); await loc.page().waitForTimeout(pause); },
};

async function api(rec, method, params = {}, httpMethod = "POST") {
  const url = `${BASE}/api/method/${method}`;
  const rq = rec.req || rec.request;                       // a recording, or a browser context
  const r = httpMethod === "GET" ? await rq.get(url, { params }) : await rq.post(url, { form: params });
  const j = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${method}: ${r.status()} ${JSON.stringify(j).slice(0, 300)}`);
  return j.message;
}

let staffReq;
/** Back-office lookups / setup as the manager (separate session, not recorded). */
async function staff(method, params = {}, httpMethod = "POST") {
  if (!staffReq) {
    staffReq = await require("playwright-core").request.newContext({ baseURL: BASE });
    const res = await staffReq.post(`${BASE}/api/method/login`, { form: { usr: USERS.admin, pwd: pwd("admin") } });
    if (!res.ok()) throw new Error("staff sign-in failed");
  }
  return api({ req: staffReq }, method, params, httpMethod);
}

/** POST a raw JSON body as the manager (webhooks). */
async function staffJson(method, body) {
  await staff("frappe.auth.get_logged_user", {}, "GET");
  const r = await staffReq.post(`${BASE}/api/method/${method}`, { data: body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok()) throw new Error(`${method}: ${r.status()} ${JSON.stringify(j).slice(0, 300)}`);
  return j.message;
}

async function close() { if (staffReq) await staffReq.dispose(); staffReq = undefined; if (browser) await browser.close(); browser = undefined; }

module.exports = { staffJson, staff, PHONE, BASE, OUT, USERS, recording, signIn, caption, titleCard, endCard, finish, shot, human, api, close, pwd };
