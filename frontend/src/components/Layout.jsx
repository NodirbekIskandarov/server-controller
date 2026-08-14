import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import { useLogoutMutation } from "../store/api";
import { useLive } from "./useLive";
import LiveDot from "./LiveDot";
import { timeOnly } from "../lib/format";

const NAV = [
  { to: "/", icon: "📊", label: "Umumiy holat", end: true },
  { to: "/loyihalar", icon: "📁", label: "Loyihalar" },
  { to: "/docker", icon: "🐳", label: "Konteynerlar" },
  { to: "/xizmatlar", icon: "⚙️", label: "Xizmatlar" },
  { to: "/xavfsizlik", icon: "🛡", label: "Xavfsizlik", badge: true },
  { to: "/trafik", icon: "🌐", label: "Trafik" },
  { to: "/loglar", icon: "📜", label: "Jonli loglar" },
  { to: "/deploy", icon: "🚀", label: "Joylashtirish" },
];

const TITLES = {
  "/": "Umumiy holat",
  "/loyihalar": "Loyihalar",
  "/docker": "Docker konteynerlari",
  "/xizmatlar": "Tizim xizmatlari",
  "/xavfsizlik": "Xavfsizlik va hujumlar",
  "/trafik": "Tarmoq trafigi",
  "/loglar": "Jonli loglar",
  "/deploy": "Avtomatik joylashtirish",
};

export default function Layout() {
  // SSE ulanishi butun ilovada shu yerda — bitta oqim.
  useLive();

  const { pathname } = useLocation();
  const [logout] = useLogoutMutation();
  const username = useSelector((s) => s.auth.username);
  const { connected, snapshot, receivedAt } = useSelector((s) => s.live);
  const problems = snapshot?.security?.problems?.length || 0;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="logo">
            <span className={`pulse ${connected ? "" : "off"}`} /> Server nazorati
          </div>
          <div className="sub">
            {connected ? "jonli ulanish" : "ulanmoqda…"}
          </div>
        </div>

        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "on" : "")}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
              {item.badge && problems > 0 && (
                <span className="badge">{problems}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          <span><b>{username}</b></span>
          <button className="btn sm" onClick={() => logout()}>Chiqish</button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h1>{TITLES[pathname] || "Server nazorati"}</h1>
          <span className="spacer" />
          <LiveDot />
          <span className="clock">
            {receivedAt ? timeOnly(receivedAt) : ""}
          </span>
        </div>
        <div className="content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
