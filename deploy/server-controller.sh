#!/bin/bash
# O'zini joylashtiradi. Diqqat: qayta ishga tushirish shu skriptni ham
# to'xtatadi, shuning uchun u kechiktirilib, alohida ishga tushiriladi.
set -euo pipefail
cd /opt/server-controller

echo "==> Kod yangilanmoqda"
git fetch --quiet origin
git reset --quiet --hard origin/main
echo "COMMIT: $(git log -1 --format='%h|%s')"

echo "==> Frontend yig'ilmoqda"
cd frontend
npm ci --no-audit --no-fund --silent
npm run build
cd ..

echo "==> Backend yig'ilmoqda"
cd backend
npm ci --no-audit --no-fund --silent
npx nest build
cd ..

test -f backend/dist/main.js
test -f backend/public/index.html
chmod 600 backend/.env

echo "==> Qayta ishga tushirish 3 soniyadan keyin"
# systemd-run: restart alohida jarayonda bajariladi, shu sabab bu
# skript o'z o'limidan oldin logni yakunlab ulguradi.
systemd-run --on-active=3 --unit=sc-restart-$$ \
  systemctl restart server-controller >/dev/null
echo "Tayyor (xizmat qayta ishga tushmoqda)."
