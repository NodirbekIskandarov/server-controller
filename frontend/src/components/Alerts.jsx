import { useEffect, useState } from "react";

/**
 * Alert chegaralari.
 *
 * Brauzerda saqlanadi: bu foydalanuvchining shaxsiy tanlovi va uni
 * serverda saqlash panelga YOZISH amali qo'shishni talab qilardi —
 * panel esa ataylab faqat o'qiydi.
 */
const KEY = "sc.alert-rules";

export const DEFAULT_RULES = {
  cpu: 85,
  mem: 90,
  disk: 85,
  load: 2, // yadro soniga nisbatan
  banned: 40,
  errRate: 5, // 5xx foizi
};

export const RULE_META = {
  cpu: { label: "CPU bandligi", unit: "%", min: 50, max: 99,
         hint: "shu foizdan oshsa ogohlantiradi" },
  mem: { label: "Xotira bandligi", unit: "%", min: 50, max: 99,
         hint: "kesh band deb hisoblanmaydi" },
  disk: { label: "Disk to'lishi", unit: "%", min: 50, max: 99,
          hint: "har bir bo'lim alohida tekshiriladi" },
  load: { label: "Yuk / yadro", unit: "×", min: 1, max: 8,
          hint: "load1 yadro sonidan necha marta katta" },
  banned: { label: "Bloklangan IP", unit: " ta", min: 5, max: 200,
            hint: "fail2ban hozir bloklab turgan manzillar" },
  errRate: { label: "5xx javoblar", unit: "%", min: 1, max: 50,
             hint: "Caddy loglaridagi server xatolari ulushi" },
};

export function loadRules() {
  try {
    return { ...DEFAULT_RULES, ...JSON.parse(localStorage.getItem(KEY) || "{}") };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function useRules() {
  const [rules, setRules] = useState(loadRules);
  useEffect(() => localStorage.setItem(KEY, JSON.stringify(rules)), [rules]);
  return [rules, setRules];
}

/**
 * Holatdan alertlar yig'adi.
 *
 * Har bir alert aniq sabab va aniq qiymat bilan keladi — «nimadir
 * yomon» degan xabar foydasiz, «/ bo'limi 91% to'lgan» esa harakatga
 * chorlaydi.
 */
export function collectAlerts(snapshot, security, traffic, rules = DEFAULT_RULES) {
  const out = [];
  const seen = new Set();
  // ID matnni ham o'z ichiga oladi: bitta qoidadan bir nechta alert
  // chiqishi mumkin (masalan har bir disk bo'limi uchun), va ular bir
  // xil ID olsa «ko'rdim» belgisi hammasiga birdan tushib qolardi.
  const add = (sev, title, msg, svc, rule) => {
    const id = `${rule}:${title}:${msg}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, sev, title, msg, svc, rule });
  };

  const sys = snapshot?.system;
  if (sys) {
    for (const d of sys.disks || []) {
      if (d.usedPercent >= 95) {
        add("kritik", "Disk to'lay deyapti",
            `${d.mount} bo'limi ${d.usedPercent}% band — ${d.freeGb} GB qoldi.`,
            d.filesystem, "disk");
      } else if (d.usedPercent >= rules.disk) {
        add("ogohlantirish", "Disk to'lmoqda",
            `${d.mount} bo'limi ${d.usedPercent}% band — ${d.freeGb} GB qoldi.`,
            d.filesystem, "disk");
      }
    }
    if (sys.memory.usedPercent >= rules.mem) {
      add("ogohlantirish", "Xotira kam qoldi",
          `${sys.memory.usedPercent}% band, bo'sh ${sys.memory.availableMb} MB.`,
          "tizim", "mem");
    }
    if (sys.cpu.usagePercent >= rules.cpu) {
      add("ogohlantirish", "CPU yuklangan",
          `Hozir ${sys.cpu.usagePercent}%, load ${sys.cpu.load1}.`, "tizim", "cpu");
    }
    if (sys.cpu.load1 > sys.cpu.cores * rules.load) {
      add("ogohlantirish", "Navbat uzun",
          `load1 = ${sys.cpu.load1}, yadro ${sys.cpu.cores} ta — jarayonlar kutmoqda.`,
          "tizim", "load");
    }
  }

  if (snapshot?.services?.failed > 0) {
    add("kritik", "Xizmat ishlamayapti",
        `${snapshot.services.failed} ta systemd xizmati failed holatida.`,
        "systemd", "service");
  }
  if (snapshot?.docker?.stopped > 0) {
    add("ma'lumot", "To'xtagan konteyner",
        `${snapshot.docker.stopped} ta konteyner ishlamayapti.`, "docker", "docker");
  }

  const sec = security || snapshot?.security;
  if (sec) {
    for (const problem of sec.problems || []) {
      add("ogohlantirish", "Xavfsizlik sozlamasi", problem, "sshd / ufw", "security");
    }
    const banned = sec.bannedNow ?? sec.fail2ban?.currentlyBanned ?? 0;
    if (banned >= rules.banned) {
      add("ma'lumot", "Bloklangan IP ko'paydi",
          `fail2ban hozir ${banned} ta manzilni bloklab turibdi.`, "fail2ban", "banned");
    }
  }

  if (traffic?.available && traffic.total > 0) {
    const errors = (traffic.statuses || [])
      .filter((s) => s.status >= 500)
      .reduce((a, s) => a + s.count, 0);
    const percent = Math.round((100 * errors) / traffic.total);
    if (percent >= rules.errRate) {
      add("kritik", "Server xatolari",
          `Oxirgi ${traffic.windowMinutes} daqiqada so'rovlarning ${percent}% i ` +
          "5xx bilan tugadi.", "caddy", "errRate");
    }
  }

  const order = { kritik: 0, ogohlantirish: 1, "ma'lumot": 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

export function sevKind(sev) {
  return sev === "kritik" ? "err" : sev === "ogohlantirish" ? "warn" : "info";
}
