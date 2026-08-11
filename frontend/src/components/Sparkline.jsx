import { useEffect, useRef } from "react";

/**
 * Kichik chiziqli grafik — oxirgi bir necha daqiqa dinamikasi.
 * Tashqi kutubxonasiz: CSP `script-src 'self'` bilan cheklangan.
 */
export default function Sparkline({ data, color, height = 56, max, format }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);

    const values = data || [];
    if (values.length < 2) return;
    const top = max ?? Math.max(...values, 1);
    const pad = 4;
    const x = (i) => (w * i) / (values.length - 1);
    const y = (v) => height - pad - ((v / top) * (height - pad * 2));

    ctx.beginPath();
    ctx.moveTo(0, height);
    values.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(w, height);
    ctx.closePath();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    values.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = "round";
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x(values.length - 1), y(values.at(-1)), 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, [data, color, height, max]);

  return <canvas className="chart" ref={ref} height={height} />;
}
