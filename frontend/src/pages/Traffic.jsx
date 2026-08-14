import { useState } from "react";
import { useTrafficQuery } from "../store/api";
import { BigChart } from "../components/Spark";
import {
  Bar, Card, Empty, ErrorBox, Loading, Row, Rows, State,
} from "../components/common";
import { bytes, num } from "../lib/format";

const WINDOWS = [15, 60, 240, 1440];
const DOM_COLS = "minmax(0,1.4fr) 80px 66px 76px 80px 96px";
const EP_COLS = "50px minmax(0,1.4fr) 68px 56px 66px 58px";
const METHOD_TONE = {
  GET: "info", POST: "ok", PUT: "warn", PATCH: "warn", DELETE: "err",
};

function statusKind(status) {
  if (status >= 500) return "err";
  if (status >= 400) return "warn";
  if (status >= 300) return "info";
  return "ok";
}

const STATUS_LABEL = {
  200: "muvaffaqiyatli", 204: "javob tanasiz", 206: "qisman",
  301: "doimiy yo'naltirish", 302: "vaqtinchalik", 304: "o'zgarmagan",
  400: "noto'g'ri so'rov", 401: "avtorizatsiya kerak", 403: "taqiqlangan",
  404: "topilmadi", 429: "juda ko'p so'rov",
  500: "server xatosi", 502: "upstream javob bermadi", 503: "band",
};

export default function Traffic() {
  const [minutes, setMinutes] = useState(60);
  const { data, isLoading, error, refetch } = useTrafficQuery(minutes, {
    pollingInterval: 30000,
  });

  if (isLoading) return <Loading label="Caddy loglari o'qilmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data.available) return <Empty title="Trafik ma'lumoti yo'q">{data.note}</Empty>;

  const errors = data.statuses
    .filter((s) => s.status >= 500)
    .reduce((a, s) => a + s.count, 0);
  const maxStatus = Math.max(1, ...data.statuses.map((s) => s.count));
  const rps = Math.round((data.total / (data.windowMinutes * 60)) * 100) / 100;
  const certByDomain = new Map((data.certificates || []).map((c) => [c.domain, c]));

  return (
    <>
      <div className="chips">
        {WINDOWS.map((w) => (
          <button
            key={w}
            className={`chip-btn ${w === minutes ? "on" : ""}`}
            onClick={() => setMinutes(w)}
          >
            {w < 60 ? `${w} daq` : w < 1440 ? `${w / 60} soat` : "1 kun"}
          </button>
        ))}
        <span className="spacer" />
        <span className="cap">
          {num(data.total)} so'rov · {rps} req/s · p95 {data.p95} ms
        </span>
      </div>

      <Card
        title="So'rovlar va javob vaqti"
        sub={`${data.windowMinutes} daqiqa`}
        action={
          <div className="legend">
            <span><i style={{ background: "var(--info)" }} />so'rov</span>
            <span><i style={{ background: "var(--warn)" }} />p95</span>
            <span><i style={{ background: "var(--err)" }} />5xx</span>
          </div>
        }
      >
        <div className="pad">
          <BigChart
            height={180}
            series={[
              { label: "req", data: data.timeline.map((t) => t.count),
                color: "var(--info)", fill: "var(--infoBg)", width: 2 },
              { label: "p95", data: data.timeline.map((t) => t.p95),
                color: "var(--warn)", width: 1.6, dashed: true },
              { label: "err", data: data.timeline.map((t) => t.errors),
                color: "var(--err)", width: 1.6 },
            ]}
          />
        </div>
      </Card>

      <div className="split wide">
        <div className="col">
          <Card title="Domenlar va sertifikatlar" sub="Caddy access log">
            <Rows cols={DOM_COLS}
                  head={["domen", "so'rov", "xato", "o'rtacha", "trafik", "sertifikat"]}>
              {data.domains.map((d) => {
                const cert = certByDomain.get(d.domain);
                const kind = cert?.daysLeft == null
                  ? "grey"
                  : cert.daysLeft < 7 ? "err" : cert.daysLeft < 21 ? "warn" : "ok";
                return (
                  <Row cols={DOM_COLS} key={d.domain}>
                    <span className="mono ellipsis">{d.domain}</span>
                    <span className="mono">{num(d.requests)}</span>
                    <span className="mono"
                          style={{ color: d.errors ? "var(--err)" : "var(--muted)" }}>
                      {d.errors}
                    </span>
                    <span className="mono muted">{d.avgMs} ms</span>
                    <span className="mono muted">{bytes(d.bytes)}</span>
                    <State kind={kind}>
                      {cert?.daysLeft == null ? "—" : `${cert.daysLeft} kun`}
                    </State>
                  </Row>
                );
              })}
            </Rows>
            <div className="pad">
              <span className="mono muted" style={{ fontSize: 10 }}>
                «Sertifikat» — Caddy yangilashni rejalashtirgan sanagacha qolgan kun.
                Amal qilish muddati undan ~30 kun keyin tugaydi.
              </span>
            </div>
          </Card>

          <Card title="Eng ko'p so'raladigan API'lar">
            <Rows cols={EP_COLS}
                  head={["usul", "endpoint", "req/s", "ulush", "p95",
                         { label: "xato", right: true }]}>
              {data.endpoints.map((e) => (
                <Row cols={EP_COLS} key={`${e.method} ${e.path}`} title={e.host}>
                  <span className={`tag ${METHOD_TONE[e.method] || ""}`}>{e.method}</span>
                  <span className="mono ellipsis">{e.path}</span>
                  <span className="mono">{e.perSec}</span>
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
          </Card>
        </div>

        <div className="col">
          <Card title="Javob kodlari" sub={errors ? `${errors} ta 5xx` : "5xx yo'q"}>
            <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.statuses.map((s) => (
                <div className="stack2" key={s.status}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="mono"
                          style={{ width: 34, color: `var(--${statusKind(s.status)})` }}>
                      {s.status}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {STATUS_LABEL[s.status] || "—"}
                    </span>
                    <span className="spacer" />
                    <span className="mono">{num(s.count)}</span>
                  </div>
                  <Bar percent={(100 * s.count) / maxStatus}
                       color={`var(--${statusKind(s.status)})`} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Eng faol IP'lar">
            <Rows cols="minmax(0,1fr) 70px 60px"
                  head={["ip", { label: "so'rov", right: true },
                         { label: "xato", right: true }]}>
              {data.topIps.slice(0, 10).map((i) => (
                <Row cols="minmax(0,1fr) 70px 60px" key={i.ip}>
                  <span className="mono ellipsis">{i.ip}</span>
                  <span className="mono right">{num(i.requests)}</span>
                  <span className="mono right"
                        style={{ color: i.errors ? "var(--err)" : "var(--muted)" }}>
                    {i.errors}
                  </span>
                </Row>
              ))}
            </Rows>
          </Card>

          <Card title="Ochiq portlar" sub="ss -tlnp">
            <Rows cols="70px minmax(0,1fr) 110px 90px"
                  head={["port", "manzil", "jarayon", { label: "ko'rinish", right: true }]}>
              {data.ports.map((p) => (
                <Row cols="70px minmax(0,1fr) 110px 90px" key={`${p.address}-${p.port}`}>
                  <span className="mono">{p.port}</span>
                  <span className="mono muted ellipsis">{p.address}</span>
                  <span className="mono ellipsis">{p.process || "—"}</span>
                  <span className="mono right"
                        style={{ color: p.public ? "var(--warn)" : "var(--ok)" }}>
                    {p.public ? "tashqi" : "ichki"}
                  </span>
                </Row>
              ))}
            </Rows>
          </Card>
        </div>
      </div>
    </>
  );
}
