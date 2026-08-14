import { useEffect, useRef, useState } from "react";

/**
 * Jonli log oqimi.
 *
 * Server har bir ulanish uchun `journalctl -f` ochadi, shuning uchun
 * `enabled` false bo'lganda ulanish umuman ochilmaydi — ko'rinmayotgan
 * panel serverda jarayon ushlab turmasin.
 *
 * Qatorlar oxiridan `limit` tasi saqlanadi: soatlab ochiq turgan
 * sahifada butun tarix xotirani yeb qo'yardi.
 */
export function useTail({ kind = "tizim", name = "", limit = 200, enabled = true }) {
  const [lines, setLines] = useState([]);
  const [live, setLive] = useState(false);
  const id = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setLines([]);
      setLive(false);
      return undefined;
    }
    const url = `/api/logs/oqim?tur=${encodeURIComponent(kind)}&nom=${encodeURIComponent(name)}`;
    const source = new EventSource(url, { withCredentials: true });

    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = (event) => {
      try {
        const row = JSON.parse(event.data);
        setLines((prev) => {
          const next = prev.concat({ ...row, id: ++id.current });
          return next.length > limit ? next.slice(next.length - limit) : next;
        });
      } catch {
        /* buzuq xabar — o'tkazib yuboramiz */
      }
    };

    return () => source.close();
  }, [kind, name, limit, enabled]);

  return { lines, live };
}

/** journalctl qatoridan vaqt, xizmat nomi va darajani ajratadi. */
export function parseLine(raw) {
  const text = String(raw?.line ?? "");
  // 2026-08-14T15:13:29+0200 host unit[123]: xabar
  const m = /^(\S+)\s+\S+\s+([^\s[]+)(?:\[\d+\])?:\s?(.*)$/.exec(text);
  const stamp = m ? m[1] : "";
  const time = /T(\d{2}:\d{2}:\d{2})/.exec(stamp)?.[1]
    || new Date(raw?.at || Date.now()).toLocaleTimeString("ru-RU");
  const svc = m ? m[2] : "";
  const msg = m ? m[3] : text;

  let level = "info";
  if (raw?.stream === "err") level = "error";
  else if (/\b(error|fail(ed)?|fatal|refused|denied|panic|traceback)\b/i.test(msg))
    level = "error";
  else if (/\b(warn(ing)?|retry|timeout|slow|deprecat)/i.test(msg)) level = "warn";
  else if (/\b(started|success|ok|listening|ready)\b/i.test(msg)) level = "ok";

  return { time, svc, msg, level };
}
