import { useState } from "react";
import { useSelector } from "react-redux";
import { useSecurityQuery, useTrafficQuery } from "../store/api";
import {
  collectAlerts, DEFAULT_RULES, RULE_META, sevKind, useRules,
} from "../components/Alerts";
import { Card, Empty, Loading } from "../components/common";

/**
 * Alertlar: hozir chegaradan oshgan hamma narsa va chegaralarning o'zi.
 *
 * «Ko'rdim» belgisi seans davomida saqlanadi — alert yo'qolmaydi, lekin
 * ro'yxat tepasidan tushadi va yangi kelganini ko'rish oson bo'ladi.
 */
export default function AlertsPage() {
  const { snapshot } = useSelector((s) => s.live);
  const { data: security } = useSecurityQuery(undefined, { pollingInterval: 25000 });
  const { data: traffic } = useTrafficQuery(60, { pollingInterval: 30000 });
  const [rules, setRules] = useRules();
  const [seen, setSeen] = useState(() => new Set());

  if (!snapshot) return <Loading label="Birinchi o'lchov kutilmoqda…" />;

  const all = collectAlerts(snapshot, security, traffic, rules);
  const active = all.filter((a) => !seen.has(a.id));
  const acked = all.filter((a) => seen.has(a.id));

  const toggle = (id) =>
    setSeen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderAlert = (a) => (
    <div className="alert" key={a.id}>
      <span className="edge" style={{ background: `var(--${sevKind(a.sev)})` }} />
      <div className="body">
        <div className="top">
          <span className="sev"
                style={{
                  background: `var(--${sevKind(a.sev)}Bg)`,
                  color: `var(--${sevKind(a.sev)})`,
                }}>
            {a.sev}
          </span>
          <span className="title">{a.title}</span>
        </div>
        <div className="msg">{a.msg}</div>
        <div className="meta">{a.svc} · qoida: {a.rule}</div>
      </div>
      <span className="spacer" />
      <button className="btn sm" onClick={() => toggle(a.id)}
              style={{ alignSelf: "center" }}>
        {seen.has(a.id) ? "qaytarish" : "ko'rdim"}
      </button>
    </div>
  );

  return (
    <div className="split">
      <div className="col">
        {active.length === 0 && acked.length === 0 && (
          <Empty title="Hammasi joyida">
            Hech bir ko'rsatkich chegaradan oshmagan.
          </Empty>
        )}
        {active.map(renderAlert)}
        {acked.length > 0 && (
          <>
            <span className="cap">Ko'rilgan ({acked.length})</span>
            {acked.map(renderAlert)}
          </>
        )}
      </div>

      <div className="col">
        <Card title="Alert qoidalari" sub="brauzerda saqlanadi">
          <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {Object.entries(RULE_META).map(([key, meta]) => (
              <label className="rule" key={key}>
                <span className="top">
                  <span>{meta.label}</span>
                  <span className="spacer" />
                  <span className="mono">{rules[key]}{meta.unit}</span>
                </span>
                <input
                  type="range"
                  min={meta.min}
                  max={meta.max}
                  value={rules[key]}
                  onChange={(e) =>
                    setRules({ ...rules, [key]: Number(e.target.value) })
                  }
                />
                <span className="hint">{meta.hint}</span>
              </label>
            ))}
            <button className="btn sm" onClick={() => setRules({ ...DEFAULT_RULES })}>
              Boshlang'ich qiymatlarga qaytarish
            </button>
          </div>
        </Card>

        <Card className="plain">
          <span className="cap">Qanday ishlaydi</span>
          <p className="desc">
            Alertlar har bir o'lchovda qaytadan hisoblanadi — ular saqlanmaydi
            va o'z-o'zidan yo'qolmaydi. Ko'rsatkich chegaradan tushsa alert ham
            ketadi.
          </p>
          <p className="desc">
            Panel ataylab faqat o'qiydi: bu yerdan xizmat to'xtatib yoki IP
            bloklab bo'lmaydi. Chegaralar ham serverga emas, shu brauzerga
            saqlanadi.
          </p>
        </Card>
      </div>
    </div>
  );
}
