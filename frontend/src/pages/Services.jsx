import { useState } from "react";
import { useServiceLogsQuery, useServicesQuery } from "../store/api";
import { Card, Empty, ErrorBox, Kpi, Loading, Tag } from "../components/common";

function Logs({ unit }) {
  const { data, isFetching, error } = useServiceLogsQuery(unit, {
    pollingInterval: 5000,
  });
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading label="Loglar o'qilmoqda…" />;
  return (
    <pre className="logs">
      {data.rows.length ? data.rows.join("\n") : "Log yo'q."}
      {isFetching ? "\n…" : ""}
    </pre>
  );
}

export default function Services() {
  const { data, error, refetch } = useServicesQuery(undefined, {
    pollingInterval: 15_000,
  });
  const [open, setOpen] = useState(null);

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading label="Xizmatlar o'qilmoqda…" />;

  return (
    <>
      <div className="kpis">
        <Kpi label="Xizmatlar" value={data.total} sub="kuzatilayotgan" />
        <Kpi label="Ishlayapti" value={data.running} tone="good" />
        <Kpi
          label="Xato holatda"
          value={data.failed}
          tone={data.failed ? "bad" : "good"}
          sub={data.failed ? "tekshirish kerak" : "muammo yo'q"}
        />
      </div>

      <Card title="Xizmatlar ro'yxati">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Xizmat</th>
                <th>Tavsif</th>
                <th>Holat</th>
                <th className="num">Xotira</th>
                <th className="num">Qayta ishga tushgan</th>
                <th>Boshlangan</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.units.length === 0 && <Empty colSpan={7} />}
              {data.units.map((u) => (
                <tr key={u.name}>
                  <td className="mono">
                    <b>{u.name.replace(".service", "")}</b>
                  </td>
                  <td className="muted" style={{ fontSize: 12.5, maxWidth: 300 }}>
                    {u.description}
                  </td>
                  <td>
                    <Tag
                      kind={
                        u.active === "active"
                          ? "ok"
                          : u.active === "failed"
                            ? "bad"
                            : ""
                      }
                    >
                      {u.active} · {u.sub}
                    </Tag>
                  </td>
                  <td className="num">
                    {u.memoryMb != null ? `${u.memoryMb} MB` : "—"}
                  </td>
                  <td className="num">
                    {u.restarts > 0 ? (
                      <span style={{ color: "var(--warn)" }}>{u.restarts}</span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="muted nowrap" style={{ fontSize: 12 }}>
                    {u.since ? u.since.replace(/ [A-Z]+$/, "") : "—"}
                  </td>
                  <td>
                    <button
                      className="btn sm"
                      onClick={() => setOpen(open === u.name ? null : u.name)}
                    >
                      {open === u.name ? "Yopish" : "Loglar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card title={`Loglar — ${open}`}>
          <Logs unit={open} />
        </Card>
      )}
    </>
  );
}
