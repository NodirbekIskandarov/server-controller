import { useState } from "react";
import { useProjectsQuery } from "../store/api";
import { Card, Empty, ErrorBox, Kpi, Loading, Tag } from "../components/common";
import { bytes, dt } from "../lib/format";

const KIND_ICON = {
  "docker-compose": "🐳",
  node: "🟩",
  python: "🐍",
  go: "🐹",
  rust: "🦀",
  statik: "📄",
  boshqa: "📦",
};

function Tree({ nodes, max }) {
  if (!nodes?.length) return <div className="hint">Ichida hech narsa yo'q.</div>;
  return (
    <div className="tree">
      {nodes.map((n) => (
        <div key={n.path}>
          <div className="tree-row">
            <span>
              {n.isDir ? "📁" : "📄"} {n.name}
            </span>
            <span className="tree-bar">
              <span style={{ width: `${Math.min(100, (100 * n.sizeBytes) / max)}%` }} />
            </span>
            <span style={{ textAlign: "right" }}>{bytes(n.sizeBytes)}</span>
          </div>
          {n.children?.slice(0, 8).map((child) => (
            <div className="tree-row child" key={child.path}>
              <span>
                {child.isDir ? "📁" : "📄"} {child.name}
              </span>
              <span className="tree-bar">
                <span
                  style={{
                    width: `${Math.min(100, (100 * child.sizeBytes) / max)}%`,
                    background: "var(--ink-3)",
                  }}
                />
              </span>
              <span style={{ textAlign: "right" }}>{bytes(child.sizeBytes)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Projects() {
  const [refresh, setRefresh] = useState(false);
  const { data, isFetching, error, refetch } = useProjectsQuery(refresh);
  const [open, setOpen] = useState(null);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading label="Loyihalar o'lchanmoqda…" />;

  const { items, summary } = data;
  const biggest = items[0]?.sizeBytes || 1;

  return (
    <>
      <div className="kpis">
        <Kpi label="Loyihalar" value={summary.count} sub="serverdagi barcha" />
        <Kpi label="Jami hajm" value={bytes(summary.totalBytes)} sub="kod va ma'lumot" />
        <Kpi
          label="Eng kattasi"
          value={items[0]?.name || "—"}
          sub={items[0] ? bytes(items[0].sizeBytes) : ""}
        />
        <Kpi
          label="Turlari"
          value={Object.keys(summary.byKind).length}
          sub={Object.entries(summary.byKind)
            .map(([k, v]) => `${k} ${v}`)
            .join(" · ")}
        />
      </div>

      <Card
        title={`${items.length} ta loyiha`}
        action={
          <button
            className="btn sm"
            disabled={isFetching}
            onClick={() => {
              setRefresh(true);
              refetch();
            }}
          >
            {isFetching ? "O'lchanmoqda…" : "↻ Qayta o'lchash"}
          </button>
        }
      >
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Loyiha</th>
                <th>Turi</th>
                <th className="num">Hajmi</th>
                <th>Ulush</th>
                <th>Domen</th>
                <th>Ishga tushirilgan</th>
                <th>Git</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <Empty colSpan={8}>Loyiha topilmadi.</Empty>}
              {items.map((p) => (
                <tr key={p.path}>
                  <td>
                    <b>{p.name}</b>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>
                      {p.path}
                    </div>
                  </td>
                  <td>
                    <Tag>{KIND_ICON[p.kind] || "📦"} {p.kind}</Tag>
                  </td>
                  <td className="num">{p.sizeHuman}</td>
                  <td style={{ minWidth: 110 }}>
                    <span className="tree-bar">
                      <span style={{ width: `${(100 * p.sizeBytes) / biggest}%` }} />
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {p.domains.length ? (
                      p.domains.map((d) => (
                        <div key={d}>
                          <a href={`https://${d}`} target="_blank" rel="noopener">
                            {d}
                          </a>
                        </div>
                      ))
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.services.map((s) => (
                      <div key={s} className="mono">⚙️ {s}</div>
                    ))}
                    {p.containers.map((s) => (
                      <div key={s} className="mono">🐳 {s}</div>
                    ))}
                    {!p.services.length && !p.containers.length && (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {p.git ? (
                      <>
                        <div className="mono">
                          {p.git.branch} · {p.git.commit}
                        </div>
                        <div className="muted">{p.git.message.slice(0, 40)}</div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => setOpen(open === p.path ? null : p.path)}
                    >
                      {open === p.path ? "Yopish" : "Tuzilma"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card title={`Tuzilma — ${open}`}>
          <div className="pad">
            <Tree
              nodes={items.find((p) => p.path === open)?.tree}
              max={items.find((p) => p.path === open)?.sizeBytes || 1}
            />
            <p className="hint">
              Eng katta 40 ta element ko'rsatiladi. Hajm haqiqiy disk
              egallashi bo'yicha (<code>du</code>).
            </p>
          </div>
        </Card>
      )}
    </>
  );
}
