import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useLogoutMutation, useProjectsQuery } from "../store/api";
import { useLive } from "./useLive";
import { useTheme } from "../lib/theme";
import { bytes, duration } from "../lib/format";

// Menyu dizayn bo'yicha guruhlangan: kuzatuv / tarmoq / amallar.
const NAV = [
  {
    cap: "Kuzatuv",
    items: [
      { to: "/", label: "Umumiy holat", end: true },
      { to: "/loyihalar", label: "Loyihalar", count: "projects" },
      { to: "/konteynerlar", label: "Konteynerlar", count: "containers" },
      { to: "/xizmatlar", label: "Xizmatlar va cron" },
    ],
  },
  {
    cap: "Tarmoq",
    items: [
      { to: "/xavfsizlik", label: "Xavfsizlik", pill: "banned" },
      { to: "/trafik", label: "Trafik va domenlar" },
    ],
  },
  {
    cap: "Amallar",
    items: [
      { to: "/loglar", label: "Jonli loglar" },
      { to: "/deploy", label: "Joylashtirish" },
      { to: "/alertlar", label: "Alertlar", pill: "alerts" },
    ],
  },
  {
    cap: "Hisob",
    items: [{ to: "/tolov", label: "To'lov va hisob" }],
  },
];

const TITLES = {
  "/": ["Umumiy holat", "cpu, xotira, tarmoq va loyihalar — real vaqtda"],
  "/loyihalar": ["Loyihalar", "/opt, /root/projects, /srv, /var/www"],
  "/konteynerlar": ["Konteynerlar", "docker ps · stats · system df"],
  "/xizmatlar": ["Xizmatlar va cron", "systemctl · list-timers · crontab"],
  "/xavfsizlik": ["Xavfsizlik", "auth.log · fail2ban · ufw · sshd -T"],
  "/trafik": ["Trafik va domenlar", "Caddy access log · ss -tlnp"],
  "/loglar": ["Jonli loglar", "journalctl -f · barcha xizmatlar"],
  "/deploy": ["Joylashtirish", "git pull · build · restart"],
  "/alertlar": ["Alertlar", "chegaralar brauzerda saqlanadi"],
  "/tolov": ["To'lov va hisob", "billing.json · Caddy sertifikatlari"],
};

export default function Layout() {
  // SSE ulanishi butun ilovada shu yerda — bitta oqim.
  useLive();

  const { pathname } = useLocation();
  const [logout] = useLogoutMutation();
  const [theme, toggleTheme] = useTheme();
  const { connected, snapshot, receivedAt } = useSelector((s) => s.live);
  const { data: projects } = useProjectsQuery(undefined);
  const [, force] = useState(0);

  // Soat va «yosh» har soniya yangilanadi — ekran qotib qolsa ko'rinadi.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sys = snapshot?.system;
  const age = receivedAt ? Math.round((Date.now() - receivedAt) / 1000) : null;
  const live = connected && age !== null && age <= 8;
  const dotKind = !connected || age === null ? "grey" : age > 20 ? "err" : live ? "ok" : "warn";

  const counts = {
    projects: projects?.items?.length ?? "",
    containers: snapshot
      ? `${snapshot.docker.running}/${snapshot.docker.total}`
      : "",
  };
  const pills = {
    banned: snapshot?.security?.bannedNow || 0,
    alerts: snapshot?.security?.problems?.length || 0,
  };

  const [title, hint] = TITLES[pathname] ||
    (pathname.startsWith("/loyihalar/") ? ["Loyiha", "resurs, katalog va loglar"] : ["Server nazorati", ""]);

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="mark">SN</div>
          <div style={{ minWidth: 0 }}>
            <div className="name">Server nazorati</div>
            <div className="host">169.58.23.132</div>
          </div>
        </div>

        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.cap}>
              <div className="cap">{group.cap}</div>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? "on" : "")}
                >
                  <span>{item.label}</span>
                  {item.count && counts[item.count] !== "" && (
                    <span className="count">{counts[item.count]}</span>
                  )}
                  {item.pill && pills[item.pill] > 0 && (
                    <span className={`pill ${item.pill === "banned" ? "err" : "warn"}`}>
                      {pills[item.pill]}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="cap">Host</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className={`dot ${dotKind}`} />
              <span className="cap">SSE</span>
            </span>
          </div>
          <div className="kv">
            <div><span>host</span><b>{sys?.host?.hostname || "—"}</b></div>
            <div><span>os</span><b>{sys?.host?.os?.replace(/ LTS.*/, "") || "—"}</b></div>
            <div><span>cpu</span><b>{sys ? `${sys.cpu.cores} yadro` : "—"}</b></div>
            <div>
              <span>uptime</span>
              <b>{sys ? duration(sys.host.uptimeSeconds) : "—"}</b>
            </div>
          </div>
          <button className="btn sm" onClick={toggleTheme}>
            {theme === "dark" ? "Yorug' rejim" : "Qorong'i rejim"}
          </button>
          <button className="btn sm" onClick={() => logout()}>
            Chiqish
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div style={{ minWidth: 0 }}>
            <div className="title">{title}</div>
            <div className="hint">{hint}</div>
          </div>
          <span className="spacer" />
          <div className="chipbar">
            <span>cpu <b>{sys ? `${sys.cpu.usagePercent}%` : "—"}</b></span>
            <span>ram <b>{sys ? `${sys.memory.usedPercent}%` : "—"}</b></span>
            <span>
              net <b>{snapshot ? bytes(snapshot.net.rxPerSec + snapshot.net.txPerSec) : "—"}/s</b>
            </span>
          </div>
          <div className="chipbar">
            <span className={`dot ${dotKind}`} />
            <b>{new Date().toLocaleTimeString("ru-RU")}</b>
          </div>
        </header>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
