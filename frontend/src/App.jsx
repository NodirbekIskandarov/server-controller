import { Navigate, Route, Routes } from "react-router-dom";
import { useSelector } from "react-redux";
import { useSessionQuery } from "./store/api";
import { Loading } from "./components/common";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import Docker from "./pages/Docker";
import Services from "./pages/Services";
import Security from "./pages/Security";
import Traffic from "./pages/Traffic";
import Deploy from "./pages/Deploy";
import Logs from "./pages/Logs";
import AlertsPage from "./pages/AlertsPage";
import Billing from "./pages/Billing";

export default function App() {
  useSessionQuery();
  const { username, ready } = useSelector((s) => s.auth);

  if (!ready) return <Loading label="Tekshirilmoqda…" />;
  if (!username) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Overview />} />
        <Route path="/loyihalar" element={<Projects />} />
        <Route path="/loyihalar/:name" element={<ProjectDetail />} />
        <Route path="/konteynerlar" element={<Docker />} />
        <Route path="/xizmatlar" element={<Services />} />
        <Route path="/xavfsizlik" element={<Security />} />
        <Route path="/trafik" element={<Traffic />} />
        <Route path="/loglar" element={<Logs />} />
        <Route path="/deploy" element={<Deploy />} />
        <Route path="/alertlar" element={<AlertsPage />} />
        <Route path="/tolov" element={<Billing />} />

        {/* Eski manzil — havolalar buzilmasin. */}
        <Route path="/docker" element={<Navigate to="/konteynerlar" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
