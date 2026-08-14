import { useSecurityQuery } from "../store/api";
import { BigChart } from "../components/Spark";
import {
  Bar, Card, Empty, ErrorBox, Kv, Loading, Row, Rows, State, Two,
} from "../components/common";
import { num } from "../lib/format";

const SRC_COLS = "130px 70px minmax(0,1fr) 120px 90px";

export default function Security() {
  const { data, isLoading, error, refetch } = useSecurityQuery(undefined, {
    pollingInterval: 25000,
  });

  if (isLoading) return <Loading label="auth.log tahlil qilinmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { attacks, fail2ban, firewall, ssh, problems, healthy } = data;
  const maxKind = Math.max(1, ...attacks.kinds.map((k) => k.count));

  return (
    <>
      <div className="g5">
        <div className="metric tight">
          <span className="cap">Muvaffaqiyatsiz urinish</span>
          <span className="big-n" style={{ color: "var(--err)" }}>
            {num(attacks.totalFailed)}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            oxirgi {num(attacks.windowLines)} qator
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">Manba IP</span>
          <span className="big-n">{attacks.uniqueSources}</span>
          <span className="mono muted" style={{ fontSize: 10 }}>turli manzil</span>
        </div>
        <div className="metric tight">
          <span className="cap">Hozir bloklangan</span>
          <span className="big-n" style={{ color: "var(--warn)" }}>
            {fail2ban.currentlyBanned}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            jami {fail2ban.totalBanned}
          </span>
        </div>
        <div className="metric tight">
          <span className="cap">fail2ban</span>
          <span className="big-n" style={{ color: fail2ban.running ? "var(--ok)" : "var(--err)" }}>
            {fail2ban.running ? "ishlayapti" : "o'chiq"}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>sshd jail</span>
        </div>
        <div className="metric tight">
          <span className="cap">Umumiy baho</span>
          <span className="big-n" style={{ color: healthy ? "var(--ok)" : "var(--warn)" }}>
            {healthy ? "yaxshi" : "e'tibor"}
          </span>
          <span className="mono muted" style={{ fontSize: 10 }}>
            {problems.length ? `${problems.length} ta izoh` : "muammo yo'q"}
          </span>
        </div>
      </div>

      {problems.map((p) => (
        <div className="note warn" key={p}>
          <span className="grow">{p}</span>
        </div>
      ))}

      <div className="split wide">
        <div className="col">
          <Card
            title="Urinishlar oqimi"
            sub={`${attacks.perMinute} urinish/daqiqa`}
            action={<span className="dot err" />}
          >
            <div className="pad">
              <BigChart
                height={150}
                grid={2}
                series={[{
                  label: "urinish",
                  data: attacks.timeline.map((t) => t.count),
                  color: "var(--err)",
                  fill: "var(--errBg)",
                  width: 2,
                }]}
              />
              <div className="axis" style={{ paddingTop: 8 }}>
                <span>{attacks.timeline[0]?.hour?.slice(5, 13).replace("T", " ") || ""}</span>
                <span>hozir</span>
              </div>
            </div>
          </Card>

          <Card title="Hujum turlari" sub="auth.log tahlili">
            {attacks.kinds.length === 0 ? (
              <Empty>Urinish qayd etilmagan.</Empty>
            ) : (
              attacks.kinds.map((k) => (
                <div className="kind" key={k.kind}>
                  <div className="top">
                    <span className={`dot ${k.kind === "muvaffaqiyatli" ? "ok" : "err"}`}
                          style={{ animation: "none" }} />
                    <span style={{ fontSize: 12.5, fontWeight: 500 }}>{k.label}</span>
                    <span className="spacer" />
                    <span className="mono" style={{ color: "var(--err)" }}>{num(k.count)}</span>
                  </div>
                  <Bar percent={(100 * k.count) / maxKind}
                       color={k.kind === "muvaffaqiyatli" ? "var(--ok)" : "var(--err)"} />
                  <p className="desc">{k.description}</p>
                </div>
              ))
            )}
          </Card>

          <Card title="Eng ko'p urinilgan manbalar">
            <Rows cols={SRC_COLS}
                  head={["ip", "urinish", "loginlar", "oxirgi", "holat"]}>
              {attacks.topSources.slice(0, 15).map((s) => (
                <Row cols={SRC_COLS} key={s.ip}>
                  <span className="mono">{s.ip}</span>
                  <span className="mono" style={{ color: "var(--err)" }}>{s.attempts}</span>
                  <span className="mono muted ellipsis">{s.users.join(", ") || "—"}</span>
                  <span className="mono muted" style={{ fontSize: 10.5 }}>
                    {s.lastSeen || "—"}
                  </span>
                  <State kind={s.banned ? "err" : "grey"}>
                    {s.banned ? "bloklangan" : "ochiq"}
                  </State>
                </Row>
              ))}
              {attacks.topSources.length === 0 && <Empty>Manba yo'q.</Empty>}
            </Rows>
          </Card>
        </div>

        <div className="col">
          <Card className="plain">
            <span className="cap">SSH sozlamasi</span>
            <Kv rows={[
              ["port", ssh.port || "—"],
              ["parol bilan kirish", ssh.passwordAuth ? "ochiq" : "o'chirilgan"],
              ["root login", ssh.rootLogin || "—"],
              ["kalit bilan", ssh.pubkeyAuth ? "yoqilgan" : "o'chiq"],
              ["maxAuthTries", ssh.maxAuthTries],
            ]} />
            {ssh.passwordAuth && (
              <p className="desc">
                Parol bilan kirish ataylab yoqilgan. fail2ban 3 ta xato urinishdan
                keyin manzilni bloklaydi.
              </p>
            )}
          </Card>

          <Card className="plain">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cap">Firewall (ufw)</span>
              <span className="spacer" />
              <span className={`tag ${firewall.active ? "ok" : "err"}`}>
                {firewall.active ? "active" : "o'chiq"}
              </span>
            </div>
            <span className="mono muted" style={{ fontSize: 10.5 }}>
              {firewall.defaults || "—"}
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {firewall.rules.slice(0, 12).map((r) => (
                <span className="pre" key={r}>{r}</span>
              ))}
              {firewall.rules.length === 0 && <span className="muted">Qoida yo'q.</span>}
            </div>
          </Card>

          <Card className="plain">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cap">Bloklangan IP'lar</span>
              <span className="spacer" />
              <span className="mono muted" style={{ fontSize: 9.5 }}>
                {fail2ban.bannedIps.length} ta
              </span>
            </div>
            <div className="chips">
              {fail2ban.bannedIps.map((ip) => (
                <span className="tag err" key={ip}>{ip}</span>
              ))}
              {fail2ban.bannedIps.length === 0 && (
                <span className="muted">Hozir bloklangan manzil yo'q.</span>
              )}
            </div>
          </Card>

          <Card className="plain">
            <span className="cap">Muvaffaqiyatli kirishlar</span>
            {attacks.recentSuccess.length === 0 ? (
              <span className="muted">Yozuv yo'q.</span>
            ) : (
              attacks.recentSuccess.map((s, i) => (
                <div className="login-row" key={`${s.time}-${i}`}>
                  <span className="faint">{s.time}</span>
                  <span style={{ color: "var(--fg2)" }}>{s.user}</span>
                  <span className="muted">{s.ip}</span>
                  <span className="spacer" />
                  <span style={{ color: "var(--ok)" }}>{s.method}</span>
                </div>
              ))
            )}
          </Card>

          <Card className="plain">
            <span className="cap">Eng ko'p sinalgan loginlar</span>
            <div className="chips">
              {attacks.topUsernames.map((u) => (
                <span className="tag" key={u.user}>{u.user} · {u.count}</span>
              ))}
              {attacks.topUsernames.length === 0 && <span className="muted">—</span>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
