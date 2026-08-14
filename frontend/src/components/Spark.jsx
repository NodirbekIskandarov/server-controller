/**
 * SVG grafiklar.
 *
 * Nega SVG, canvas emas: ranglar CSS o'zgaruvchilaridan olinadi, ya'ni
 * mavzu almashganda grafik o'zi to'g'ri rangga o'tadi — qayta chizish
 * kerak emas. Tashqi kutubxona ham yo'q (CSP `script-src 'self'`).
 */

const W = 300;

function points(values, height, max) {
  if (!values || values.length < 2) return "";
  const top = max ?? Math.max(...values, 1);
  const pad = 2;
  return values
    .map((v, i) => {
      const x = (W * i) / (values.length - 1);
      const y = height - pad - (Math.max(0, v) / top) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Kichik chiziq — o'lchov kartasi ichida. */
export function Spark({ data, color = "var(--ok)", fill, height = 42, max }) {
  const line = points(data, height, max);
  if (!line) return <svg className="spark" style={{ height }} />;
  const area = `0,${height} ${line} ${W},${height}`;
  return (
    <svg
      className="spark"
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      {fill && <polygon points={area} fill={fill} />}
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" />
    </svg>
  );
}

/**
 * Katta grafik — bir nechta seriya bitta o'lchovda.
 *
 * Har bir seriya o'z eng katta qiymatiga nisbatan chiziladi (`ownMax`),
 * chunki CPU foizi bilan tarmoq tezligini bitta o'lchovga solishtirib
 * bo'lmaydi — maqsad shakli, mutlaq qiymati emas.
 */
export function BigChart({ series, height = 190, grid = 3, ownMax = true }) {
  const globalMax = Math.max(
    1, ...series.flatMap((s) => s.data || []).map((v) => Math.max(0, v))
  );
  const lines = [];
  for (let i = 1; i <= grid; i++) {
    lines.push((height * i) / (grid + 1));
  }

  return (
    <svg
      className="bigchart"
      viewBox={`0 0 1000 ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      aria-hidden="true"
    >
      {lines.map((y) => (
        <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke="var(--line)" />
      ))}
      {series.map((s) => {
        const max = ownMax ? Math.max(1, ...(s.data || []).map(Math.abs)) : globalMax;
        const raw = points(s.data, height, max);
        if (!raw) return null;
        // 300 kenglikda hisoblangan nuqtalarni 1000 ga cho'zamiz.
        const scaled = raw
          .split(" ")
          .map((p) => {
            const [x, y] = p.split(",");
            return `${((Number(x) / W) * 1000).toFixed(1)},${y}`;
          })
          .join(" ");
        return (
          <g key={s.label}>
            {s.fill && (
              <polygon points={`0,${height} ${scaled} 1000,${height}`} fill={s.fill} />
            )}
            <polyline
              points={scaled}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width || 1.8}
              strokeDasharray={s.dashed ? "3 3" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Kichik trend chizig'i — jadval qatorida. */
export function Trend({ data, color = "var(--ok)", width = 88, height = 22 }) {
  const line = points(data, height);
  if (!line) return <span style={{ width, height, display: "block" }} />;
  const scaled = line
    .split(" ")
    .map((p) => {
      const [x, y] = p.split(",");
      return `${((Number(x) / W) * width).toFixed(1)},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      style={{ width, height, display: "block" }}
      aria-hidden="true"
    >
      <polyline points={scaled} fill="none" stroke={color} strokeWidth="1.4" />
    </svg>
  );
}
