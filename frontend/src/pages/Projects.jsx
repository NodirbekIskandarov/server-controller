import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { useProjectsQuery } from "../store/api";
import { Spark } from "../components/Spark";
import { Empty, ErrorBox, Loading, State } from "../components/common";
import { bytes, dt } from "../lib/format";

function kindOf(p) {
  if (p.services.length) return { kind: "ok", label: "xizmat" };
  if (p.containers.length) return { kind: "info", label: "konteyner" };
  return { kind: "grey", label: "statik" };
}

export default function Projects() {
  const navigate = useNavigate();
  const { snapshot } = useSelector((s) => s.live);
  const { data, isLoading, isFetching, error, refetch } = useProjectsQuery(undefined);
  const cpuData = (snapshot?.history || []).map((h) => h.cpu);

  if (isLoading) return <Loading label="Hajmlar hisoblanmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data.items.length) return <Empty title="Loyiha topilmadi" />;

  return (
    <>
      <div className="chips">
        <span className="cap">{data.items.length} ta loyiha</span>
        <span className="cap">{bytes(data.summary.totalBytes)}</span>
        {Object.entries(data.summary.byKind).map(([kind, n]) => (
          <span className="tag" key={kind}>{kind} · {n}</span>
        ))}
        <span className="spacer" />
        <button className="btn sm" disabled={isFetching} onClick={() => refetch()}>
          {isFetching ? "Hisoblanmoqda…" : "Hajmni qayta hisoblash"}
        </button>
      </div>

      <div className="cards">
        {data.items.map((p) => {
          const st = kindOf(p);
          return (
            <button
              className="project"
              key={p.path}
              onClick={() => navigate(`/loyihalar/${encodeURIComponent(p.name)}`)}
            >
              <span className="head">
                <span className="two">
                  <span className="t1" style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                  <span className="t2">{p.path}</span>
                </span>
                <span className="spacer" />
                <State kind={st.kind}>{st.label}</State>
              </span>

              <Spark data={cpuData} color={`var(--${st.kind})`} height={52} />

              <span className="facts">
                <span className="f">
                  <span className="cap">hajm</span>
                  <span className="mono">{p.sizeHuman}</span>
                </span>
                <span className="f">
                  <span className="cap">turi</span>
                  <span className="mono">{p.kind}</span>
                </span>
                <span className="f">
                  <span className="cap">xizmat</span>
                  <span className="mono">{p.services.length || "—"}</span>
                </span>
                <span className="f">
                  <span className="cap">domen</span>
                  <span className="mono">{p.domains.length || "—"}</span>
                </span>
              </span>

              <span className="chips">
                {p.domains.slice(0, 2).map((d) => (
                  <span className="tag" key={d}>{d}</span>
                ))}
                {p.containers.slice(0, 2).map((cn) => (
                  <span className="tag info" key={cn}>{cn}</span>
                ))}
                {!p.domains.length && !p.containers.length && (
                  <span className="tag">{p.kind}</span>
                )}
              </span>

              <span className="foot-row">
                <span className="mono">
                  {p.git ? `${p.git.branch} · ${p.git.commit}` : "git yo'q"}
                </span>
                <span className="spacer" />
                <span className="mono">{p.updatedAt ? dt(p.updatedAt) : "—"}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
