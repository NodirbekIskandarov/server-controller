import { useCallback, useState } from "react";

/**
 * Tasdiqlash → bajarish → natija zanjiri.
 *
 * Uch sahifada bir xil holat kerak bo'ladi (xizmatlar, konteynerlar,
 * xavfsizlik) va uni har birida qayta yozish — uch xil nozik xatolik
 * degani: biri `busy` ni tiklamaydi, ikkinchisi xatoni ko'rsatmaydi.
 *
 * Muhim nozik joy: server 200 qaytarsa ham amal muvaffaqiyatsiz bo'lishi
 * mumkin — `systemctl` ishga tushdi, lekin xizmat ko'tarilmadi. Shuning
 * uchun HTTP holati emas, javobdagi `ok` tekshiriladi.
 */
export function useAction() {
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  /**
   * @param spec {{ title, what, consequence?, command?, danger?,
   *                confirmLabel?, run: () => Promise }}
   */
  const ask = useCallback((spec) => {
    setError("");
    setResult(null);
    setPending(spec);
  }, []);

  const cancel = useCallback(() => {
    setPending(null);
    setError("");
  }, []);

  const run = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      const res = await pending.run();
      if (res && res.ok === false) {
        setError(res.error || "Buyruq xato bilan tugadi.");
        return;
      }
      setResult({
        ok: true,
        text: `${pending.title} — bajarildi.`,
        output: res?.output || "",
      });
      setPending(null);
    } catch (err) {
      // Chegaraga urilgan amal 403 bilan qaytadi va xabarda AYNAN nega
      // taqiqlangani yozilgan — uni yo'qotmaymiz.
      setError(
        err?.data?.message ||
          err?.message ||
          err?.error ||
          "Amalni bajarib bo'lmadi.",
      );
    } finally {
      setBusy(false);
    }
  }, [pending]);

  const props = {
    open: Boolean(pending),
    title: pending?.title || "",
    what: pending?.what || "",
    consequence: pending?.consequence || "",
    command: pending?.command || "",
    danger: pending?.danger !== false,
    confirmLabel: pending?.confirmLabel || "Bajarish",
    busy,
    error,
    onConfirm: run,
    onCancel: () => !busy && cancel(),
  };

  return { ask, props, result, clearResult: () => setResult(null) };
}
