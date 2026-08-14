import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useProjectsQuery, useSecurityQuery, useTrafficQuery } from "../store/api";
import { BigChart, Spark, Trend } from "../components/Spark";
import { useTail, parseLine } from "../components/useTail";
import { collectAlerts, sevKind, useRules } from "../components/Alerts";
import {
  Bar, Card, Empty, Loading, Row, Rows, State, Two, loadTone,
} from "../components/common";
import { bytes, duration, num } from "../lib/format";

const METHOD_TONE = {
  GET: "info", POST: "ok", PUT: "warn", PATCH: "warn", DELETE: "err",
};

/** Loyiha nima orqali ishlaydi — xizmat, konteyner yoki oddiy fayllar. */
function projectKind(p) {
  if (p.services.length) return { kind: "ok", label: "xizmat" };
  if (p.containers.length) return { kind: "info", label: "konteyner" };
  return { kind: "grey", label: "statik" };
}

export default function Overview() {
  const navigate = useNavigate();
  const { snapshot } = useSelector((s) => s.live);
  const { data: projects } = useProjectsQuery(undefined);
  const { data: security } = useSecurityQuery(undefined, { pollingInterval: 30000 });
  const { data: traffic } = useTrafficQuery(60, { pollingInterval: 30000 });
  const [rules] = useRules();
  const { lines } = useTail({ kind: "tizim", limit: 40 });

  if (!snapshot) return <Loading label="Birinchi o'lchov kutilmoqda…" />;

  const sys = snapshot.system;
  const hist = snapshot.history || [];
  const cpuData = hist.map((h) => h.cpu);
  const memData = hist.map((h) => h.mem);
  const netData = hist.map((h) => h.rx + h.tx);

  const alerts = collectAlerts(snapshot, security, traffic, rules);
  const attacks = security?.attacks;
  const attackSeries = (attacks?.timeline || []).map((t) => t.count);
  const rps = traffic?.available
    ? Math.round((traffic.total / (traffic.windowMinutes * 60)) * 100) / 100
    : 0;

  const EP_COLS = "52px minmax(0,1.6fr) 74px 1fr 62px 70px 62px";
  const PR_COLS = "minmax(150px,1.4fr) 92px 84px 1fr 1fr 88px";

  return (
    <div className="split">
      <div className="col">
        <div className="g4">
          <div className="metric">
            <div className="top">
              <span className="cap">CPU</span>
              <span className="aside">load {sys.cpu.load1}</span>
            </div>
            <div className="val">
              <span className="n">{sys.cpu.usagePercent}</span>
              <span className="u">%</span>
              <span className="r">{sys.cpu.cores} yadro</span>
            </div>
            <Spark data={cpuData} color="var(--ok)" fill="var(--okBg)" max={100} />
          </div>

          <div className="metric">
            <div className="top">
              <span className="cap">Xotira</span>
              <span className="aside">
                {(sys.memory.usedMb / 1024).toFixed(1)} / {(sys.memory.totalMb / 1024).toFixed(0)} GB
              </span>
            </div>
            <div className="val">
              <span className="n">{sys.memory.usedPercent}</span>
              <span className="u">%</span>
              <span className="r">swap {(sys.memory.swapUsedMb / 1024).toFixed(1)}G</span>
            </div>
            <Spark data={memData} color="var(--info)" fill="var(--infoBg)" max={100} />
          </div>

          <div className="metric">
            <div className="top">
              <span className="cap">Tarmoq</span>
              <span className="aside" style={{ display: "flex", gap: 7 }}>
                <span style={{ color: "var(--ok)" }}>↓{bytes(snapshot.net.rxPerSec)}</span>
                <span style={{ color: "var(--warn)" }}>↑{bytes(snapshot.net.txPerSec)}</span>
              </span>
            </div>
            <div className="val">
              <span className="n">
                {((snapshot.net.rxPerSec + snapshot.net.txPerSec) / 125000).toFixed(1)}
              </span>
              <span className="u">Mb/s</span>
            </div>
            <Spark data={netData} color="var(--warn)" fill="var(--warnBg)" />
          </div>

          <div className="metric tight">
            <div className="top">
              <span className="cap">Disk</span>
              <span className="aside">
                {sys.root ? `${sys.root.usedGb} / ${sys.root.sizeGb} GB` : "—"}
              </span>
            </div>
            <div className="val">
              <span className="n">{sys.root?.usedPercent ?? 0}</span>
              <span className="u">%</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {sys.disks.slice(0, 3).map((d) => (
                <div className="stack2" key={d.mount}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span className="lab">{d.mount}</span>
                    <span className="lab">{d.usedPercent}%</span>
                  </div>
                  <Bar percent={d.usedPercent} color={loadTone(d.usedPercent)} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="g4">
          <button className="tile" onClick={() => navigate("/xavfsizlik")}>
            <span className="cap">Hujum urinishlari</span>
            <span className="line">
              <span className="n">{num(snapshot.security.totalFailed)}</span>
              <span className="mono" style={{ fontSize: 10, color: "var(--err)" }}>
                +{attacks?.perMinute ?? 0}/daq
              </span>
            </span>
            <span className="foot">
              {snapshot.security.uniqueSources} IP · {snapshot.security.bannedNow} bloklangan
            </span>
          </button>

          <button className="tile" onClick={() => navigate("/konteynerlar")}>
            <span className="cap">Konteynerlar</span>
            <span className="line">
              <span className="n">{snapshot.docker.running}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                / {snapshot.docker.total}
              </span>
            </span>
            <span className="foot">docker cpu {snapshot.docker.cpuTotal.toFixed(1)}%</span>
          </button>

          <button className="tile" onClick={() => navigate("/xizmatlar")}>
            <span className="cap">systemd xizmatlari</span>
            <span className="line">
              <span className="n">{snapshot.services.running}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                / {snapshot.services.total}
              </span>
            </span>
            <span className="foot"
                  style={{ color: snapshot.services.failed ? "var(--err)" : "var(--ok)" }}>
              {snapshot.services.failed
                ? `${snapshot.services.failed} ta failed`
                : "hammasi joyida"}
            </span>
          </button>

          <button className="tile" onClick={() => navigate("/loyihalar")}>
            <span className="cap">Loyihalar</span>
            <span className="line">
              <span className="n">{projects?.items?.length ?? "—"}</span>
            </span>
            <span className="foot">
              {projects ? bytes(projects.summary.totalBytes) : "hisoblanmoqda…"}
            </span>
          </button>
        </div>

        <Card
          title="Oxirgi 3 daqiqa"
          action={
            <div className="legend">
              <span><i style={{ background: "var(--ok)" }} />cpu</span>
              <span><i style={{ background: "var(--info)" }} />xotira</span>
              <span><i style={{ background: "var(--warn)" }} />tarmoq</span>
            </div>
          }
        >
          <div className="pad">
            <BigChart
              series={[
                { label: "cpu", data: cpuData, color: "var(--ok)", fill: "var(--okBg)", width: 2 },
                { label: "mem", data: memData, color: "var(--info)", width: 1.6 },
                { label: "net", data: netData, color: "var(--warn)", width: 1.4, dashed: true },
              ]}
            />
            <div className="axis" style={{ paddingTop: 8 }}>
              <span>-3 daq</span><span>-2</span><span>-1</span><span>hozir</span>
            </div>
          </div>
        </Card>

        <Card
          title="So'rov / sekund"
          sub={traffic?.available
            ? `${traffic.windowMinutes} daqiqa · ${num(traffic.total)} so'rov`
            : "Caddy loglari yo'q"}
          action={<Link className="link" to="/trafik">trafik →</Link>}
        >
          {traffic?.available ? (
            <>
              <div className="pad"
                   style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div className="cap">Hozir</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                    <span className="mono"
                          style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.03em" }}>
                      {rps}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>req/s</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 18, paddingLeft: 16,
                              borderLeft: "1px solid var(--line)" }}>
                  <div>
                    <div className="cap">daqiqada</div>
                    <div className="mono" style={{ fontSize: 13 }}>{traffic.perMinuteAvg}</div>
                  </div>
                  <div>
                    <div className="cap">p95</div>
                    <div className="mono" style={{ fontSize: 13 }}>{traffic.p95} ms</div>
                  </div>
                  <div>
                    <div className="cap">domen</div>
                    <div className="mono" style={{ fontSize: 13 }}>{traffic.domains.length}</div>
                  </div>
                </div>
                <span className="spacer" />
                <div style={{ width: 210 }}>
                  <Spark data={(traffic.timeline || []).map((t) => t.count)}
                         color="var(--info)" fill="var(--infoBg)" height={46} />
                </div>
              </div>
              <Rows cols={EP_COLS}
                    head={["usul", "endpoint", "req/s", "ulush", "%", "p95",
                           { label: "xato", right: true }]}>
                {traffic.endpoints.slice(0, 10).map((e) => (
                  <Row cols={EP_COLS} key={`${e.method} ${e.path}`}>
                    <span className={`tag ${METHOD_TONE[e.method] || ""}`}>{e.method}</span>
                    <Two top={<span className="mono">{e.path}</span>} bottom={e.host} />
                    <span className="mono">{e.perSec}</span>
                    <Bar percent={e.share} color="var(--info)" className="h5" />
                    <span className="mono muted">{e.share}%</span>
                    <span className="mono"
                          style={{ color: e.p95 > 500 ? "var(--warn)" : undefined }}>
                      {e.p95} ms
                    </span>
                    <span className="mono right"
                          style={{ color: e.errorPercent ? "var(--err)" : "var(--muted)" }}>
                      {e.errorPercent}%
                    </span>
                  </Row>
                ))}
              </Rows>
            </>
          ) : (
            <Empty title="Trafik ma'lumoti yo'q">
              {traffic?.note || "Caddy access loglari o'qilmadi."}
            </Empty>
          )}
        </Card>

        <Card
          title="Loyihalar"
          sub={projects
            ? `${projects.items.length} ta · ${bytes(projects.summary.totalBytes)}`
            : ""}
          action={<Link className="link" to="/loyihalar">hammasi →</Link>}
        >
          {!projects ? (
            <Loading />
          ) : (
            <Rows cols={PR_COLS}
                  head={["loyiha", "holat", "hajm", "xizmatlar", "domenlar", "trend"]}>
              {projects.items.slice(0, 8).map((p) => {
                const st = projectKind(p);
                return (
                  <Row cols={PR_COLS} key={p.path}
                       onClick={() => navigate(`/loyihalar/${encodeURIComponent(p.name)}`)}>
                    <Two top={p.name} bottom={p.path} />
                    <State kind={st.kind}>{st.label}</State>
                    <span className="mono">{p.sizeHuman}</span>
                    <span className="mono muted ellipsis">{p.services.join(", ") || "—"}</span>
                    <span className="mono muted ellipsis">{p.domains.join(", ") || "—"}</span>
                    <Trend data={cpuData} color={`var(--${st.kind})`} />
                  </Row>
                );
              })}
            </Rows>
          )}
        </Card>

        <Card title="Ishlash muddati">
          <div className="pad g3">
            <div>
              <div className="cap">Uptime</div>
              <div className="big-n">{duration(sys.host.uptimeSeconds)}</div>
              <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                {new Date(sys.host.bootedAt).toLocaleString("ru-RU")} dan beri
              </div>
            </div>
            <div>
              <div className="cap">Yuk (1 / 5 / 15 daq)</div>
              <div className="big-n mono">
                {sys.cpu.load1} · {sys.cpu.load5} · {sys.cpu.load15}
              </div>
              <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                {sys.cpu.cores} yadro — {sys.cpu.load1 > sys.cpu.cores ? "navbat bor" : "navbat yo'q"}
              </div>
            </div>
            <div>
              <div className="cap">Yadro</div>
              <div className="big-n mono" style={{ fontSize: 15 }}>{sys.host.kernel}</div>
              <div className="mono muted" style={{ fontSize: 10, marginTop: 4 }}>
                {sys.host.os}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="col">
        <Card title="Alertlar" action={<Link className="link" to="/alertlar">barchasi</Link>}>
          {alerts.length === 0 ? (
            <Empty title="Hammasi joyida">Chegaradan oshgan ko'rsatkich yo'q.</Empty>
          ) : (
            alerts.slice(0, 4).map((a) => (
              <div className="alert-mini" key={a.id}>
                <span className="edge" style={{ background: `var(--${sevKind(a.sev)})` }} />
                <div className="body">
                  <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                    <span className="cap" style={{ color: `var(--${sevKind(a.sev)})` }}>
                      {a.sev}
                    </span>
                    <span className="cap">{a.title}</span>
                  </div>
                  <div className="msg">{a.msg}</div>
                  <div className="mono" style={{ fontSize: 9.5, color: "var(--muted2)" }}>
                    {a.svc}
                  </div>
                </div>
              </div>
            ))
          )}
        </Card>

        <Card title="Hujumlar oqimi" action={<span className="dot err" />}>
          <div className="pad" style={{ paddingBottom: 6 }}>
            <Spark data={attackSeries} color="var(--err)" fill="var(--errBg)" height={60} />
          </div>
          {(attacks?.topSources || []).slice(0, 5).map((s) => (
            <Row cols="1fr auto" key={s.ip}>
              <Two top={<span className="mono">{s.ip}</span>}
                   bottom={s.users.slice(0, 3).join(", ") || "—"} />
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="mono" style={{ color: "var(--err)" }}>{s.attempts}</span>
                <span className={`tag ${s.banned ? "err" : ""}`}>
                  {s.banned ? "bloklangan" : "ochiq"}
                </span>
              </span>
            </Row>
          ))}
          {!attacks?.topSources?.length && <Empty>Urinish qayd etilmagan.</Empty>}
        </Card>

        <Card title="Jonli loglar"
              action={<Link className="link" to="/loglar">to'liq oqim</Link>}>
          <div className="logbox" style={{ maxHeight: 380 }}>
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
      </div>
    </div>
  );
}
