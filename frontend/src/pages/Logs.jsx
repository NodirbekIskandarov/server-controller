import { useEffect, useMemo, useRef, useState } from "react";
import { useDockerQuery, useServicesQuery } from "../store/api";
import { Card, Loading } from "../components/common";

const MAX_LINES = 800;

export default function Logs() {
  const { data: services } = useServicesQuery();
  const { data: docker } = useDockerQuery();

  const [source, setSource] = useState(null); // { kind, name }
  const [lines, setLines] = useState([]);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const box = useRef(null);

  // O'z loyihalari tepada tursin — ular ko'proq kerak bo'ladi.
  const options = useMemo(() => {
    const own = /^(hisobchi|hisobchim|server-controller)/;
    const units = (services?.units || [])
      .filter((u) => u.active === "active" || own.test(u.name))
      .map((u) => ({ kind: "systemd", name: u.name, label: u.name.replace(".service", "") }));
    units.sort((a, b) => Number(own.test(b.name)) - Number(own.test(a.name)));
    const containers = (docker?.containers || [])
      .filter((c) => c.state === "running")
      .map((c) => ({ kind: "docker", name: c.name, label: c.name }));
    return { units, containers };
  }, [services, docker]);

  // Tanlangan manba o'zgarganda eski oqim yopiladi, yangisi ochiladi.
  useEffect(() => {
    if (!source) return;
    setLines([]);
    const url =
      `/api/logs/oqim?tur=${encodeURIComponent(source.kind)}` +
      `&nom=${encodeURIComponent(source.name)}`;
    const es = new EventSource(url, { withCredentials: true });
    es.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        setLines((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      } catch {
        /* buzuq xabar */
      }
    };
    es.onerror = () =>
      setLines((prev) => [
        ...prev,
        { at: new Date().toISOString(), line: "— ulanish uzildi —", stream: "err" },
      ]);
    return () => es.close();
  }, [source]);

  // Pauzada bo'lmasa pastga siljiymiz.
  useEffect(() => {
    if (paused) return;
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, paused]);

  const shown = filter
    ? lines.filter((l) => l.line.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  if (!services || !docker) return <Loading label="Ro'yxat tayyorlanmoqda…" />;

  return (
    <>
      <Card title="Nimani kuzatamiz">
        <div className="pad">
          <div className="row" style={{ marginBottom: 12 }}>
            <label className="fld" style={{ margin: 0, minWidth: 260 }}>
              <span>Xizmat (systemd)</span>
              <select
                value={source?.kind === "systemd" ? source.name : ""}
                onChange={(e) =>
                  e.target.value && setSource({ kind: "systemd", name: e.target.value })
                }
              >
                <option value="">— tanlang —</option>
                {options.units.map((u) => (
                  <option key={u.name} value={u.name}>{u.label}</option>
                ))}
              </select>
            </label>

            <label className="fld" style={{ margin: 0, minWidth: 240 }}>
              <span>Konteyner (docker)</span>
              <select
                value={source?.kind === "docker" ? source.name : ""}
                onChange={(e) =>
                  e.target.value && setSource({ kind: "docker", name: e.target.value })
                }
              >
                <option value="">— tanlang —</option>
                {options.containers.map((c) => (
                  <option key={c.name} value={c.name}>{c.label}</option>
                ))}
              </select>
            </label>

            <label className="fld grow" style={{ margin: 0, minWidth: 200 }}>
              <span>Qidiruv</span>
              <input
                type="text"
                placeholder="matn bo'yicha filtr"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </label>
          </div>

          <div className="row">
            <button
              className={`btn sm ${paused ? "pri" : ""}`}
              onClick={() => setPaused(!paused)}
              disabled={!source}
            >
              {paused ? "▶ Davom ettirish" : "⏸ Pauza (siljitmaslik)"}
            </button>
            <button className="btn sm" onClick={() => setLines([])} disabled={!source}>
              Tozalash
            </button>
            {source && (
              <span className="muted" style={{ fontSize: 13 }}>
                {source.kind === "docker" ? "🐳" : "⚙️"} {source.name} ·{" "}
                {shown.length} qator
                {filter && ` (${lines.length} tadan)`}
              </span>
            )}
          </div>
        </div>
      </Card>

      <Card title={source ? `Jonli log — ${source.name}` : "Jonli log"}>
        {!source ? (
          <div className="empty">
            Yuqoridan xizmat yoki konteyner tanlang — loglar shu yerda
            jonli oqadi.
          </div>
        ) : (
          <pre className="logs" ref={box} style={{ maxHeight: 620 }}>
            {shown.map((l, i) => (
              <div
                key={i}
                style={{
                  color:
                    l.stream === "err"
                      ? "var(--danger)"
                      : l.stream === "info"
                        ? "var(--accent)"
                        : "inherit",
                }}
              >
                {l.line}
              </div>
            ))}
            {shown.length === 0 && "Hozircha qator yo'q — kutilmoqda…"}
          </pre>
        )}
      </Card>
    </>
  );
}
