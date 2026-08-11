import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import Sparkline from "../components/Sparkline";
import { Card, Gauge, Kpi, Loading, Tag } from "../components/common";
import { bytes, duration, loadColor, num, perSec, pct } from "../lib/format";

export default function Overview() {
  const { snapshot, connected, error } = useSelector((s) => s.live);

  if (!snapshot) {
    return (
      <>
        {error && <div className="note warn">{error}</div>}
        <Loading label="Birinchi o'lchov kutilmoqda…" />
      </>
    );
  }

  const { system, docker, services, security, net, history } = snapshot;
  const { cpu, memory, host, root, disks } = system;

  const cpuSeries = history.map((h) => h.cpu);
  const memSeries = history.map((h) => h.mem);
  const rxSeries = history.map((h) => h.rx);
  const txSeries = history.map((h) => h.tx);
  const netMax = Math.max(...rxSeries, ...txSeries, 1);

  return (
    <>
      {!connected && (
        <div className="note warn">
          Jonli ulanish uzildi — qayta ulanmoqda. Ko'rsatilgan ma'lumot
          oxirgi o'lchovdan.
        </div>
      )}

      {security.problems.length > 0 && (
        <div className="note bad">
          <b>Xavfsizlik e'tibor talab qiladi:</b> {security.problems.join(" · ")} —{" "}
          <Link to="/xavfsizlik">batafsil</Link>
        </div>
      )}

      <div className="kpis">
        <Kpi
          label="Protsessor"
          value={pct(cpu.usagePercent)}
          sub={`${cpu.cores} yadro · yuk ${cpu.load1}`}
          tone={cpu.usagePercent >= 85 ? "bad" : cpu.usagePercent >= 60 ? "warn" : "good"}
        />
        <Kpi
          label="Operativ xotira"
          value={pct(memory.usedPercent)}
          sub={`${bytes(memory.usedMb * 1024 ** 2)} / ${bytes(memory.totalMb * 1024 ** 2)}`}
          tone={memory.usedPercent >= 90 ? "bad" : memory.usedPercent >= 75 ? "warn" : "good"}
        />
        <Kpi
          label="Bo'sh disk"
          value={root ? `${root.freeGb} GB` : "—"}
          sub={root ? `${root.usedGb} / ${root.sizeGb} GB band (${root.usedPercent}%)` : ""}
          tone={root && root.usedPercent >= 85 ? "bad" : root && root.usedPercent >= 70 ? "warn" : "good"}
        />
        <Kpi
          label="Konteynerlar"
          value={`${docker.running} / ${docker.total}`}
          sub={docker.stopped ? `${docker.stopped} tasi to'xtagan` : "hammasi ishlayapti"}
          tone={docker.stopped ? "warn" : "good"}
        />
        <Kpi
          label="Xizmatlar"
          value={`${services.running} / ${services.total}`}
          sub={services.failed ? `${services.failed} tasi xato` : "xato yo'q"}
          tone={services.failed ? "bad" : "good"}
        />
        <Kpi
          label="Ishlash muddati"
          value={duration(host.uptimeSeconds).split(" ")[0]}
          sub={duration(host.uptimeSeconds)}
        />
      </div>

      <div className="grid2">
        <Card title="Protsessor yuklamasi">
          <div className="pad" style={{ paddingBottom: 6 }}>
            <Gauge
              label={cpu.model}
              percent={cpu.usagePercent}
              color={loadColor(cpu.usagePercent)}
            />
          </div>
          <Sparkline data={cpuSeries} color="#4C9AFF" max={100} />
          <div className="legend">
            <span>1 daq: {cpu.load1}</span>
            <span>5 daq: {cpu.load5}</span>
            <span>15 daq: {cpu.load15}</span>
          </div>
        </Card>

        <Card title="Operativ xotira">
          <div className="pad" style={{ paddingBottom: 6 }}>
            <Gauge
              label={`Band: ${bytes(memory.usedMb * 1024 ** 2)}`}
              percent={memory.usedPercent}
              color={loadColor(memory.usedPercent)}
            />
            <Gauge
              label={`Kesh: ${bytes(memory.cacheMb * 1024 ** 2)}`}
              percent={(memory.cacheMb / memory.totalMb) * 100}
              right={bytes(memory.cacheMb * 1024 ** 2)}
              color="var(--ink-3)"
            />
          </div>
          <Sparkline data={memSeries} color="#3FBF7F" max={100} />
          <div className="legend">
            <span>Bo'sh: {bytes(memory.availableMb * 1024 ** 2)}</span>
            {memory.swapTotalMb > 0 && (
              <span>
                Swap: {bytes(memory.swapUsedMb * 1024 ** 2)} /{" "}
                {bytes(memory.swapTotalMb * 1024 ** 2)}
              </span>
            )}
          </div>
        </Card>
      </div>

      <div className="grid2">
        <Card title="Tarmoq tezligi">
          <div className="pad" style={{ paddingBottom: 6 }}>
            <div className="inline" style={{ gap: 22, marginBottom: 10 }}>
              <span>
                <span className="muted">Qabul: </span>
                <b style={{ fontFamily: "var(--mono)" }}>{perSec(net.rxPerSec)}</b>
              </span>
              <span>
                <span className="muted">Yuborish: </span>
                <b style={{ fontFamily: "var(--mono)" }}>{perSec(net.txPerSec)}</b>
              </span>
            </div>
          </div>
          <Sparkline data={rxSeries} color="#4C9AFF" max={netMax} height={44} />
          <Sparkline data={txSeries} color="#E0A33C" max={netMax} height={44} />
          <div className="legend">
            <span><i style={{ background: "#4C9AFF" }} />Qabul</span>
            <span><i style={{ background: "#E0A33C" }} />Yuborish</span>
          </div>
        </Card>

        <Card title="Disklar">
          <div className="pad">
            {disks.map((d) => (
              <Gauge
                key={d.mount}
                label={`${d.mount} — ${d.filesystem}`}
                percent={d.usedPercent}
                right={`${d.usedGb} / ${d.sizeGb} GB`}
                color={loadColor(d.usedPercent)}
              />
            ))}
          </div>
        </Card>
      </div>

      <div className="grid2">
        <Card title="Server haqida">
          <div className="tbl-wrap">
            <table>
              <tbody>
                <tr><td className="muted">Nomi</td><td className="mono">{host.hostname}</td></tr>
                <tr><td className="muted">Operatsion tizim</td><td>{host.os}</td></tr>
                <tr><td className="muted">Yadro</td><td className="mono">{host.kernel}</td></tr>
                <tr><td className="muted">Arxitektura</td><td className="mono">{host.arch}</td></tr>
                <tr><td className="muted">Yoqilgan</td><td>{new Date(host.bootedAt).toLocaleString("ru-RU")}</td></tr>
                <tr><td className="muted">Ishlayapti</td><td>{duration(host.uptimeSeconds)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Xavfsizlik qisqacha">
          <div className="tbl-wrap">
            <table>
              <tbody>
                <tr>
                  <td className="muted">Hujum urinishlari</td>
                  <td className="num">{num(security.totalFailed)}</td>
                </tr>
                <tr>
                  <td className="muted">Turli IP manzillar</td>
                  <td className="num">{num(security.uniqueSources)}</td>
                </tr>
                <tr>
                  <td className="muted">Hozir bloklangan</td>
                  <td className="num">{num(security.bannedNow)}</td>
                </tr>
                <tr>
                  <td className="muted">Firewall</td>
                  <td>
                    <Tag kind={security.firewallActive ? "ok" : "bad"}>
                      {security.firewallActive ? "yoqilgan" : "o'chiq"}
                    </Tag>
                  </td>
                </tr>
                <tr>
                  <td className="muted">Umumiy holat</td>
                  <td>
                    <Tag kind={security.problems.length ? "warn" : "ok"}>
                      {security.problems.length
                        ? `${security.problems.length} ta muammo`
                        : "joyida"}
                    </Tag>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="pad" style={{ borderTop: "1px solid var(--line)" }}>
            <Link className="btn sm" to="/xavfsizlik">Batafsil ko'rish →</Link>
          </div>
        </Card>
      </div>
    </>
  );
}
