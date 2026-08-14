import { useDockerQuery } from "../store/api";
import {
  Bar, BarCell, Card, Empty, ErrorBox, Loading, Row, Rows, State, Two, loadTone,
} from "../components/common";

const COLS = "minmax(150px,1.3fr) 86px minmax(120px,1fr) 1fr 1fr 120px 130px";

export default function Docker() {
  const { data, isLoading, error, refetch } = useDockerQuery(undefined, {
    pollingInterval: 15000,
  });

  if (isLoading) return <Loading label="docker stats o'lchanmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { containers, images, usage, running, total, stopped, cpuTotal } = data;

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

      <Card title="Konteynerlar" sub="docker ps · docker stats">
        {containers.length === 0 ? (
          <Empty title="Konteyner yo'q" />
        ) : (
          <Rows
            cols={COLS}
            head={["konteyner", "holat", "obraz", "cpu", "xotira", "portlar", "net i/o"]}
          >
            {containers.map((c) => (
              <Row cols={COLS} key={c.id} title={c.status}>
                <Two top={c.name} bottom={`${c.id} · ${c.project || "—"}`} />
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
                <span className="mono muted" style={{ fontSize: 10 }}>{c.netIo || "—"}</span>
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
    </>
  );
}
