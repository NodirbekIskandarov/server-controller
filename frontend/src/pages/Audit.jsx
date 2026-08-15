import { useState } from "react";
import { useAuditQuery } from "../store/api";
import {
  Card, Empty, ErrorBox, Loading, Row, Rows, State, Two,
} from "../components/common";
import { dt } from "../lib/format";

const COLS = "132px 92px minmax(120px,0.9fr) minmax(0,1.2fr) 90px 74px";

// Filtr `startsWith` bo'yicha ishlaydi — server ham shunday qidiradi.
const FILTERS = [
  ["", "hammasi"],
  ["xizmat.", "xizmatlar"],
  ["docker.", "konteynerlar"],
  ["fail2ban.", "fail2ban"],
  ["ufw.", "firewall"],
  ["fayl.", "fayllar"],
];

/** Amal nomini o'zbekcha o'qiladigan ko'rinishga o'giradi. */
const LABELS = {
  "xizmat.start": "ishga tushirish",
  "xizmat.stop": "to'xtatish",
  "xizmat.restart": "qayta ishga tushirish",
  "xizmat.reload": "sozlamani qayta o'qish",
  "docker.start": "konteyner ishga tushirish",
  "docker.stop": "konteyner to'xtatish",
  "docker.restart": "konteyner restart",
  "fail2ban.ban": "bloklash",
  "fail2ban.unban": "blokdan chiqarish",
  "ufw.allow": "port ochish",
  "ufw.deny": "port yopish",
  "ufw.delete": "qoida o'chirish",
  "fayl.saqlash": "fayl saqlash",
};

export default function Audit() {
  const [filter, setFilter] = useState("");
  const { data, isLoading, error, refetch } = useAuditQuery(
    { limit: 300, amal: filter },
    { pollingInterval: 20000 },
  );

  if (isLoading) return <Loading label="jurnal o'qilmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const rows = data?.rows || [];
  const summary = data?.summary || {};

  return (
    <>
      <div className="g4">
        <div className="metric tight">
          <span className="cap">Bugungi amallar</span>
          <span className="big-n">{summary.today ?? 0}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            jurnalda {summary.total ?? 0} ta
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Muvaffaqiyatsiz</span>
          <span className="big-n" style={{ color: summary.failed ? "var(--err)" : undefined }}>
            {summary.failed ?? 0}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {summary.failed ? "rad etilgan yoki xato" : "hammasi o'tgan"}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Oxirgi amal</span>
          <span className="big-n" style={{ fontSize: 14 }}>
            {summary.last ? LABELS[summary.last.action] || summary.last.action : "—"}
          </span>
          <span className="mono muted ellipsis" style={{ fontSize: 10 }}>
            {summary.last?.target || "yozuv yo'q"}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Oxirgi vaqt</span>
          <span className="big-n" style={{ fontSize: 14 }}>
            {summary.last ? dt(summary.last.at) : "—"}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {summary.last?.user || ""}
          </span>
        </div>
      </div>

      <div className="chips">
        {FILTERS.map(([value, label]) => (
          <button
            key={value}
            className={`chip-btn ${filter === value ? "on" : ""}`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
        <span className="spacer" />
        <span className="cap">{rows.length} yozuv</span>
      </div>

      <Card
        title="Audit jurnali"
        sub="audit.jsonl · faqat o'qish"
        action={
          <span className="cap">
            jurnal panel orqali o'chirilmaydi
          </span>
        }
      >
        {rows.length === 0 ? (
          <Empty title="Yozuv yo'q">
            Boshqaruv amallari shu yerda paydo bo'ladi — kim, qachon, nima qildi.
          </Empty>
        ) : (
          <Rows cols={COLS}
                head={["vaqt", "kim", "amal", "nima ustida", "natija", "davomiylik"]}>
            {rows.map((r, i) => (
              <Row cols={COLS} key={`${r.at}-${i}`} title={r.error || r.detail || ""}>
                <span className="mono muted" style={{ fontSize: 10.5 }}>{dt(r.at)}</span>
                <Two top={r.user} bottom={r.ip} />
                <span className="mono ellipsis">{LABELS[r.action] || r.action}</span>
                <Two top={r.target} bottom={r.error || r.detail || ""} />
                <State kind={r.ok ? "ok" : "err"}>
                  {r.ok ? "bajarildi" : "xato"}
                </State>
                <span className="mono muted">
                  {r.durationMs != null ? `${r.durationMs} ms` : "—"}
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Card>
    </>
  );
}
