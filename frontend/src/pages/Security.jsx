import { useState } from "react";
import {
  useFail2banMutation, useLimitsQuery, useSecurityQuery,
  useUfwAddMutation, useUfwDeleteMutation, useUfwRulesQuery,
} from "../store/api";
import { BigChart } from "../components/Spark";
import { useAction } from "../components/useAction";
import Confirm from "../components/Confirm";
import {
  Bar, Card, Empty, ErrorBox, Kv, Loading, Note, Row, Rows, State,
} from "../components/common";
import { num } from "../lib/format";

const SRC_COLS = "126px 62px minmax(0,1fr) 104px 78px 78px";
const UFW_COLS = "40px minmax(0,1.1fr) 90px minmax(0,1fr) 84px";

/** Yangi qoida formasining boshlang'ich holati. */
const EMPTY_RULE = { amal: "allow", port: "", protokol: "tcp", manba: "" };

export default function Security() {
  const { data, isLoading, error, refetch } = useSecurityQuery(undefined, {
    pollingInterval: 25000,
  });
  const { data: limits } = useLimitsQuery(undefined);
  const { data: ufw } = useUfwRulesQuery(undefined);

  const [ban] = useFail2banMutation();
  const [ufwAdd] = useUfwAddMutation();
  const [ufwDelete] = useUfwDeleteMutation();
  const { ask, props, result, clearResult } = useAction();

  const [jail, setJail] = useState("sshd");
  const [rule, setRule] = useState(EMPTY_RULE);
  const [adding, setAdding] = useState(false);

  if (isLoading) return <Loading label="auth.log tahlil qilinmoqda…" />;
  if (error) return <ErrorBox error={error} onRetry={refetch} />;

  const { attacks, fail2ban, firewall, ssh, problems, healthy } = data;
  const maxKind = Math.max(1, ...attacks.kinds.map((k) => k.count));
  const jails = limits?.jails || ["sshd"];
  const yourIp = limits?.yourIp || "";
  const rules = ufw?.rules || [];

  const askBan = (ip) =>
    ask({
      title: `${ip} bloklanadi`,
      what: `${ip} manzili «${jail}» jail'iga qo'shiladi.`,
      consequence:
        "Bu manzildan serverga hech qanday ulanish o'tmaydi — SSH ham, " +
        "sayt ham. Bloklash muddati fail2ban sozlamasida belgilangan.",
      command: `fail2ban-client set ${jail} banip ${ip}`,
      confirmLabel: "Bloklansin",
      run: () => ban({ amal: "ban", jail, ip }).unwrap(),
    });

  const askUnban = (ip, fromJail) =>
    ask({
      title: `${ip} blokdan chiqariladi`,
      what: `${ip} manzili «${fromJail}» jail'idan olib tashlanadi.`,
      consequence: "Bu manzil yana serverga ulana oladi.",
      command: `fail2ban-client set ${fromJail} unbanip ${ip}`,
      danger: false,
      confirmLabel: "Chiqarilsin",
      run: () => ban({ amal: "unban", jail: fromJail, ip }).unwrap(),
    });

  const askAddRule = () => {
    const port = Number(rule.port);
    const target = rule.manba
      ? `${rule.manba} manzilidan ${port}/${rule.protokol}`
      : `${port}/${rule.protokol}`;
    ask({
      title: `ufw ${rule.amal} ${port}`,
      what: `${target} portiga «${rule.amal}» qoidasi qo'shiladi.`,
      consequence:
        rule.amal === "allow"
          ? "Bu port tashqaridan ochiladi. Ortida nima turganini bilib qo'ying."
          : "Bu portga ulanishlar rad etiladi.",
      command:
        `ufw ${rule.amal} ` +
        (rule.manba
          ? `from ${rule.manba} to any port ${port} proto ${rule.protokol}`
          : `${port}/${rule.protokol}`),
      danger: rule.amal === "deny",
      confirmLabel: "Qo'shilsin",
      run: async () => {
        const res = await ufwAdd({
          amal: rule.amal,
          port,
          protokol: rule.protokol,
          manba: rule.manba || undefined,
        }).unwrap();
        setRule(EMPTY_RULE);
        setAdding(false);
        return res;
      },
    });
  };

  const askDeleteRule = (r) =>
    ask({
      title: `Qoida #${r.number} o'chiriladi`,
      what: `«${r.raw}» qoidasi firewall'dan olib tashlanadi.`,
      consequence:
        "Qoida o'chgach qolgan qoidalar raqami siljiydi — bu odatiy hol.",
      command: `ufw --force delete ${r.number}`,
      confirmLabel: "O'chirilsin",
      run: () => ufwDelete(r.number).unwrap(),
    });

  const portValid = Number(rule.port) >= 1 && Number(rule.port) <= 65535;

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
          <span className="mono muted" style={{ fontSize: 10 }}>
            {(fail2ban.jails || []).length || 1} ta jail
          </span>
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

      {result && (
        <Note kind="ok" action={<button className="btn sm" onClick={clearResult}>yopish</button>}>
          {result.text}
        </Note>
      )}

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

          <Card
            title="Eng ko'p urinilgan manbalar"
            action={
              <span className="chips">
                <span className="cap">jail</span>
                <select
                  className="field"
                  value={jail}
                  onChange={(e) => setJail(e.target.value)}
                >
                  {jails.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </span>
            }
          >
            <Rows cols={SRC_COLS}
                  head={["ip", "urinish", "loginlar", "oxirgi", "holat",
                         { label: "amal", right: true }]}>
              {attacks.topSources.slice(0, 15).map((s) => {
                // O'z manzilini bloklash serverdan ham o'tmaydi, lekin
                // tugma bosilgungacha buni ko'rsatib turgan yaxshi.
                const self = s.ip === yourIp;
                return (
                  <Row cols={SRC_COLS} key={s.ip}>
                    <span className="mono">{s.ip}</span>
                    <span className="mono" style={{ color: "var(--err)" }}>{s.attempts}</span>
                    <span className="mono muted ellipsis">{s.users.join(", ") || "—"}</span>
                    <span className="mono muted" style={{ fontSize: 10.5 }}>
                      {s.lastSeen || "—"}
                    </span>
                    <State kind={s.banned ? "err" : self ? "info" : "grey"}>
                      {s.banned ? "bloklangan" : self ? "siz" : "ochiq"}
                    </State>
                    <span className="acts">
                      {s.banned ? (
                        <button className="btn sm ok" onClick={() => askUnban(s.ip, jail)}>
                          chiqarish
                        </button>
                      ) : (
                        <button
                          className="btn sm err"
                          disabled={self}
                          title={self
                            ? "Bu sizning manzilingiz — bloklansa panelga kira olmaysiz"
                            : `fail2ban-client set ${jail} banip ${s.ip}`}
                          onClick={() => askBan(s.ip)}
                        >
                          bloklash
                        </button>
                      )}
                    </span>
                  </Row>
                );
              })}
              {attacks.topSources.length === 0 && <Empty>Manba yo'q.</Empty>}
            </Rows>
          </Card>

          <Card
            title="Firewall qoidalari"
            sub="ufw status numbered"
            action={
              <button className="btn sm" onClick={() => setAdding((v) => !v)}>
                {adding ? "bekor" : "+ qoida"}
              </button>
            }
          >
            {adding && (
              <div className="pad chips" style={{ borderBottom: "1px solid var(--line2)" }}>
                <select className="field" value={rule.amal}
                        onChange={(e) => setRule({ ...rule, amal: e.target.value })}>
                  <option value="allow">allow</option>
                  <option value="deny">deny</option>
                </select>
                <input
                  className="field" style={{ width: 90 }} placeholder="port"
                  inputMode="numeric" value={rule.port}
                  onChange={(e) => setRule({ ...rule, port: e.target.value.replace(/\D/g, "") })}
                />
                <select className="field" value={rule.protokol}
                        onChange={(e) => setRule({ ...rule, protokol: e.target.value })}>
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                  <option value="any">har ikki</option>
                </select>
                <input
                  className="field" style={{ width: 150 }}
                  placeholder="manba ip (ixtiyoriy)"
                  value={rule.manba}
                  onChange={(e) => setRule({ ...rule, manba: e.target.value.trim() })}
                />
                <button className="btn sm pri" disabled={!portValid} onClick={askAddRule}>
                  qo'shish
                </button>
              </div>
            )}

            <Rows cols={UFW_COLS}
                  head={["#", "yo'nalish", "amal", "manba", { label: "", right: true }]}>
              {rules.map((r) => (
                <Row cols={UFW_COLS} key={r.number}>
                  <span className="mono muted">{r.number}</span>
                  <span className="mono ellipsis">{r.to}</span>
                  <span className="mono muted">{r.action}</span>
                  <span className="mono muted ellipsis">{r.from}</span>
                  <span className="acts">
                    <button
                      className="btn sm err"
                      disabled={r.locked}
                      title={r.locked
                        ? "Hayotiy port (22/80/443) — o'chirilsa serverga kirish yo'qoladi"
                        : `ufw --force delete ${r.number}`}
                      onClick={() => askDeleteRule(r)}
                    >
                      {r.locked ? "qulf" : "o'chirish"}
                    </button>
                  </span>
                </Row>
              ))}
              {rules.length === 0 && <Empty>Qoida yo'q yoki ufw o'chiq.</Empty>}
            </Rows>
            <div className="pad">
              <p className="desc">
                <b>ufw disable</b> va <b>ufw reset</b> panel orqali mutlaqo
                taqiqlangan: ikkalasi ham firewall'ni bir buyruqda ochib
                yuboradi va uni qaytarish faqat SSH orqali mumkin bo'lardi.
              </p>
            </div>
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
            <Kv rows={[
              ["sizning ip", yourIp || "—"],
              ["himoyalangan portlar", (limits?.ports || []).join(", ") || "—"],
            ]} />
          </Card>

          <Card className="plain">
            <span className="cap">Jail'lar</span>
            {(fail2ban.jails || []).length === 0 ? (
              <span className="muted">Jail sozlanmagan.</span>
            ) : (
              <Kv rows={(fail2ban.jails || []).map((j) => [
                j.name, `${j.currentlyBanned} bloklangan · ${j.totalFailed} urinish`,
              ])} />
            )}
          </Card>

          <Card className="plain">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cap">Bloklangan IP'lar</span>
              <span className="spacer" />
              <span className="mono muted" style={{ fontSize: 9.5 }}>
                {fail2ban.bannedIps.length} ta
              </span>
            </div>
            {fail2ban.bannedIps.length === 0 ? (
              <span className="muted">Hozir bloklangan manzil yo'q.</span>
            ) : (
              (fail2ban.jails || []).map((j) =>
                j.bannedIps.map((ip) => (
                  <div className="login-row" key={`${j.name}-${ip}`}>
                    <span className="tag err">{ip}</span>
                    <span className="muted">{j.name}</span>
                    <span className="spacer" />
                    <button className="btn sm ok" onClick={() => askUnban(ip, j.name)}>
                      chiqarish
                    </button>
                  </div>
                )),
              )
            )}
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

      <Confirm {...props} />
    </>
  );
}
