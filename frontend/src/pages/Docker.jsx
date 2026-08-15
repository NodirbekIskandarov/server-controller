import { useDockerActionMutation, useDockerQuery } from "../store/api";
import { useAction } from "../components/useAction";
import Confirm from "../components/Confirm";
import {
  BarCell, Card, Empty, ErrorBox, Loading, Note, Row, Rows, State, Two, loadTone,
} from "../components/common";
import { containerPlan } from "../lib/consequence";

const COLS = "minmax(150px,1.2fr) 82px minmax(110px,0.9fr) 1fr 1fr 110px 168px";

const ACTIONS = ["start", "stop", "restart"];

/**
 * Caddy — teskari proksi: to'xtasa hamma domen bilan birga panelning
 * o'zi ham ochilmay qoladi. Serverda ham shu qoida bor, bu yerdagisi
 * tugmani oldindan o'chirib qo'yish uchun.
 */
function isProtected(name) {
  return /caddy/i.test(name);
}

function blockedWhy(c, action) {
  if (action === "stop" && isProtected(c.name)) {
    return `${c.name} himoyalangan — teskari proksi, to'xtatib bo'lmaydi`;
  }
  if (action === "start" && c.state === "running") return "Allaqachon ishlayapti";
  if (action === "stop" && c.state !== "running") return "Ishlamayapti";
  return "";
}

export default function Docker() {
  const { data, isLoading, error, refetch } = useDockerQuery(undefined, {
    pollingInterval: 15000,
  });
  const [act] = useDockerActionMutation();
  const { ask, props, result, clearResult } = useAction();

  if (isLoading) return <Loading label="docker stats o'lchanmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { containers, images, usage, running, total, stopped, cpuTotal } = data;

  const askContainer = (name, action) =>
    ask({
      ...containerPlan(name, action),
      run: () => act({ nom: name, amal: action }).unwrap(),
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
          <span className="cap">To'xtagan</span>
          <span className="big-n" style={{ color: stopped ? "var(--warn)" : undefined }}>
            {stopped}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {stopped ? "tekshirish kerak" : "hammasi ishlayapti"}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Docker CPU</span>
          <span className="big-n">{cpuTotal.toFixed(1)}%</span>
          <span className="mono muted" style={{ fontSize: 10 }}>barcha konteyner</span>
        </div>
        <div className="metric tight">
          <span className="cap">Obrazlar</span>
          <span className="big-n">{images.length}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {usage.find((u) => /image/i.test(u.type))?.reclaimable || "—"} bo'shatish mumkin
          </span>
        </div>
      </div>

      {result && (
        <Note kind="ok" action={<button className="btn sm" onClick={clearResult}>yopish</button>}>
          {result.text}
        </Note>
      )}

      <Card
        title="Konteynerlar"
        sub="docker ps · docker stats"
        action={<span className="cap">caddy to'xtatilmaydi — faqat restart</span>}
      >
        {containers.length === 0 ? (
          <Empty title="Konteyner yo'q" />
        ) : (
          <Rows
            cols={COLS}
            head={["konteyner", "holat", "obraz", "cpu", "xotira", "portlar",
                   { label: "amallar", right: true }]}
          >
            {containers.map((c) => (
              <Row cols={COLS} key={c.id} title={c.status}>
                <Two
                  top={
                    <>
                      {isProtected(c.name) && <span style={{ color: "var(--warn)" }}>● </span>}
                      {c.name}
                    </>
                  }
                  bottom={`${c.id} · ${c.project || "—"}`}
                />
                <State kind={c.state === "running" ? "ok" : c.state === "exited" ? "err" : "warn"}>
                  {c.state}
                </State>
                <span className="mono muted ellipsis">{c.image}</span>
                <BarCell
                  percent={Math.min(100, c.cpuPercent)}
                  label={`${c.cpuPercent.toFixed(1)}%`}
                  color={loadTone(c.cpuPercent)}
                />
                <BarCell
                  percent={c.memPercent}
                  label={c.memUsage || "—"}
                  color={loadTone(c.memPercent)}
                />
                <span className="mono ellipsis" style={{ fontSize: 10 }}>
                  {c.ports || "—"}
                </span>
                <span className="acts">
                  {ACTIONS.map((a) => {
                    const why = blockedWhy(c, a);
                    return (
                      <button
                        key={a}
                        className={`btn sm ${a === "stop" ? "err" : a === "start" ? "ok" : ""}`}
                        disabled={Boolean(why)}
                        title={why || `docker ${a} ${c.name}`}
                        onClick={() => askContainer(c.name, a)}
                      >
                        {a}
                      </button>
                    );
                  })}
                </span>
              </Row>
            ))}
          </Rows>
        )}
      </Card>

      <div className="g2">
        <Card title="Obrazlar" sub="docker images">
          <Rows cols="minmax(0,1fr) 90px 90px 110px"
                head={["repozitoriy", "teg", { label: "hajm", right: true },
                       { label: "yaratilgan", right: true }]}>
            {images.map((i) => (
              <Row cols="minmax(0,1fr) 90px 90px 110px" key={`${i.repository}:${i.tag}`}>
                <span className="mono ellipsis">{i.repository}</span>
                <span className="mono muted">{i.tag}</span>
                <span className="mono right">{i.size}</span>
                <span className="mono muted right" style={{ fontSize: 10 }}>
                  {i.createdSince}
                </span>
              </Row>
            ))}
            {images.length === 0 && <Empty>Obraz yo'q.</Empty>}
          </Rows>
        </Card>

        <Card title="Docker diski" sub="docker system df">
          <Rows cols="minmax(0,1fr) 60px 90px 110px"
                head={["turi", "soni", { label: "hajm", right: true },
                       { label: "bo'shatish", right: true }]}>
            {usage.map((u) => (
              <Row cols="minmax(0,1fr) 60px 90px 110px" key={u.type}>
                <span className="mono">{u.type}</span>
                <span className="mono muted">{u.count}</span>
                <span className="mono right">{u.size}</span>
                <span className="mono right" style={{ color: "var(--warn)" }}>
                  {u.reclaimable}
                </span>
              </Row>
            ))}
            {usage.length === 0 && <Empty>Ma'lumot yo'q.</Empty>}
          </Rows>
        </Card>
      </div>

      <Confirm {...props} />
    </>
  );
}
