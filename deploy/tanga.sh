#!/bin/bash
# Tanga boti va Mini App backendini joylashtiradi.
set -euo pipefail
cd /opt/tanga

echo "==> Zaxira nusxa"
/usr/local/bin/tanga-backup --local 2>&1 | tail -3

echo "==> Kod yangilanmoqda"
git fetch --quiet origin
git reset --quiet --hard origin/main
echo "COMMIT: $(git log -1 --format='%h|%s')"

echo "==> Bog'liqliklar"
./.venv/bin/pip install -q -r requirements.txt

echo "==> Sintaksis tekshiruvi"
# Buzuq kod bilan xizmatni qayta ishga tushirmaymiz — avval import
# qilib ko'ramiz, xato bo'lsa eski versiya ishlab turaveradi.
./.venv/bin/python -c "import bot, webapp, db, config, ai, reports, i18n, rates"

echo "==> Huquqlar"
chown -R tanga:tanga /opt/tanga
chmod 600 /opt/tanga/.env /opt/tanga/tanga.db

echo "==> Qayta ishga tushirish"
systemctl restart tanga tanga-webapp
sleep 4
systemctl is-active tanga tanga-webapp

echo "==> Tekshiruv"
curl -sS -m 15 -o /dev/null -w "Mini App: HTTP %{http_code}\n" \
  https://tanga.169-58-23-132.sslip.io/
echo "Tayyor."
