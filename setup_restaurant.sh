#!/usr/bin/env bash
# Restaurant OS — create the site and install the apps on this bench (re-run safe).
#
#   ./apps/restaurant_os/setup_restaurant.sh       (from the bench folder; bench new-site asks for the MariaDB root password once)
#
# Site restaurant.localhost (a site cannot share an app's name; *.localhost resolves without /etc/hosts and keeps this
# site's login cookies apart from the other sites on the bench). Desk on :8008, React POS dev server on :5181 at /ros/pos.
# Other sites on this bench are not touched: only restaurant.localhost's own site_config is written.
set -euo pipefail
BENCH="$(cd "$(dirname "$0")/../.." && pwd)"
SITE="restaurant.localhost"
cd "$BENCH"

# 1. app code (already in apps/restaurant_os on this bench; on a new bench: bench get-app <git-url> --branch develop)
grep -qx restaurant_os sites/apps.txt || { ./env/bin/pip install -q -e apps/restaurant_os && echo restaurant_os >> sites/apps.txt; }
[ -e sites/assets/restaurant_os ] || ln -s "$BENCH/apps/restaurant_os/restaurant_os/public" sites/assets/restaurant_os

# 2. site (prompts for the MariaDB root password; set ADMIN_PASSWORD to choose the Administrator password)
if [ ! -d "sites/$SITE" ]; then
  bench new-site "$SITE" --admin-password "${ADMIN_PASSWORD:-admin}"
fi
bench --site "$SITE" set-config developer_mode 1
bench --site "$SITE" set-config allow_tests true
bench --site "$SITE" set-config host_name "http://$SITE:8008"
bench --site "$SITE" set-config webserver_port 8008
bench --site "$SITE" set-config ros_frontend_dev_port 5181

# 3. apps: ERPNext, HRMS (riders are Employees), POS Awesome (shifts, offers, coupons, cash movements, offline sync),
#    mm_core (the React shell's generic form / list helpers) and restaurant_os
for app in erpnext hrms posawesome mm_core restaurant_os; do
  bench --site "$SITE" list-apps | grep -q "^$app" || bench --site "$SITE" install-app "$app"
done
bench --site "$SITE" migrate

# 4. company Saffron Grill (fictional demo; runs the setup wizard), branch, counter, users — then the demo menu, recipes,
#    stock, offers, stations and tables. Both re-run safe. Staff demo password: ~/.restaurant-site-secrets
bench --site "$SITE" ros-setup
bench --site "$SITE" ros-demo
bench --site "$SITE" clear-cache

# 5. React apps: install packages if needed (pnpm via corepack, nothing global) and build into /ros
( cd apps/restaurant_os/frontend && { [ -d node_modules ] || COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install; } \
  && cd apps/pos && COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm build )

echo "Done. Desk: http://$SITE:8008/desk   POS (built): http://$SITE:8008/ros/pos"
echo "Dev: bench --site $SITE serve --port 8008  +  (cd apps/restaurant_os/frontend/apps/pos && ./node_modules/.bin/vite) → http://$SITE:5181/ros/pos"
echo "Tests: bench --site $SITE run-tests --app restaurant_os"
