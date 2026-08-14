import { useEffect, useRef, useState } from "react";
export function Loading({ label = "Yuklanmoqda…" }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  const detail =
    error?.data?.message || error?.data?.detail || error?.error ||
    (error?.status ? `Xatolik ${error.status}` : "Noma'lum xatolik");
  return (
    <div className="note bad">
      {String(detail)}
      {onRetry && (
        <button className="btn sm" onClick={onRetry} style={{ marginLeft: 10 }}>
          Qayta urinish
        </button>
      )}
    </div>
  );
}

export function Card({ title, action, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <h2>
          {title}
          {action && (<><span className="spacer" />{action}</>)}
        </h2>
      )}
      {children}
    </section>
  );
}

/**
 * Qiymat o'zgarganda qisqa urg'u beradi.
 *
 * O'lchov har 2 soniyada yangilanadi; urg'usiz raqam jimgina almashadi
 * va nima o'zgarganini payqash qiyin. Animatsiya CSS'da, `prefers-
 * reduced-motion` yoqilgan bo'lsa o'chadi.
 */
function useFlash(value) {
  const prev = useRef(value);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (prev.current === value) return undefined;
    prev.current = value;
    setOn(true);
    const id = setTimeout(() => setOn(false), 700);
    return () => clearTimeout(id);
  }, [value]);

  return on;
}

export function Kpi({ label, value, sub, tone = "" }) {
  const flash = useFlash(value);
  return (
    <div className={`kpi ${tone}`}>
      <div className="lbl">{label}</div>
      <div className={`val${flash ? " flash" : ""}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Tag({ children, kind = "" }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export function Empty({ children = "Ma'lumot yo'q.", colSpan }) {
  if (colSpan) {
    return (
      <tr>
        <td colSpan={colSpan} className="empty">{children}</td>
      </tr>
    );
  }
  return <div className="empty">{children}</div>;
}

/** Foizli ko'rsatkich — rang darajaga qarab o'zgaradi. */
export function Gauge({ label, percent, right, color }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className="gauge">
      <div className="gauge-head">
        <span>{label}</span>
        <b>{right ?? `${value.toFixed(1)}%`}</b>
      </div>
      <div className="gauge-track">
        <span
          className="gauge-fill"
          style={{ width: `${value}%`, background: color || "var(--accent)" }}
        />
      </div>
    </div>
  );
}
