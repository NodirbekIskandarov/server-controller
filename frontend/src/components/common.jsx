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
    <div className="note err">
      <span className="grow">{String(detail)}</span>
      {onRetry && (
        <button className="btn sm" onClick={onRetry}>
          Qayta urinish
        </button>
      )}
    </div>
  );
}

/** Sarlavhali karta. `sub` — sarlavha yonidagi mono izoh. */
export function Card({ title, sub, action, children, className = "" }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header>
          {title && <span className="h">{title}</span>}
          {sub && <span className="sub">{sub}</span>}
          {action && (
            <>
              <span className="spacer" />
              {action}
            </>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

export function Cap({ children }) {
  return <div className="cap">{children}</div>;
}

/** Holat belgisi: nuqta + matn. */
export function State({ kind = "grey", children }) {
  return (
    <span className={`state ${kind}`}>
      <i />
      {children}
    </span>
  );
}

export function Tag({ kind = "", children }) {
  return <span className={`tag ${kind}`}>{children}</span>;
}

export function Dot({ kind = "ok" }) {
  return <span className={`dot ${kind}`} aria-hidden="true" />;
}

/** Chiziqli o'lchagich; rang darajaga qarab tanlanadi. */
export function Bar({ percent, color, className = "" }) {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return (
    <div className={`bar ${className}`}>
      <span style={{ width: `${value}%`, background: color }} />
    </div>
  );
}

/** O'lchagich + ostida qiymat — jadval katakchasida. */
export function BarCell({ percent, label, color }) {
  return (
    <div className="stack2">
      <Bar percent={percent} color={color} />
      <span className="lab">{label}</span>
    </div>
  );
}

export function Empty({ title, children = "Ma'lumot yo'q." }) {
  return (
    <div className="empty">
      {title && <b>{title}</b>}
      <span>{children}</span>
    </div>
  );
}

export function Note({ kind = "", children, action }) {
  return (
    <div className={`note ${kind}`}>
      <span className="grow">{children}</span>
      {action}
    </div>
  );
}

/** Nom + qiymat juftliklari. */
export function Kv({ rows }) {
  return (
    <div className="kv">
      {rows.map(([key, value]) => (
        <div key={key}>
          <span>{key}</span>
          <b>{value}</b>
        </div>
      ))}
    </div>
  );
}

/**
 * Grid jadval. Ustun kengligi har ekranda o'ziga xos, shuning uchun
 * `cols` — CSS grid-template-columns qiymati.
 */
export function Rows({ cols, head, children }) {
  return (
    <div className="rows">
      {head && (
        <div className="head" style={{ gridTemplateColumns: cols }}>
          {head.map((h, i) => (
            <div key={i} className={typeof h === "object" && h?.right ? "right" : ""}>
              {typeof h === "object" ? h.label : h}
            </div>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

export function Row({ cols, onClick, active, children, title }) {
  const cls = `r${onClick ? " click" : ""}${active ? " on" : ""}`;
  if (onClick) {
    return (
      <button className={cls} style={{ gridTemplateColumns: cols }}
              onClick={onClick} title={title}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={{ gridTemplateColumns: cols }} title={title}>
      {children}
    </div>
  );
}

/** Ikki qatorli katak: asosiy nom va ostidagi mayda izoh. */
export function Two({ top, bottom }) {
  return (
    <div className="two">
      <span className="t1 ellipsis">{top}</span>
      {bottom && <span className="t2 ellipsis">{bottom}</span>}
    </div>
  );
}

/** Yuklanish darajasiga qarab rang — ma'no tashiydi, bezak emas. */
export function loadTone(percent) {
  if (percent >= 90) return "var(--err)";
  if (percent >= 75) return "var(--warn)";
  return "var(--ok)";
}

export function loadKind(percent) {
  if (percent >= 90) return "err";
  if (percent >= 75) return "warn";
  return "ok";
}
