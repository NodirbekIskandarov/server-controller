import { useEffect, useRef, useState } from "react";
import { useDeployListQuery, useTriggerDeployMutation } from "../store/api";
import {
  Card, Empty, ErrorBox, Kv, Loading, Row, Rows, State,
} from "../components/common";
import { dt } from "../lib/format";

const HIST_COLS = "minmax(120px,1fr) 90px 96px 90px 96px minmax(0,1.2fr)";

// Deploy skripti nima qilishini foydalanuvchi bilib tursin.
const STEPS = [
  ["1", "Kodni olish", "git fetch && git reset --hard origin/main"],
  ["2", "Bog'liqliklar", "npm ci / pip install -r requirements.txt"],
  ["3", "Yig'ish", "npm run build"],
  ["4", "Qayta ishga tushirish", "systemctl restart <xizmat>"],
  ["5", "Tekshirish", "systemctl is-active + salomatlik so'rovi"],
];

function runKind(run) {
  if (run.ok === true) return "ok";
  if (run.ok === false) return "err";
  return "warn";
}

function BuildLog({ lines }) {
  const box = useRef(null);
  // Yangi qator kelganda pastga siljitamiz — foydalanuvchi o'zi
  // yuqoriga chiqib ketgan bo'lsa tinch qo'yamiz.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="logbox" ref={box} style={{ maxHeight: 320 }}>
      {lines.length === 0 && <span className="muted">Qator yo'q.</span>}
      {lines.map((l, i) => (
        <div className="logline" key={i}>
          <span className="t">{String(l.at || "").slice(11, 19)}</span>
          <span
            className="msg"
            style={{
              color: l.stream === "err" ? "var(--err)"
                : l.stream === "info" ? "var(--info)" : undefined,
            }}
          >
            {l.line}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Deploy() {
  const { data, error, refetch, isLoading } = useDeployListQuery(undefined, {
    pollingInterval: 8000,
  });
  const [trigger, { isLoading: triggering }] = useTriggerDeployMutation();
  const [open, setOpen] = useState(null);
  const [live, setLive] = useState({});

  // Joylashtirish loglari SSE orqali kelib turadi.
  useEffect(() => {
    const source = new EventSource("/api/deploy/oqim", { withCredentials: true });
    source.onmessage = (event) => {
      try {
        const { run, step } = JSON.parse(event.data);
        setLive((prev) => ({
          ...prev,
          [run.id]: {
            run,
            lines: step
              ? [...(prev[run.id]?.lines || []), step]
              : run.lines || prev[run.id]?.lines || [],
          },
        }));
        setOpen((cur) => cur || run.id);
        refetch();
      } catch {
        /* buzuq xabar */
      }
    };
    return () => source.close();
  }, [refetch]);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const runs = data?.runs || [];
  const targets = data?.targets || [];
  const current = open ? (live[open] || runs.find((r) => r.id === open)) : null;
  const currentLines = current?.lines || current?.run?.lines || [];

  return (
    <div className="split">
      <div className="col">
        <Card
          title="Joylashtirish tarixi"
          sub="GitHub webhook · faqat main"
          action={
            <div className="chips">
              {targets.map((t) => (
                <button
                  key={t.name}
                  className="btn pri"
                  disabled={triggering || t.running}
                  onClick={() => trigger({ project: t.name, izoh: "panel" })}
                >
                  {t.running ? `${t.name} ketmoqda…` : t.name}
                </button>
              ))}
            </div>
          }
        >
          {runs.length === 0 ? (
            <Empty title="Hali joylashtirilmagan">
              Push bo'lganda yoki yuqoridagi tugma bosilganda shu yerda ko'rinadi.
            </Empty>
          ) : (
            <Rows cols={HIST_COLS}
                  head={["loyiha", "commit", "natija", "davomiylik", "vaqt", "xabar"]}>
              {runs.map((r) => (
                <Row cols={HIST_COLS} key={r.id} active={open === r.id}
                     onClick={() => setOpen(r.id)}>
                  <span>{r.project}</span>
                  <span className="mono muted">{r.commit || "—"}</span>
                  <State kind={runKind(r)}>
                    {r.ok === true ? "muvaffaqiyat" : r.ok === false ? "xato" : "ketmoqda"}
                  </State>
                  <span className="mono muted">
                    {r.durationMs ? `${Math.round(r.durationMs / 1000)}s` : "—"}
                  </span>
                  <span className="mono muted" style={{ fontSize: 10.5 }}>
                    {dt(r.startedAt)}
                  </span>
                  <span className="muted ellipsis">{r.message || r.trigger}</span>
                </Row>
              ))}
            </Rows>
          )}
        </Card>

        <Card
          title="Build log"
          sub={current ? (current.run?.id || current.id) : "qator tanlang"}
          action={<span className={`dot ${current?.run?.ok == null ? "warn" : "grey"}`} />}
        >
          <BuildLog lines={currentLines} />
        </Card>
      </div>

      <div className="col">
        <Card className="plain">
          <span className="cap">Webhook</span>
          <span className="pre">POST /api/deploy/hook/&lt;loyiha&gt;</span>
          <Kv rows={[
            ["imzo", "X-Hub-Signature-256"],
            ["tarmoq", "main"],
            ["parallel", "1 loyiha = 1 deploy"],
          ]} />
        </Card>

        <Card className="plain">
          <span className="cap">Deploy bosqichlari</span>
          {STEPS.map(([n, title, cmd]) => (
            <div className="step" key={n}>
              <span className="n">{n}</span>
              <span className="two">
                <span className="t1">{title}</span>
                <span className="t2">{cmd}</span>
              </span>
            </div>
          ))}
        </Card>

        <Card className="plain">
          <span className="cap">Loyihalar</span>
          {targets.map((t) => (
            <div className="kv" key={t.name}>
              <div>
                <span>{t.name}</span>
                <b>{t.running ? "ketmoqda" : "tayyor"}</b>
              </div>
            </div>
          ))}
          {targets.length === 0 && <span className="muted">Sozlanmagan.</span>}
        </Card>
      </div>
    </div>
  );
}
