import { useState } from "react";
import { useServiceActionMutation, useServicesQuery } from "../store/api";
import { useTail, parseLine } from "../components/useTail";
import { useAction } from "../components/useAction";
import Confirm from "../components/Confirm";
import {
  Card, Empty, ErrorBox, Loading, Note, Row, Rows, State,
} from "../components/common";
import { unitPlan } from "../lib/consequence";

const UNIT_COLS = "minmax(160px,1.3fr) 88px 82px 74px minmax(0,1fr) 214px";
const TIMER_COLS = "minmax(150px,1.2fr) 130px 110px 110px minmax(0,1fr)";
const CRON_COLS = "minmax(120px,0.8fr) 130px minmax(0,1.6fr)";

const ACTIONS = ["start", "stop", "restart", "reload"];

function unitKind(u) {
  if (u.active === "active") return "ok";
  if (u.active === "failed") return "err";
  if (u.active === "activating") return "warn";
  return "grey";
}

/**
 * Amal shu unit uchun mumkinmi.
 *
 * Chegara serverda ham tekshiriladi — bu yerdagisi tugmani oldindan
 * o'chirib qo'yish uchun: bosilgach «taqiqlangan» deb javob beradigan
 * tugma foydalanuvchini aldaydi.
 */
function blockedWhy(unit, action) {
  if (action === "stop" && unit.protected) {
    return `${unit.name} himoyalangan — to'xtatib bo'lmaydi, faqat restart`;
  }
  if (action === "start" && unit.active === "active") return "Allaqachon ishlayapti";
  if (action === "stop" && unit.active !== "active") return "Ishlamayapti";
  return "";
}

export default function Services() {
  const { data, isLoading, error, refetch } = useServicesQuery(undefined, {
    pollingInterval: 20000,
  });
  const [act] = useServiceActionMutation();
  const { ask, props, result, clearResult } = useAction();
  const [unit, setUnit] = useState(null);
  const { lines, live } = useTail({
    kind: "xizmat", name: unit || "", limit: 120, enabled: Boolean(unit),
  });

  if (isLoading) return <Loading label="systemctl so'ralmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { units, timers, cron, running, failed, total } = data;

  const askUnit = (name, action) =>
    ask({
      ...unitPlan(name, action),
      run: () => act({ unit: name, amal: action }).unwrap(),
    });

  return (
    <>
      <div className="g4">
        <div className="metric tight">
          <span className="cap">Ishlayapti</span>
          <span className="big-n" style={{ color: "var(--ok)" }}>{running}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>jami {total} ta</span>
        </div>
        <div className="metric tight">
          <span className="cap">Failed</span>
          <span className="big-n" style={{ color: failed ? "var(--err)" : undefined }}>
            {failed}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {failed ? "tekshirish kerak" : "muammo yo'q"}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Taymerlar</span>
          <span className="big-n">{timers.length}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>systemd timers</span>
        </div>
        <div className="metric tight">
          <span className="cap">Cron vazifalari</span>
          <span className="big-n">{cron.length}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>crontab + /etc/cron.d</span>
        </div>
      </div>

      {result && (
        <Note kind="ok" action={<button className="btn sm" onClick={clearResult}>yopish</button>}>
          {result.text}
        </Note>
      )}

      <Card
        title="Xizmatlar"
        sub="systemctl list-units"
        action={
          <span className="cap">
            himoyalangan unitlar to'xtatilmaydi — faqat restart
          </span>
        }
      >
        <Rows cols={UNIT_COLS}
              head={["unit", "holat", "xotira", "restart", "tavsif",
                     { label: "amallar", right: true }]}>
          {units.map((u) => (
            <Row cols={UNIT_COLS} key={u.name} active={unit === u.name}>
              <span className="mono ellipsis" title={u.protected ? "himoyalangan" : undefined}>
                {u.protected && <span style={{ color: "var(--warn)" }}>● </span>}
                {u.name}
              </span>
              <State kind={unitKind(u)}>{u.active}</State>
              <span className="mono">{u.memoryMb != null ? `${u.memoryMb} MB` : "—"}</span>
              <span className="mono" style={{ color: u.restarts ? "var(--warn)" : undefined }}>
                {u.restarts}
              </span>
              <span className="muted ellipsis">{u.description}</span>
              <span className="acts">
                {ACTIONS.map((a) => {
                  const why = blockedWhy(u, a);
                  return (
                    <button
                      key={a}
                      className={`btn sm ${a === "stop" ? "err" : a === "start" ? "ok" : ""}`}
                      disabled={Boolean(why)}
                      title={why || `systemctl ${a} ${u.name}`}
                      onClick={() => askUnit(u.name, a)}
                    >
                      {a}
                    </button>
                  );
                })}
                <button
                  className="btn sm"
                  onClick={() => setUnit(unit === u.name ? null : u.name)}
                >
                  {unit === u.name ? "yopish" : "log"}
                </button>
              </span>
            </Row>
          ))}
        </Rows>
      </Card>

      {unit && (
        <Card
          title={`${unit} loglari`}
          sub={`journalctl -u ${unit} -f`}
          action={<span className={`dot ${live ? "ok" : "grey"}`} />}
        >
          <div className="logbox" style={{ maxHeight: 320 }}>
            {lines.length === 0 && <span className="muted">Kutilmoqda…</span>}
            {lines.map((l) => {
              const p = parseLine(l);
              return (
                <div className="logline" key={l.id}>
                  <span className="t">{p.time}</span>
                  <span className={`lvl ${p.level}`}>{p.level.slice(0, 4)}</span>
                  <span className="msg">{p.msg}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title="Taymerlar" sub="systemctl list-timers">
        {timers.length === 0 ? (
          <Empty>Taymer yo'q.</Empty>
        ) : (
          <Rows cols={TIMER_COLS}
                head={["taymer", "keyingi", "qoldi", "oxirgi", "ishga tushiradi"]}>
            {timers.map((t) => (
              <Row cols={TIMER_COLS} key={t.unit}>
                <span className="mono ellipsis">{t.unit.replace(/\.timer$/, "")}</span>
                <span className="mono muted" style={{ fontSize: 10.5 }}>{t.next}</span>
                <span className="mono">{t.left}</span>
                <span className="mono muted" style={{ fontSize: 10.5 }}>{t.passed}</span>
                <span className="mono muted ellipsis">{t.activates}</span>
              </Row>
            ))}
          </Rows>
        )}
      </Card>

      <Card title="Cron vazifalari" sub="root crontab + /etc/cron.d">
        {cron.length === 0 ? (
          <Empty>Cron vazifasi yo'q.</Empty>
        ) : (
          <Rows cols={CRON_COLS} head={["manba", "jadval", "buyruq"]}>
            {cron.map((c, i) => (
              <Row cols={CRON_COLS} key={`${c.source}-${i}`} title={c.command}>
                <span className="mono muted ellipsis">{c.source}</span>
                <span className="mono">{c.schedule}</span>
                <span className="mono ellipsis" style={{ fontSize: 10.5 }}>{c.command}</span>
              </Row>
            ))}
          </Rows>
        )}
      </Card>

      <Confirm {...props} />
    </>
  );
}
