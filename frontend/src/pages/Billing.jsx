import { useBillingQuery } from "../store/api";
import {
  Bar, Card, Empty, ErrorBox, Kv, Loading, Row, Rows, State,
} from "../components/common";

function money(value, currency = "USD") {
  const n = Number(value) || 0;
  return currency === "USD" ? `$${n.toFixed(2)}` : `${n.toFixed(2)} ${currency}`;
}

function day(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

const STATUS = {
  kechikkan: { kind: "err", label: "muddati o'tgan" },
  yaqin: { kind: "warn", label: "yaqinlashdi" },
  joyida: { kind: "ok", label: "joyida" },
};

/** Sozlanmagan holat: o'ylab topilgan raqam emas, aniq ko'rsatma. */
function Setup({ data }) {
  return (
    <>
      <div className="note warn">
        <span className="grow">{data.note}</span>
      </div>

      <Card title="Nima qilish kerak" sub={data.file}>
        <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p className="desc">
            Provayderda API yo'q, shuning uchun to'lov summasi va sanasini
            panel o'zi bila olmaydi. Quyidagi faylni serverda yarating —
            keyin bu ekranda haqiqiy sanalar va qolgan kunlar ko'rinadi.
          </p>
          <span className="pre" style={{ whiteSpace: "pre-wrap" }}>
            {`nano ${data.file}`}
          </span>
          <span className="pre" style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
            {JSON.stringify(data.template, null, 2)}
          </span>
          <p className="desc">
            Saqlagandan keyin: <span className="mono">systemctl restart
            server-controller</span>. Panel faylni faqat o'qiydi — hech narsa
            yozmaydi.
          </p>
        </div>
      </Card>

      {data.certificates?.length > 0 && (
        <Card title="Sertifikat muddatlari" sub="Caddy — bu ma'lumot haqiqiy">
          <Rows cols="minmax(0,1fr) 130px 90px"
                head={["domen", "yangilanish", { label: "qoldi", right: true }]}>
            {data.certificates.map((cert) => (
              <Row cols="minmax(0,1fr) 130px 90px" key={cert.domain}>
                <span className="mono ellipsis">{cert.domain}</span>
                <span className="mono muted">{day(cert.renewAt)}</span>
                <span className="mono right"
                      style={{
                        color: cert.daysLeft < 7 ? "var(--err)"
                          : cert.daysLeft < 21 ? "var(--warn)" : "var(--ok)",
                      }}>
                  {cert.daysLeft} kun
                </span>
              </Row>
            ))}
          </Rows>
        </Card>
      )}
    </>
  );
}

export default function Billing() {
  const { data, isLoading, error, refetch } = useBillingQuery(undefined, {
    pollingInterval: 300000,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data.configured) return <Setup data={data} />;

  const st = STATUS[data.status] || STATUS.joyida;
  const cur = data.currency;

  return (
    <div className="split">
      <div className="col">
        <Card className="plain" style={{ padding: 18 }}>
          <div style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div className="cap">Oylik to'lov</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span className="mono"
                      style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.03em" }}>
                  {money(data.monthly, cur)}
                </span>
                <span className="muted" style={{ fontSize: 13 }}>/oy</span>
              </div>
              <div className="mono muted" style={{ fontSize: 10.5 }}>
                {data.monthlyLocal
                  ? `${data.monthlyLocal.toLocaleString("ru-RU")} so'm`
                  : ""}
              </div>
            </div>

            <div style={{ paddingLeft: 22, borderLeft: "1px solid var(--line)" }}>
              <div className="cap">Keyingi to'lov</div>
              <div className="big-n">{day(data.dueAt)}</div>
              <div className="mono" style={{ fontSize: 10.5, marginTop: 4,
                                             color: `var(--${st.kind})` }}>
                {data.daysLeft < 0
                  ? `${Math.abs(data.daysLeft)} kun kechikdi`
                  : `${data.daysLeft} kun qoldi`}
              </div>
            </div>

            <div style={{ paddingLeft: 22, borderLeft: "1px solid var(--line)" }}>
              <div className="cap">Oxirgi to'lov</div>
              <div className="big-n">{day(data.lastPaidAt)}</div>
              <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                {data.lastPaidAmount != null
                  ? money(data.lastPaidAmount, cur)
                  : "yozuv yo'q"}
              </div>
            </div>

            <div style={{ paddingLeft: 22, borderLeft: "1px solid var(--line)" }}>
              <div className="cap">Holat</div>
              <div style={{ marginTop: 4 }}>
                <State kind={st.kind}>{st.label}</State>
              </div>
              <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
                {data.autopay ? "avtomatik to'lov yoqilgan" : "qo'lda to'lanadi"}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Xarajat tarkibi" sub="oyiga">
          <div className="pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.items.map((i) => (
              <div className="stack2" key={i.label}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12.5 }}>{i.label}</span>
                  <span className="mono muted" style={{ fontSize: 9.5 }}>
                    {i.detail || ""}
                  </span>
                  <span className="spacer" />
                  <span className="mono">{money(i.amount, cur)}</span>
                </div>
                <Bar percent={i.percent} color="var(--info)" className="h5" />
              </div>
            ))}
            {data.items.length === 0 && <Empty>Xarajat kiritilmagan.</Empty>}
          </div>
        </Card>

        <Card title="To'lovlar tarixi" sub="hisob-fakturalar">
          {data.payments.length === 0 ? (
            <Empty>To'lov yozuvi yo'q.</Empty>
          ) : (
            <Rows cols="110px minmax(0,1fr) 96px 110px 100px"
                  head={["sana", "hisob raqami", "summa", "usul", "holat"]}>
              {data.payments.map((p, i) => (
                <Row cols="110px minmax(0,1fr) 96px 110px 100px" key={`${p.date}-${i}`}>
                  <span className="mono muted">{day(p.date)}</span>
                  <span className="mono ellipsis">{p.invoice || "—"}</span>
                  <span className="mono">{money(p.amount, cur)}</span>
                  <span className="mono muted">{p.method || "—"}</span>
                  <State kind={p.status === "to'langan" ? "ok" : "warn"}>
                    {p.status || "—"}
                  </State>
                </Row>
              ))}
            </Rows>
          )}
        </Card>
      </div>

      <div className="col">
        <Card className="plain">
          <span className="cap">Tarif</span>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{data.plan}</div>
          <span className="mono muted" style={{ fontSize: 10.5 }}>
            {data.provider} · {data.region}
          </span>
          <Kv rows={[
            ["valyuta", data.currency],
            ["kurs", data.usdRate ? data.usdRate.toLocaleString("ru-RU") : "—"],
            ["balans", money(data.balance, cur)],
            ["avtomatik", data.autopay ? "yoqilgan" : "o'chiq"],
          ]} />
        </Card>

        <Card title="Muddat va xizmatlar">
          <Rows cols="minmax(0,1fr) 110px 80px"
                head={["xizmat", "sana", { label: "qoldi", right: true }]}>
            {data.renewals.map((r) => (
              <Row cols="minmax(0,1fr) 110px 80px" key={r.label}>
                <span className="ellipsis">{r.label}</span>
                <span className="mono muted">{day(r.date)}</span>
                <span className="mono right"
                      style={{ color: r.daysLeft < 30 ? "var(--warn)" : "var(--ok)" }}>
                  {r.daysLeft} kun
                </span>
              </Row>
            ))}
            {data.renewals.length === 0 && <Empty>Kiritilmagan.</Empty>}
          </Rows>
        </Card>

        <Card title="Sertifikatlar" sub="Caddy · avtomatik yangilanadi">
          <Rows cols="minmax(0,1fr) 80px"
                head={["domen", { label: "qoldi", right: true }]}>
            {(data.certificates || []).map((cert) => (
              <Row cols="minmax(0,1fr) 80px" key={cert.domain} title={day(cert.renewAt)}>
                <span className="mono ellipsis">{cert.domain}</span>
                <span className="mono right"
                      style={{
                        color: cert.daysLeft < 7 ? "var(--err)"
                          : cert.daysLeft < 21 ? "var(--warn)" : "var(--ok)",
                      }}>
                  {cert.daysLeft} kun
                </span>
              </Row>
            ))}
          </Rows>
        </Card>

        <Card className="plain">
          <span className="cap">Manba</span>
          <p className="desc">
            Raqamlar <span className="mono">{data.file}</span> faylidan
            o'qiladi. Provayder API'si yo'q, shuning uchun to'lov sanasi va
            summasi shu yerda turadi — panel ularni o'zgartirmaydi.
          </p>
        </Card>
      </div>
    </div>
  );
}
