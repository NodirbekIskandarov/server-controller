import { useDockerQuery } from "../store/api";
import { Card, Empty, ErrorBox, Kpi, Loading, Tag } from "../components/common";
import { pct } from "../lib/format";

export default function Docker() {
  const { data, error, refetch } = useDockerQuery(undefined, {
    pollingInterval: 10_000,
  });

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading label="Konteynerlar o'qilmoqda…" />;

  const busiest = Math.max(...data.containers.map((c) => c.cpuPercent), 1);

  return (
    <>
      <div className="kpis">
        <Kpi label="Konteynerlar" value={data.total} sub="jami" />
        <Kpi label="Ishlayapti" value={data.running} tone="good" sub="faol" />
        <Kpi
          label="To'xtagan"
          value={data.stopped}
          tone={data.stopped ? "warn" : "good"}
          sub={data.stopped ? "e'tibor bering" : "hammasi joyida"}
        />
        <Kpi label="Umumiy CPU" value={pct(data.cpuTotal)} sub="barcha konteyner" />
        <Kpi label="Obrazlar" value={data.images.length} sub="yuklangan" />
      </div>

      <Card title="Konteynerlar">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Nomi</th>
                <th>Loyiha</th>
                <th>Obraz</th>
                <th>Holat</th>
                <th className="num">CPU</th>
                <th>Yuk</th>
                <th>Xotira</th>
                <th>Portlar</th>
              </tr>
            </thead>
            <tbody>
              {data.containers.length === 0 && <Empty colSpan={8} />}
              {data.containers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b>{c.name}</b>
                    <div className="muted mono" style={{ fontSize: 11.5 }}>
                      {c.id}
                    </div>
                  </td>
                  <td className="muted">{c.project || "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {c.image}
                  </td>
                  <td>
                    <Tag kind={c.state === "running" ? "ok" : "warn"}>{c.state}</Tag>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      {c.status}
                    </div>
                  </td>
                  <td className="num">{pct(c.cpuPercent)}</td>
                  <td style={{ minWidth: 90 }}>
                    <span className="tree-bar">
                      <span style={{ width: `${(100 * c.cpuPercent) / busiest}%` }} />
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {c.memUsage || "—"}
                    {c.memPercent > 0 && (
                      <div className="muted">{pct(c.memPercent)}</div>
                    )}
                  </td>
                  <td className="mono" style={{ fontSize: 11.5, maxWidth: 220 }}>
                    {c.ports || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid2">
        <Card title="Obrazlar">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Obraz</th>
                  <th>Teg</th>
                  <th className="num">Hajmi</th>
                  <th>Yaratilgan</th>
                </tr>
              </thead>
              <tbody>
                {data.images.length === 0 && <Empty colSpan={4} />}
                {data.images.map((i, k) => (
                  <tr key={k}>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {i.repository}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {i.tag}
                    </td>
                    <td className="num">{i.size}</td>
                    <td className="muted">{i.createdSince}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Docker disk egallashi">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Turi</th>
                  <th className="num">Soni</th>
                  <th className="num">Hajmi</th>
                  <th className="num">Bo'shatish mumkin</th>
                </tr>
              </thead>
              <tbody>
                {data.usage.length === 0 && <Empty colSpan={4} />}
                {data.usage.map((u, k) => (
                  <tr key={k}>
                    <td>{u.Type}</td>
                    <td className="num">{u.TotalCount}</td>
                    <td className="num">{u.Size}</td>
                    <td className="num">{u.Reclaimable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
