/**
 * «Nima bo'ladi» matnlari.
 *
 * Tasdiqlash oynasining butun ma'nosi shu yerda. «Ishonchingiz komilmi?»
 * degan savol hech narsa bermaydi — foydalanuvchi baribir «ha» bosadi.
 * «Mini App ishlamay qoladi» esa qaror qabul qilishga yordam beradi.
 *
 * Ro'yxat qo'lda yozilgan: xizmat nomi («tanga.service») nima uchun
 * kerakligini server bilmaydi, buni faqat loyihani biladigan odam
 * yozib qo'ya oladi.
 */
const PROJECTS = {
  tanga: "Tanga Mini App — foydalanuvchilar ilovaga kira olmaydi",
  "tanga-admin": "Tanga admin paneli — buyurtma va hisobotlar ochilmaydi",
  "server-controller": "Shu panelning o'zi",
  caddy: "Teskari proksi — HAMMA sayt va shu panel ham ochilmay qoladi",
};

/** Unit yoki konteyner nomidan loyiha tavsifini topadi. */
function describe(name) {
  const base = String(name || "").replace(/\.(service|timer|socket|path)$/, "");
  if (PROJECTS[base]) return PROJECTS[base];
  // `telegrambot-caddy-1` kabi compose nomlari — qismini qidiramiz.
  const hit = Object.keys(PROJECTS).find((key) => base.includes(key));
  return hit ? PROJECTS[hit] : "";
}

const VERBS = {
  start: "ishga tushiriladi",
  stop: "to'xtatiladi",
  restart: "qayta ishga tushiriladi",
  reload: "sozlamalari qayta o'qiladi",
};

/** Tasdiqlash tugmasi amalni takrorlaydi — «OK» hech narsa demaydi. */
const CONFIRM = {
  start: "Ishga tushirilsin",
  stop: "To'xtatilsin",
  restart: "Qayta ishga tushirilsin",
  reload: "Qayta o'qilsin",
};

/** Amal xavflimi — modal rangi va tugma uslubi shunga qarab. */
export function isDanger(action) {
  return action === "stop" || action === "restart";
}

export function unitPlan(unit, action) {
  const what = `${unit} ${VERBS[action] || action}.`;
  const who = describe(unit);

  let consequence = "";
  if (action === "stop") {
    consequence = who
      ? `${who} — to'xtaguncha ishlamaydi. Qayta yoqmaguningizcha o'chiq qoladi.`
      : "Xizmat qayta yoqmaguningizcha o'chiq qoladi.";
  } else if (action === "restart") {
    consequence = who
      ? `${who} bir necha soniyaga uziladi, so'ng o'zi qaytadi.`
      : "Xizmat bir necha soniyaga uziladi, so'ng o'zi qaytadi.";
  } else if (action === "reload") {
    consequence = "Xizmat to'xtamaydi — sozlama fayli qaytadan o'qiladi.";
  }

  return {
    title: `${unit} · ${action}`,
    what,
    consequence,
    command: `systemctl ${action} ${unit}`,
    danger: isDanger(action),
    confirmLabel: CONFIRM[action] || "Bajarish",
  };
}

export function containerPlan(name, action) {
  const what = `${name} konteyneri ${VERBS[action] || action}.`;
  const who = describe(name);

  let consequence = "";
  if (action === "stop") {
    consequence = who
      ? `${who} — to'xtaguncha ishlamaydi.`
      : "Konteyner qayta yoqmaguningizcha o'chiq qoladi.";
  } else if (action === "restart") {
    consequence = who
      ? `${who} bir necha soniyaga uziladi, so'ng o'zi qaytadi.`
      : "Konteyner bir necha soniyaga uziladi, so'ng o'zi qaytadi.";
  }

  return {
    title: `${name} · ${action}`,
    what,
    consequence,
    command: `docker ${action} ${name}`,
    danger: isDanger(action),
    confirmLabel: CONFIRM[action] || "Bajarish",
  };
}
