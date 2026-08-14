import { Link } from "react-router-dom";

/**
 * E'tibor talab qiladigan holatlarni bitta joyga yig'adi.
 *
 * Nega kerak: ilgari har bir muammo o'z kartasida rang bilan
 * ko'rsatilardi — disk to'lgani KPI'da qizil, xato xizmat boshqa
 * kartada, hujum to'lqini uchinchisida. Sahifani ko'zdan kechirmasdan
 * turib "hammasi joyidami yo'qmi" degan savolga javob bo'lmasdi.
 * Endi javob eng yuqorida: ro'yxat bo'sh bo'lsa — joyida.
 *
 * Chegaralar ataylab konservativ: har bir ogohlantirish haqiqiy
 * harakatga arziydigan bo'lishi kerak, aks holda ularga e'tibor
 * berilmay qo'yadi.
 */
export function collectAlerts(snapshot) {
  if (!snapshot) return [];
  const { system, docker, services, security } = snapshot;
  const out = [];

  for (const d of system.disks || []) {
    if (d.usedPercent >= 90) {
      out.push({
        level: "bad",
        text: `Disk to'lay deb qoldi: ${d.mount} — ${d.usedPercent}% band, ` +
              `${d.freeGb} GB qoldi`,
      });
    } else if (d.usedPercent >= 80) {
      out.push({
        level: "warn",
        text: `Disk to'lmoqda: ${d.mount} — ${d.usedPercent}% band`,
      });
    }
  }

  if (system.memory.usedPercent >= 92) {
    out.push({
      level: "bad",
      text: `Operativ xotira deyarli tugadi — ${system.memory.usedPercent}% band`,
    });
  }

  // Bir lahzalik cho'qqi emas, barqaror yuk muhim: load1 yadro sonidan
  // sezilarli oshgan bo'lsa navbat yig'ilayotgan bo'ladi.
  if (system.cpu.load1 > system.cpu.cores * 2) {
    out.push({
      level: "warn",
      text: `Protsessor navbati uzun — yuk ${system.cpu.load1} ` +
            `(${system.cpu.cores} yadro)`,
    });
  }

  if (services.failed > 0) {
    out.push({
      level: "bad",
      text: `${services.failed} ta xizmat ishlamayapti`,
      to: "/xizmatlar",
    });
  }

  if (docker.stopped > 0) {
    out.push({
      level: "warn",
      text: `${docker.stopped} ta konteyner to'xtagan`,
      to: "/docker",
    });
  }

  if (!security.firewallActive) {
    out.push({ level: "bad", text: "Firewall o'chiq", to: "/xavfsizlik" });
  }

  for (const p of security.problems || []) {
    out.push({ level: "warn", text: p, to: "/xavfsizlik" });
  }

  return out;
}

export default function Alerts({ snapshot }) {
  const alerts = collectAlerts(snapshot);

  if (alerts.length === 0) {
    return (
      <div className="alerts ok">
        <span className="mark">✓</span>
        Hammasi joyida — e'tibor talab qiladigan holat yo'q.
      </div>
    );
  }

  // Jiddiylari yuqorida tursin.
  const sorted = [...alerts].sort((a, b) =>
    (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1));

  return (
    <div className="alerts">
      {sorted.map((a, i) => (
        <div className={`alert ${a.level}`} key={i}>
          <span className="mark">{a.level === "bad" ? "!" : "•"}</span>
          <span className="txt">{a.text}</span>
          {a.to && <Link to={a.to}>ko'rish →</Link>}
        </div>
      ))}
    </div>
  );
}
