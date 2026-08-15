import { useEffect, useRef } from "react";

/**
 * Xavfli amal uchun tasdiqlash oynasi.
 *
 * Nega `window.confirm` emas: brauzer oynasi faqat bitta qator matn
 * ko'rsatadi va uni formatlab bo'lmaydi. Bu yerdagi eng muhim narsa esa
 * aynan matn — «Ishonchingiz komilmi?» emas, «tanga.service to'xtatiladi,
 * Mini App ishlamay qoladi». Foydalanuvchi OQIBATni ko'rmasa,
 * tasdiqlash oynasi shunchaki ortiqcha bosish bo'lib qoladi.
 *
 * Fokus oyna ochilganda BEKOR QILISH tugmasiga o'tadi: Enter tasodifan
 * bosilsa xavfli emas, xavfsiz tomonga ishlaydi.
 */
export default function Confirm({
  open,
  title,
  what,
  consequence,
  command,
  danger = true,
  confirmLabel = "Bajarish",
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-wrap" onMouseDown={() => !busy && onCancel()}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        // Oyna ichidagi bosish uni yopmasligi kerak.
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <span className={`dot ${danger ? "err" : "warn"}`} style={{ animation: "none" }} />
          <span className="h">{title}</span>
        </div>

        <div className="modal-body">
          <p className="what">{what}</p>
          {consequence && (
            <div className={`note ${danger ? "err" : "warn"}`}>
              <span className="grow">{consequence}</span>
            </div>
          )}
          {command && <span className="pre">{command}</span>}
          {error && (
            <div className="note err">
              <span className="grow">{error}</span>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" ref={cancelRef} disabled={busy} onClick={onCancel}>
            Bekor qilish
          </button>
          <button
            className={`btn ${danger ? "err" : "pri"}`}
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "Bajarilmoqda…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
