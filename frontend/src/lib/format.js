export function bytes(value, digits = 1) {
  const n = Number(value) || 0;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? Math.round(v) : v.toFixed(v < 10 ? digits : 0)} ${units[i]}`;
}

export function perSec(value) {
  return `${bytes(value)}/s`;
}

export function num(value) {
  return (Number(value) || 0).toLocaleString("ru-RU").replace(/ /g, " ");
}

export function pct(value, digits = 1) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

/** Soniyani «3 kun 4 soat» ko'rinishiga o'giradi. */
export function duration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} kun ${h} soat`;
  if (h) return `${h} soat ${m} daqiqa`;
  return `${m} daqiqa`;
}

export function dt(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 19);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ` +
         `${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function timeOnly(raw) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Yuklanish darajasiga qarab rang — yashil/sariq/qizil ma'no tashiydi. */
export function loadColor(percent) {
  if (percent >= 90) return "var(--danger)";
  if (percent >= 70) return "var(--warn)";
  return "var(--ok)";
}
