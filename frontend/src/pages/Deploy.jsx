import { useEffect, useRef, useState } from "react";
import { useDeployListQuery, useTriggerDeployMutation } from "../store/api";
import { Card, Empty, ErrorBox, Loading, Tag } from "../components/common";
import { dt } from "../lib/format";

function LiveLog({ lines }) {
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
    <pre className="logs" ref={box}>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            color:
              l.stream === "err"
                ? "var(--danger)"
                : l.stream === "info"
                  ? "var(--accent)"
                  : "inherit",
          }}
        >
          {l.line}
        </div>
      ))}
    </pre>
  );
}

export default function Deploy() {
  const { data, error, refetch, isFetching } = useDeployListQuery(undefined, {
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
        if (step) setOpen((cur) => cur || run.id);
        if (run.finishedAt) refetch();
      } catch {
        /* buzuq xabar */
      }
    };
    return () => source.close();
  }, [refetch]);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading />;

  const runs = data.runs;
  const openRun =
    live[open]?.run || runs.find((r) => r.id === open) || null;
  const openLines = live[open]?.lines || openRun?.lines || [];

  async function run(name) {
    try {
      const res = await trigger({ project: name }).unwrap();
      setOpen(res.id);
    } catch {
      /* xato toast'siz — ro'yxatda ko'rinadi */
    }
  }

  return (
    <>
      <div className="note">
        <b>Avtomatik joylashtirish.</b> GitHub'ga <code>push</code> qilinganda
        workflow shu serverga signal yuboradi, server o'zi kodni tortib olib
        qayta yig'adi va xizmatni qayta ishga tushiradi. Loglar quyida jonli
        oqadi. SSH kaliti GitHub'ga chiqmaydi — server o'zi tortadi.
      </div>

      <div className="kpis">
        {data.targets.map((t) => (
          <div className="kpi" key={t.name}>
            <div className="lbl">{t.name}</div>
            <div className="val" style={{ fontSize: 15, lineHeight: 1.4 }}>
              {t.running ? (
                <Tag kind="warn">ishlayapti…</Tag>
              ) : (
                <button
                  className="btn sm pri"
                  disabled={triggering}
                  onClick={() => run(t.name)}
                >
                  ▶ Joylashtirish
                </button>
              )}
            </div>
            <div className="sub mono" style={{ fontSize: 11.5 }}>
              {t.repo}
            </div>
          </div>
        ))}
      </div>

      {openRun && (
        <Card
          title={`Log — ${openRun.project}`}
          action={
            <span
              style={{
                fontFamily: "var(--sans)",
                textTransform: "none",
                letterSpacing: 0,
                fontWeight: 500,
              }}
            >
              {openRun.finishedAt ? (
                <Tag kind={openRun.ok ? "ok" : "bad"}>
                  {openRun.ok ? "muvaffaqiyatli" : "xato"}
                </Tag>
              ) : (
                <Tag kind="warn">ishlayapti…</Tag>
              )}
            </span>
          }
        >
          <LiveLog lines={openLines} />
        </Card>
      )}

      <Card title={`Joylashtirishlar tarixi${isFetching ? " · yangilanmoqda" : ""}`}>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Loyiha</th>
                <th>Boshlangan</th>
                <th>Sabab</th>
                <th>Commit</th>
                <th>Natija</th>
                <th className="num">Davomiyligi</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && (
                <Empty colSpan={7}>Hali joylashtirish bo'lmagan.</Empty>
              )}
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.project}</b>
                  </td>
                  <td className="mono nowrap">{dt(r.startedAt)}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>
                    {r.trigger}
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {r.commit || "—"}
                    {r.message && (
                      <div className="muted">{r.message.slice(0, 40)}</div>
                    )}
                  </td>
                  <td>
                    {r.finishedAt ? (
                      <Tag kind={r.ok ? "ok" : "bad"}>
                        {r.ok ? "ok" : "xato"}
                      </Tag>
                    ) : (
                      <Tag kind="warn">ishlayapti</Tag>
                    )}
                  </td>
                  <td className="num">
                    {r.durationMs ? `${(r.durationMs / 1000).toFixed(1)} s` : "—"}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                    >
                      {open === r.id ? "Yopish" : "Log"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
