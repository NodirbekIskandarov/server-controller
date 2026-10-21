#!/bin/bash
# Quiz botini (test tayyorlov) joylashtiradi: kod, bog'liqliklar, yangi savollar importi, qayta ishga tushirish.
# Asosiy mantiq repo ichida — /opt/quiz/deploy/deploy.sh; bu skript faqat uni chaqiradi va tekshiradi.
set -euo pipefail
cd /opt/quiz

echo "==> Kod yangilanmoqda"
git fetch --quiet origin
git reset --quiet --hard origin/main
echo "COMMIT: $(git log -1 --format='%h|%s')"

bash /opt/quiz/deploy/deploy.sh

echo "==> Tekshiruv"
journalctl -u quiz -n 3 --no-pager -o cat
echo "Tayyor."
