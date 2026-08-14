import { useCallback, useEffect, useState } from "react";

/**
 * Qorong'i/yorug' rejim.
 *
 * Qorong'i — standart: kuzatuv paneli soatlab ochiq turadi va grafiklar
 * qora fonda aniqroq ko'rinadi. Tanlov `localStorage` da qoladi.
 */
const KEY = "sc.theme";

function initial() {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" ? saved : "dark";
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  // Brauzerning o'z elementlari ham to'g'ri rangda chiqsin.
  document.documentElement.style.colorScheme = theme;
}

// React chizishdan oldin ishga tushadi — oq lipillash bo'lmaydi.
apply(initial());

export function useTheme() {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );

  return [theme, toggle];
}
