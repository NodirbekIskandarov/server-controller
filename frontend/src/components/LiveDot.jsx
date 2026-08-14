import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

/**
 * Jonli ulanish ko'rsatkichi.
 *
 * Nega kerak: o'lchov har 2 soniyada keladi, lekin raqamlar jimgina
 * o'zgargani uchun ma'lumot yangimi yoki ekran qotib qolganmi — bilib
 * bo'lmaydi. Bu belgi yoshni HAR SONIYA sanab turadi, shuning uchun
 * oqim to'xtasa raqam o'sib ketadi va darhol ko'zga tashlanadi.
 */
export default function LiveDot() {
  const { connected, receivedAt } = useSelector((s) => s.live);
  const [, force] = useState(0);

  // Har soniya qayta chizamiz — "3s oldin" degan raqam o'sib borsin.
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const age = receivedAt ? Math.round((Date.now() - receivedAt) / 1000) : null;

  // O'lchov 2 soniyada bir keladi. 8 soniyadan oshsa — nimadir noto'g'ri.
  let state = "live";
  if (!connected) state = "off";
  else if (age === null) state = "wait";
  else if (age > 20) state = "off";
  else if (age > 8) state = "slow";

  const text = {
    live: age === null ? "jonli" : `jonli · ${age}s`,
    slow: `kechikmoqda · ${age}s`,
    off: "uzildi",
    wait: "kutilmoqda…",
  }[state];

  const title = {
    live: "Ma'lumot real vaqtda kelmoqda",
    slow: "Oxirgi o'lchovdan beri odatdagidan ko'proq vaqt o'tdi",
    off: "Jonli ulanish yo'q — ko'rsatilgan ma'lumot eski",
    wait: "Birinchi o'lchov kutilmoqda",
  }[state];

  return (
    <span className={`live-dot ${state}`} title={title}>
      <i />
      {text}
    </span>
  );
}
