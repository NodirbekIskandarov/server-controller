import { useState } from "react";
import { useTrafficQuery } from "../store/api";
import Sparkline from "../components/Sparkline";
import { Card, Empty, ErrorBox, Kpi, Loading, Tag } from "../components/common";
import { bytes, num } from "../lib/format";

const RANGES = [15, 60, 360, 1440];

function rangeLabel(m) {
  if (m < 60) return `${m} daqiqa`;
  if (m < 1440) return `${m / 60} soat`;
  return "1 kun";
}

export default function Traffic() {
  const [minutes, setMinutes] = useState(60);
  const { data, error, refetch, isFetching } = useTrafficQuery(minutes, {
    pollingInterval: 20_000,
  });

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading label="Trafik o'qilmoqda…" />;

  const timeline = data.timeline.map((t) => t.count);
  const topIp = data.topIps[0]?.requests || 1;
  const totalErrors = data.domains.reduce((a, d) => a + d.errors, 0);

  return (
    <>
      <Card>
        <div className="pad">
          <div className="row">
            <span className="muted" style={{ fontSize: 13 }}>
              Davr:
            </span>
            {RANGES.map((m) => (
              <button
                key={m}
                className={`btn sm ${minutes === m ? "pri" : ""}`}
                onClick={() => setMinutes(m)}
              >
                {rangeLabel(m)}
              </button>
            ))}
            {isFetching && <span className="muted">yangilanmoqda…</span>}
          </div>
        </div>
      </Card>

      {!data.available && <div className="note warn">{data.note}</div>}

      <div className="kpis">
        <Kpi
          label="So'rovlar"
          value={num(data.total)}
          sub={`oxirgi ${rangeLabel(minutes)}`}
        />
        <Kpi label="Daqiqasiga" value={data.perMinuteAvg} sub="o'rtacha" />
        <Kpi label="Domenlar" value={data.domains.length} sub="so'rov kelgan" />
        <Kpi
          label="Xatolar"
          value={num(totalErrors)}
          tone={totalErrors ? "warn" : "good"}
          sub="4xx va 5xx"
        />
        <Kpi label="Turli IP" value={num(data.topIps.length)} sub="so'rov yuborgan" />
      </div>

      {timeline.length > 1 && (
        <Card title="So'rovlar dinamikasi">
          <Sparkline data={timeline} color="#4C9AFF" height={90} />
          <div className="legend">
            <span>Har daqiqadagi so'rovlar soni</span>
          </div>
        </Card>
      )}

      <div className="grid2">
        <Card title="Domenlar bo'yicha">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Domen</th>
                  <th className="num">So'rov</th>
                  <th className="num">Xato</th>
                  <th className="num">O'rtacha</th>
                  <th className="num">Trafik</th>
                </tr>
              </thead>
              <tbody>
                {data.domains.length === 0 && (
                  <Empty colSpan={5}>Ma'lumot yo'q.</Empty>
                )}
                {data.domains.map((d) => (
                  <tr key={d.domain}>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {d.domain}
                    </td>
                    <td className="num">{num(d.requests)}</td>
                    <td className="num">
                      {d.errors ? (
                        <span style={{ color: "var(--danger)" }}>{d.errors}</span>
                      ) : (
                        0
                      )}
                    </td>
                    <td className="num">{d.avgMs} ms</td>
                    <td className="num">{bytes(d.bytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Javob kodlari">
          <div className="tbl-wrap">
            <table>
              <tbody>
                {data.statuses.length === 0 && <Empty colSpan={2} />}
                {data.statuses.map((s) => (
                  <tr key={s.status}>
                    <td>
                      <Tag
                        kind={
                          s.status >= 500 ? "bad" : s.status >= 400 ? "warn" : "ok"
                        }
                      >
                        {s.status}
                      </Tag>
                    </td>
                    <td className="num">{num(s.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="grid2">
        <Card title="Eng ko'p so'rov yuborgan IP manzillar">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>IP</th>
                  <th className="num">So'rov</th>
                  <th>Ulush</th>
                  <th className="num">Xato</th>
                </tr>
              </thead>
              <tbody>
                {data.topIps.length === 0 && <Empty colSpan={4} />}
                {data.topIps.map((i) => (
                  <tr key={i.ip}>
                    <td className="mono">{i.ip}</td>
                    <td className="num">{num(i.requests)}</td>
                    <td style={{ minWidth: 80 }}>
                      <span className="tree-bar">
                        <span style={{ width: `${(100 * i.requests) / topIp}%` }} />
                      </span>
                    </td>
                    <td className="num">{i.errors || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Ochiq portlar">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th className="num">Port</th>
                  <th>Manzil</th>
                  <th>Jarayon</th>
                  <th>Ko'rinishi</th>
                </tr>
              </thead>
              <tbody>
                {(data.ports || []).length === 0 && <Empty colSpan={4} />}
                {(data.ports || []).map((p, k) => (
                  <tr key={k}>
                    <td className="num">{p.port}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {p.address}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {p.process || "—"}
                    </td>
                    <td>
                      <Tag kind={p.public ? "warn" : "ok"}>
                        {p.public ? "tashqaridan" : "faqat ichkarida"}
                      </Tag>
                    </td>
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
