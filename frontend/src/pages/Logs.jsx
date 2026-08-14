import { useMemo, useState } from "react";
import { useDockerQuery, useServicesQuery } from "../store/api";
import { useTail, parseLine } from "../components/useTail";
import { Empty } from "../components/common";

const LEVELS = [
  ["", "hammasi"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"],
];

export default function Logs() {
  const { data: services } = useServicesQuery(undefined);
  const { data: docker } = useDockerQuery(undefined);
  const [source, setSource] = useState({ kind: "tizim", name: "" });
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");

  const { lines, live } = useTail({ ...source, limit: 400 });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines
      .map((l) => ({ ...parseLine(l), id: l.id }))
      .filter((r) => !level || r.level === level)
      .filter((r) => !needle
        || r.msg.toLowerCase().includes(needle)
        || r.svc.toLowerCase().includes(needle));
  }, [lines, level, search]);

  const own = (services?.units || [])
    .filter((u) => /^(tanga|server-controller|gym|kino|teacher|portfolio)/.test(u.name))
    .slice(0, 8);
  const containers = (docker?.containers || [])
    .filter((c) => c.state === "running")
    .slice(0, 8);

  const isOn = (kind, name) => source.kind === kind && source.name === name;

  return (
    <>
      <div className="chips">
        <button className={`chip-btn ${isOn("tizim", "") ? "on" : ""}`}
                onClick={() => setSource({ kind: "tizim", name: "" })}>
          butun tizim
        </button>
        {own.map((u) => (
          <button key={u.name}
                  className={`chip-btn ${isOn("xizmat", u.name) ? "on" : ""}`}
                  onClick={() => setSource({ kind: "xizmat", name: u.name })}>
            {u.name.replace(/\.service$/, "")}
          </button>
        ))}
        {containers.map((c) => (
          <button key={c.name}
                  className={`chip-btn ${isOn("docker", c.name) ? "on" : ""}`}
                  onClick={() => setSource({ kind: "docker", name: c.name })}>
            🐳 {c.name}
          </button>
        ))}
      </div>

      <div className="chips">
        {LEVELS.map(([v, label]) => (
          <button key={v}
                  className={`chip-btn ${level === v ? "on" : ""}`}
                  onClick={() => setLevel(v)}>
            {label}
          </button>
        ))}
        <input
          className="field"
          style={{ width: 230, marginLeft: 6 }}
          placeholder="matn bo'yicha filtr…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="spacer" />
        <span className={`dot ${live ? "ok" : "grey"}`} />
        <span className="cap">
          {rows.length} / {lines.length} qator
        </span>
      </div>

      <div className="card" style={{ background: "var(--panel2)" }}>
        <div className="sweep"><span /></div>
        <div className="stream">
          {rows.length === 0 && (
            <Empty title="Qator yo'q">
              {lines.length ? "Filtrga mos qator topilmadi." : "Oqim kutilmoqda…"}
            </Empty>
          )}
          {rows.map((r) => (
            <div className="row" key={r.id}>
              <span className="faint">{r.time}</span>
              <span className={`lvl ${r.level}`}>{r.level.slice(0, 4)}</span>
              <span className="muted ellipsis">{r.svc}</span>
              <span style={{ color: "var(--fg2)", wordBreak: "break-word" }}>{r.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
