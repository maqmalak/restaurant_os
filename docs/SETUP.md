# Setup (local bench)

From the bench folder `~/erpnext-react`:

```bash
./apps/restaurant_os/setup_restaurant.sh          # asks once for the MariaDB root password
```

It creates `restaurant.localhost` (Administrator password: `ADMIN_PASSWORD`, default `admin`), sets `host_name`
http://restaurant.localhost:8008, installs `erpnext hrms posawesome mm_core restaurant_os`, migrates, and installs the
frontend packages (pnpm through corepack — nothing global). Re-running it is safe. No other site's config is touched.

Then:

1. Finish the ERPNext setup wizard at http://restaurant.localhost:8008/desk (company, currency, chart of accounts).
2. Create a POS Profile (warehouse, price list, payment modes, cashiers). For POS Awesome cash movements tick *Enable Cash
   Movement*, *Allow POS Expense* / *Allow Cash Deposit* and set the default expense / back-office accounts.
3. Run the servers (or `bench start`, which uses the Procfile entries `web_restaurant` and `restaurant_ui`):

```bash
bench --site restaurant.localhost serve --port 8008
cd apps/restaurant_os/frontend/apps/pos && ./node_modules/.bin/vite
```

POS: http://restaurant.localhost:5181/ros/pos (plain `localhost:5181` redirects there).

Notes
- The bench Redis (11000 / 13000) must be running (`redis_cache` / `redis_queue` in the Procfile).
- Do not run `bench schedule` without checking: it runs every site's scheduled jobs on this shared bench.
- Type-check: `cd apps/restaurant_os/frontend/apps/pos && ./node_modules/.bin/tsc --noEmit`.
- Riders sign in at http://restaurant.localhost:5181/ros/rider (demo riders rider1–3@saffrongrill.example, password in
  ~/.restaurant-site-secrets). Phones need **HTTPS** for GPS (browsers allow geolocation only on secure origins and localhost).
- Maps use OpenStreetMap tiles loaded by the browser; switch to a paid tile / Google Maps key for production traffic.

