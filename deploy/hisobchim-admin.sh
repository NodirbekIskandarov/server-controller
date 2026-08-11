#!/bin/bash
# Admin panelni joylashtiradi: React frontendni yig'ib, backendni yangilaydi.
set -euo pipefail
cd /opt/hisobchim-admin

echo "==> Kod yangilanmoqda"
git fetch --quiet origin
git reset --quiet --hard origin/main
echo "COMMIT: $(git log -1 --format='%h|%s')"

echo "==> Backend bog'liqliklari"
./.venv/bin/pip install -q -r requirements.txt

echo "==> Frontend yig'ilmoqda"
cd frontend
npm ci --no-audit --no-fund --silent
npm run build
cd ..

echo "==> Sintaksis tekshiruvi"
./.venv/bin/python -c "import app, store, auth, plans, settings, telegram"

echo "==> Huquqlar"
chown -R hisobchi:hisobchi /opt/hisobchim-admin
chmod 600 /opt/hisobchim-admin/.env

echo "==> Qayta ishga tushirish"
systemctl restart hisobchim-admin
sleep 4
systemctl is-active hisobchim-admin

echo "==> Tekshiruv"
curl -sS -m 15 -o /dev/null -w "Admin panel: HTTP %{http_code}\n" \
  https://hisobchim.niskandarov.uz/salomatlik
echo "Tayyor."
