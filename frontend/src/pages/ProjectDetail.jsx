import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSelector } from "react-redux";
import {
  useDeployListQuery, useDockerQuery, useProjectsQuery, useServicesQuery,
  useTrafficQuery, useTriggerDeployMutation,
} from "../store/api";
import { BigChart } from "../components/Spark";
import { useTail, parseLine } from "../components/useTail";
import {
  Bar, Card, Empty, Kv, Loading, Row, Rows, State, Two,
} from "../components/common";
import { bytes, dt, num } from "../lib/format";

/**
 * Bitta loyiha haqida hamma narsa: resurs, katalog, xizmatlar, domenlar,
 * git holati, oxirgi deploylar va jonli loglar.
 *
 * Ro'yxatdagi ma'lumot allaqachon keshda — alohida so'rov qilinmaydi,
 * faqat loglar va deploy tarixi qo'shimcha keladi.
 */
export default function ProjectDetail() {
  const { name } = useParams();
  const navigate = useNavigate();
  const { snapshot } = useSelector((s) => s.live);
  const { data: projects, isLoading } = useProjectsQuery(undefined);
  const { data: services } = useServicesQuery(undefined, { pollingInterval: 20000 });
  const { data: docker } = useDockerQuery(undefined, { pollingInterval: 20000 });
  const { data: traffic } = useTrafficQuery(60, { pollingInterval: 30000 });
  const { data: deploy } = useDeployListQuery(undefined, { pollingInterval: 15000 });
  const [trigger, { isLoading: deploying }] = useTriggerDeployMutation();
  const [tab, setTab] = useState(null);

  const project = projects?.items.find((p) => p.name === name);
  const unit = tab || project?.services[0] || "";

  useEffect(() => setTab(null), [name]);

  const { lines, live } = useTail({
    kind: "xizmat", name: unit, limit: 120, enabled: Boolean(unit),
  });

  if (isLoading) return <Loading />;
  if (!project) {
    return (
      <Empty title="Loyiha topilmadi">
        <button className="btn sm" onClick={() => navigate("/loyihalar")}>
          Ro'yxatga qaytish
        </button>
      </Empty>
    );
  }

  const units = (services?.units || []).filter((u) => project.services.includes(u.name));
  const containers = (docker?.containers || [])
    .filter((c) => project.containers.includes(c.name));
  const domains = (traffic?.domains || [])
    .filter((d) => project.domains.includes(d.domain));
  const requests = domains.reduce((a, d) => a + d.requests, 0);
  const errors = domains.reduce((a, d) => a + d.errors, 0);
  const endpoints = (traffic?.endpoints || [])
    .filter((e) => project.domains.includes(e.host));
  const p95 = endpoints.length ? Math.max(...endpoints.map((e) => e.p95)) : 0;

  const running = units.some((u) => u.active === "active")
    || containers.some((c) => c.state === "running");
  const st = running
    ? { kind: "ok", label: "ishlayapti" }
    : units.length || containers.length
      ? { kind: "err", label: "to'xtagan" }
      : { kind: "grey", label: "statik" };

  const cpuData = (snapshot?.history || []).map((h) => h.cpu);
  const memData = (snapshot?.history || []).map((h) => h.mem);
  const target = deploy?.targets?.find((t) => t.name === project.name);
  const runs = (deploy?.runs || []).filter((r) => r.project === project.name);
  const memMb = units.reduce((a, u) => a + (u.memoryMb || 0), 0);
  const tree = project.tree || [];
  const treeMax = Math.max(1, ...tree.map((n) => n.sizeBytes));

  return (
    <>
      <div className="chips">
        <button className="btn sm" onClick={() => navigate("/loyihalar")}>← orqaga</button>
        <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>
          {project.name}
        </span>
        <State kind={st.kind}>{st.label}</State>
        <span className="mono muted">{project.path}</span>
        <span className="spacer" />
        {target && (
          <button
            className="btn pri"
            disabled={deploying || target.running}
            onClick={() => trigger({ project: project.name, izoh: "panel" })}
          >
            {target.running ? "Ketmoqda…" : "Deploy"}
          </button>
        )}
      </div>

      <div className="g6">
        <div className="metric tight">
          <span className="cap">Xizmat</span>
          <span className="big-n">{units.length}</span>
        </div>
        <div className="metric tight">
          <span className="cap">Konteyner</span>
          <span className="big-n">{containers.length}</span>
        </div>
        <div className="metric tight">
          <span className="cap">Xotira</span>
          <span className="big-n">{memMb ? `${memMb} MB` : "—"}</span>
        </div>
        <div className="metric tight">
          <span className="cap">So'rov / soat</span>
          <span className="big-n">{num(requests)}</span>
        </div>
        <div className="metric tight">
          <span className="cap">p95</span>
          <span className="big-n" style={{ color: p95 > 500 ? "var(--warn)" : undefined }}>
            {p95 ? `${p95} ms` : "—"}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Hajm</span>
          <span className="big-n">{project.sizeHuman}</span>
        </div>
      </div>

      <div className="split">
        <div className="col">
          <Card
            title="Resurs iste'moli"
            sub="butun server bo'yicha"
            action={
              <div className="legend">
                <span><i style={{ background: "var(--ok)" }} />cpu</span>
                <span><i style={{ background: "var(--info)" }} />ram</span>
              </div>
            }
          >
            <div className="pad">
              <BigChart
                height={180}
                series={[
                  { label: "cpu", data: cpuData, color: "var(--ok)", fill: "var(--okBg)", width: 2 },
                  { label: "mem", data: memData, color: "var(--info)", width: 1.6 },
                ]}
              />
            </div>
          </Card>

          <Card title="Katalog tuzilmasi" sub="du -sb · birinchi daraja">
            {tree.length === 0 ? (
              <Empty>Katalog o'qilmadi.</Empty>
            ) : (
              <Rows cols="20px minmax(0,1fr) 100px 96px">
                {tree.slice(0, 12).map((n) => (
                  <Row cols="20px minmax(0,1fr) 100px 96px" key={n.path}>
                    <span className="mono muted">{n.isDir ? "▸" : "·"}</span>
                    <span className="mono ellipsis">{n.name}</span>
                    <Bar percent={(100 * n.sizeBytes) / treeMax} color="var(--info)"
                         className="h5" />
                    <span className="mono muted right">{bytes(n.sizeBytes)}</span>
                  </Row>
                ))}
              </Rows>
            )}
          </Card>

          <Card
            title={unit ? `${unit} loglari` : "Loglar"}
            sub={unit ? `journalctl -u ${unit} -f` : "xizmat yo'q"}
            action={
              <>
                {project.services.length > 1 && (
                  <div className="chips">
                    {project.services.map((s) => (
                      <button key={s}
                              className={`chip-btn ${s === unit ? "on" : ""}`}
                              onClick={() => setTab(s)}>
                        {s.replace(/\.service$/, "")}
                      </button>
                    ))}
                  </div>
                )}
                <span className="spacer" />
                <span className={`dot ${live ? "ok" : "grey"}`} />
              </>
            }
          >
            {!unit ? (
              <Empty title="Bu loyihada systemd xizmati yo'q">
                Konteyner loglarini «Konteynerlar» bo'limidan ko'ring.
              </Empty>
            ) : (
              <div className="logbox" style={{ maxHeight: 280 }}>
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
            )}
          </Card>
        </div>

        <div className="col">
          <Card className="plain">
            <span className="cap">Ma'lumot</span>
            <Kv rows={[
              ["turi", project.kind],
              ["domen", project.domains.join(", ") || "—"],
              ["xizmat", project.services.join(", ") || "—"],
              ["konteyner", project.containers.join(", ") || "—"],
              ["o'zgargan", project.updatedAt ? dt(project.updatedAt) : "—"],
            ]} />
          </Card>

          {project.git && (
            <Card className="plain">
              <span className="cap">Git</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--fg2)" }}>
                {project.git.branch} · {project.git.commit}
              </span>
              <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
                {project.git.message}
              </span>
            </Card>
          )}

          {units.length > 0 && (
            <Card title="Xizmatlar">
              <Rows cols="minmax(0,1fr) 84px 70px">
                {units.map((u) => (
                  <Row cols="minmax(0,1fr) 84px 70px" key={u.name}>
                    <span className="mono ellipsis">{u.name}</span>
                    <State kind={u.active === "active" ? "ok" : u.active === "failed" ? "err" : "grey"}>
                      {u.active}
                    </State>
                    <span className="mono muted right">
                      {u.memoryMb != null ? `${u.memoryMb}M` : "—"}
                    </span>
                  </Row>
                ))}
              </Rows>
            </Card>
          )}

          {containers.length > 0 && (
            <Card title="Konteynerlar">
              <Rows cols="minmax(0,1fr) 84px 70px">
                {containers.map((c) => (
                  <Row cols="minmax(0,1fr) 84px 70px" key={c.name}>
                    <span className="mono ellipsis">{c.name}</span>
                    <State kind={c.state === "running" ? "ok" : "err"}>{c.state}</State>
                    <span className="mono muted right">{c.cpuPercent?.toFixed?.(1) ?? 0}%</span>
                  </Row>
                ))}
              </Rows>
            </Card>
          )}

          {domains.length > 0 && (
            <Card title="Trafik" sub={`${traffic.windowMinutes} daqiqa`}>
              <Rows cols="minmax(0,1fr) 70px 60px">
                {domains.map((d) => (
                  <Row cols="minmax(0,1fr) 70px 60px" key={d.domain}>
                    <span className="mono ellipsis">{d.domain}</span>
                    <span className="mono right">{num(d.requests)}</span>
                    <span className="mono right"
                          style={{ color: d.errors ? "var(--err)" : "var(--muted)" }}>
                      {d.errors}
                    </span>
                  </Row>
                ))}
              </Rows>
              {errors > 0 && (
                <div className="pad">
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--err)" }}>
                    {errors} ta xato javob
                  </span>
                </div>
              )}
            </Card>
          )}

          <Card title="Oxirgi deploylar">
            {runs.length === 0 ? (
              <Empty>Hali joylashtirilmagan.</Empty>
            ) : (
              runs.slice(0, 5).map((r) => (
                <Row cols="10px minmax(0,1fr) auto" key={r.id}>
                  <span className={`dot ${r.ok === true ? "ok" : r.ok === false ? "err" : "warn"}`} />
                  <Two
                    top={`${r.commit || "—"} · ${r.trigger}`}
                    bottom={r.finishedAt ? dt(r.finishedAt) : "ketmoqda…"}
                  />
                  <span className="mono muted">
                    {r.durationMs ? `${Math.round(r.durationMs / 1000)}s` : "—"}
                  </span>
                </Row>
              ))
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
