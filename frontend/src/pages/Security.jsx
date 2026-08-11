import { useSecurityQuery } from "../store/api";
import { Card, Empty, ErrorBox, Kpi, Loading, Tag } from "../components/common";
import { dt, num } from "../lib/format";

export default function Security() {
  const { data, error, refetch, isFetching } = useSecurityQuery(undefined, {
    // Hujum ma'lumoti tez o'zgaradi — har 20 soniyada yangilanadi.
    pollingInterval: 20_000,
  });

  if (error) return <ErrorBox error={error} onRetry={refetch} />;
  if (!data) return <Loading />;

  const { attacks, fail2ban, firewall, ssh, problems, healthy } = data;
  const topAttempts = attacks.topSources[0]?.attempts || 1;

  return (
    <>
      {healthy ? (
        <div className="note ok">
          <b>Himoya joyida.</b> SSH faqat kalit bilan, firewall yoqilgan,
          fail2ban hujum qilayotgan manzillarni avtomatik bloklab turibdi.
        </div>
      ) : (
        <div className="note bad">
          <b>E'tibor bering:</b> {problems.join(" · ")}
        </div>
      )}

      <div className="kpis">
        <Kpi
          label="Hujum urinishlari"
          value={num(attacks.totalFailed)}
          sub={`oxirgi ${num(attacks.windowLines)} log qatorida`}
          tone="bad"
        />
        <Kpi
          label="Turli manbalar"
          value={num(attacks.uniqueSources)}
          sub="har xil IP manzil"
        />
        <Kpi
          label="Hozir bloklangan"
          value={num(fail2ban.currentlyBanned)}
          sub={`jami ${num(fail2ban.totalBanned)} marta bloklangan`}
          tone="good"
        />
        <Kpi
          label="Firewall"
          value={firewall.active ? "Yoqilgan" : "O'chiq"}
          sub={firewall.defaults || "—"}
          tone={firewall.active ? "good" : "bad"}
        />
        <Kpi
          label="SSH paroli"
          value={ssh.passwordAuth ? "Ochiq" : "Yopiq"}
          sub={`root: ${ssh.rootLogin}`}
          tone={ssh.passwordAuth ? "bad" : "good"}
        />
        <Kpi
          label="fail2ban"
          value={fail2ban.running ? "Ishlayapti" : "To'xtagan"}
          sub={`${num(fail2ban.totalFailed)} xato urinish qayd etilgan`}
          tone={fail2ban.running ? "good" : "bad"}
        />
      </div>

      <Card title="Qanday hujumlar bo'lyapti">
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Turi</th>
                <th className="num">Soni</th>
                <th>Bu nima degani</th>
              </tr>
            </thead>
            <tbody>
              {attacks.kinds.length === 0 && <Empty colSpan={3}>Hujum qayd etilmadi.</Empty>}
              {attacks.kinds.map((k) => (
                <tr key={k.kind}>
                  <td>
                    <b>{k.label}</b>
                  </td>
                  <td className="num">{num(k.count)}</td>
                  <td className="muted">{k.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid3">
        <Card title="Hujum qilayotgan manzillar">
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>IP manzil</th>
                  <th className="num">Urinish</th>
                  <th>Ulush</th>
                  <th>Qaysi loginlarni sinagan</th>
                  <th>Holat</th>
                </tr>
              </thead>
              <tbody>
                {attacks.topSources.length === 0 && (
                  <Empty colSpan={5}>Hujum manbasi yo'q.</Empty>
                )}
                {attacks.topSources.map((s) => (
                  <tr key={s.ip}>
                    <td className="mono">{s.ip}</td>
                    <td className="num">{num(s.attempts)}</td>
                    <td style={{ minWidth: 90 }}>
                      <span className="tree-bar">
                        <span
                          style={{
                            width: `${(100 * s.attempts) / topAttempts}%`,
                            background: "var(--danger)",
                          }}
                        />
                      </span>
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {s.users.join(", ") || "—"}
                    </td>
                    <td>
                      {s.banned ? (
                        <Tag kind="ok">bloklangan</Tag>
                      ) : (
                        <Tag kind="warn">kuzatuvda</Tag>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div>
          <Card title="Eng ko'p sinalgan loginlar">
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {attacks.topUsernames.length === 0 && <Empty colSpan={2} />}
                  {attacks.topUsernames.map((u) => (
                    <tr key={u.user}>
                      <td className="mono">{u.user}</td>
                      <td className="num">{num(u.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Muvaffaqiyatli kirishlar">
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {attacks.recentSuccess.length === 0 && (
                    <Empty colSpan={2}>Kirish yo'q.</Empty>
                  )}
                  {attacks.recentSuccess.map((s, i) => (
                    <tr key={i}>
                      <td>
                        <div className="mono">{s.ip}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {s.user} · {s.method === "publickey" ? "kalit" : s.method}
                        </div>
                      </td>
                      <td className="muted nowrap" style={{ fontSize: 12 }}>
                        {String(s.time || "").slice(0, 19).replace("T", " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pad" style={{ borderTop: "1px solid var(--line)" }}>
              <p className="hint" style={{ margin: 0 }}>
                Bu ro'yxatda sizga tanish bo'lmagan kirish bo'lsa — darhol
                SSH kalitlarini almashtiring.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid2">
        <Card title="Firewall qoidalari">
          <div className="tbl-wrap">
            <table>
              <tbody>
                {firewall.rules.length === 0 && <Empty colSpan={1}>Qoida yo'q.</Empty>}
                {firewall.rules.map((r, i) => (
                  <tr key={i}>
                    <td className="mono" style={{ fontSize: 12 }}>{r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="SSH sozlamasi">
          <div className="tbl-wrap">
            <table>
              <tbody>
                <tr>
                  <td className="muted">Parol bilan kirish</td>
                  <td>
                    <Tag kind={ssh.passwordAuth ? "bad" : "ok"}>
                      {ssh.passwordAuth ? "ochiq — xavfli" : "yopiq"}
                    </Tag>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Kalit bilan kirish</td>
                  <td>
                    <Tag kind={ssh.pubkeyAuth ? "ok" : "bad"}>
                      {ssh.pubkeyAuth ? "yoqilgan" : "o'chiq"}
                    </Tag>
                  </td>
                </tr>
                <tr>
                  <td className="muted">root kirishi</td>
                  <td className="mono">{ssh.rootLogin}</td>
                </tr>
                <tr>
                  <td className="muted">Urinishlar chegarasi</td>
                  <td className="mono">{ssh.maxAuthTries}</td>
                </tr>
                <tr>
                  <td className="muted">Port</td>
                  <td className="mono">{ssh.port}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {fail2ban.bannedIps.length > 0 && (
        <Card title={`Hozir bloklangan ${fail2ban.bannedIps.length} ta manzil`}>
          <div className="pad">
            <div className="inline">
              {fail2ban.bannedIps.map((ip) => (
                <Tag key={ip} kind="bad">{ip}</Tag>
              ))}
            </div>
            <p className="hint">
              Blok muddati tugagach avtomatik ochiladi. Panel faqat
              ko'rsatadi — bu yerdan bloklash yoki ochish mumkin emas.
            </p>
          </div>
        </Card>
      )}

      {isFetching && <div className="hint">Yangilanmoqda…</div>}
    </>
  );
}
