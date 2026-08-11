# Server nazorati

`169.58.23.132` serverini **real vaqtda** kuzatish paneli. Serverda nima
bo'layotganini bir qarashda ko'rsatadi: resurslar, loyihalar, konteynerlar,
xizmatlar, hujumlar va trafik.

**Backend:** NestJS (TypeScript) · **Frontend:** React + Redux Toolkit (RTK Query)
· **Real vaqt:** Server-Sent Events

---

## Nima ko'rsatadi

| Bo'lim | Ma'lumot |
|---|---|
| **Umumiy holat** | CPU, xotira, disk, tarmoq tezligi — har 2 soniyada yangilanadi; oxirgi 3 daqiqa dinamikasi grafikda; server haqida ma'lumot va ishlash muddati |
| **Loyihalar** | Serverdagi har bir loyiha: qancha joy egallagan, ichki tuzilmasi (qaysi katalog qancha), qaysi domenda, qaysi xizmat/konteyner ishlatadi, oxirgi git commit |
| **Konteynerlar** | Docker konteynerlari: holat, CPU, xotira, portlar; obrazlar va Docker egallagan disk |
| **Xizmatlar** | systemd xizmatlari: holat, xotira, qayta ishga tushishlar soni, jonli loglar |
| **Xavfsizlik** | Hujum urinishlari, qaysi IP'dan, **qanday turdagi hujum** (oddiy tilda tushuntirilgan), bloklangan manzillar, firewall qoidalari, SSH sozlamasi |
| **Trafik** | Domenlar bo'yicha so'rovlar, javob kodlari, eng ko'p so'rov yuborgan IP'lar, ochiq portlar |
| **Jonli loglar** | Istalgan systemd xizmati yoki docker konteynerining logi real vaqtda oqadi (`journalctl -f` / `docker logs -f`); matn bo'yicha filtr va pauza |
| **Joylashtirish** | GitHub'ga push qilinganda avtomatik deploy; loglar jonli oqadi; tarix va qo'lda ishga tushirish tugmasi |

## Xavfsizlik tamoyili

**Panel faqat o'qiydi.** Konteynerni to'xtatish, IP bloklash, fayl
o'zgartirish — bularning hech biri yo'q. Panel buzib kirilsa ham u orqali
serverga ta'sir o'tkazib bo'lmaydi.

Boshqa himoya qatlamlari:

- Barcha tizim buyruqlari `execFile` orqali — shell umuman ishtirok
  etmaydi, ya'ni buyruq in'ektsiyasi imkonsiz
- Parol `bcrypt` bilan (12 rounds), muhitda faqat xesh turadi
- JWT `HttpOnly` + `Secure` + `SameSite=Strict` cookie'da; localStorage'da emas
- 5 ta xato urinishdan keyin IP 15 daqiqaga qulflanadi
- Login xato bo'lsa ham parol tekshiriladi — javob vaqti bo'yicha
  login mavjudligini aniqlab bo'lmaydi
- `helmet` bilan CSP: `script-src 'self'`, `frame-ancestors 'none'`
- Umumiy so'rov chegarasi: daqiqasiga 300
- `noindex, nofollow` — qidiruv tizimlariga tushmaydi

---

## O'rnatish

```bash
git clone https://github.com/NodirbekIskandarov/server-controller.git \
  /opt/server-controller
cd /opt/server-controller

# Frontend
cd frontend && npm ci && npm run build && cd ..

# Backend
cd backend && npm ci && npm run build

cp .env.example .env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node scripts/hash.js "sizning-parolingiz"
nano .env          # JWT_SECRET va ADMIN_PASSWORD_HASH ni to'ldiring
chmod 600 .env

sudo cp ../deploy/server-controller.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now server-controller
```

Caddy bloki:

```
server-controller.niskandarov.uz {
    encode gzip
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        -Server
    }
    # SSE oqimi buferlanmasligi kerak — aks holda ma'lumot to'planib keladi
    reverse_proxy 172.30.0.1:8200 {
        flush_interval -1
    }
}
```

## Avtomatik joylashtirish (CI/CD)

`main` tarmog'iga push qilinganda GitHub shu serverga webhook yuboradi,
server o'zi kodni tortib olib qayta yig'adi va xizmatni qayta ishga
tushiradi. Loglar panelning **Joylashtirish** bo'limida jonli oqadi.

**Nega GitHub Actions emas:** Actions daqiqalari hisobga bog'liq va
to'lov muammosi bo'lsa umuman ishga tushmaydi. Webhook bepul va push
bo'lishi bilan darhol keladi.

**Nega SSH kaliti GitHub'da saqlanmaydi:** server o'zi tortadi, GitHub
faqat «yangilanish bor» deb aytadi. Shu sabab GitHub hisobi buzilsa ham
u orqali serverga kirish imkoni ochilmaydi.

### Sozlash

Har bir repoda **Settings → Webhooks → Add webhook**:

| Maydon | Qiymat |
|---|---|
| Payload URL | `https://server-controller.niskandarov.uz/api/deploy/hook/<loyiha>` |
| Content type | `application/json` |
| Secret | `.env` dagi `DEPLOY_SECRET` |
| Events | Just the push event |

`<loyiha>` — `deploy.service.ts` dagi `targets` ro'yxatidan: `hisobchi`,
`hisobchim-admin`, `server-controller`.

### Himoya

- Imzo `X-Hub-Signature-256` bo'yicha, **xom tana** ustidan tekshiriladi
  (JSON qayta yig'ilsa imzo mos kelmaydi)
- Taqqoslash doimiy vaqtda — imzoni belgima-belgi topib bo'lmaydi
- Faqat `main` tarmog'i joylashtiriladi
- Skript yo'li ro'yxatdan olinadi — tashqi matn hech qachon buyruqqa
  aylanmaydi
- Bir loyiha uchun bir vaqtda bitta joylashtirish

### Deploy skripti nima qiladi

`deploy/<loyiha>.sh` ichida. Muhim tartib: **avval zaxira, keyin
sintaksis tekshiruvi, undan keyingina qayta ishga tushirish** — buzuq
kod push qilinsa xizmat qayta ishga tushmaydi va eski versiya ishlab
turaveradi.

## Ishlab chiqish

```bash
cd backend  && npm run start:dev     # http://127.0.0.1:8200
cd frontend && npm run dev           # http://localhost:5174 (/api proxy bilan)
```

## Sozlamalar

| Kalit | Ma'nosi |
|---|---|
| `JWT_SECRET` | Sessiya imzosi, kamida 32 belgi. Almashtirilsa hamma seans tugaydi |
| `ADMIN_USER` | Login |
| `ADMIN_PASSWORD_HASH` | Parolning bcrypt xeshi (`node scripts/hash.js`) |
| `HOST` / `PORT` | Tinglanadigan manzil. Caddy Docker'da bo'lgani uchun `172.30.0.1` |
| `COOKIE_SECURE` | HTTPS orqasida `true` |

## Nima uchun root ostida ishlaydi

`journalctl`, `docker`, `ufw`, `fail2ban-client` va boshqa
foydalanuvchilarning kataloglarini o'qish uchun. Bu ongli qaror: ilova
hech narsani o'zgartirmaydi, systemd cheklovlari esa (`ProtectHome=read-only`,
`NoNewPrivileges`, `ReadWritePaths`) ta'sir doirasini toraytiradi.
