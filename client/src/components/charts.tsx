/**
 * Small, dependency-free charts for the admin dashboard.
 *
 * Conventions: one series per chart (so no legend — the title names it), a
 * single validated mark colour (--chart-1, ≥3:1 on the light surface), thin
 * marks with rounded data-ends anchored to the baseline, recessive grid, text
 * in text tokens (never the series colour), a hover tooltip on every mark, and
 * a table view for screen readers and exact values.
 */
import { useState, type ReactNode } from "react";
import { cx } from "./ui";

const MARK = "var(--chart-1)";

function Tooltip({ x, y, children }: { x: number | string; y: number; children: ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap text-popover-foreground shadow-md"
      style={{ left: x, top: y - 8 }}
      role="status"
    >
      {children}
    </div>
  );
}

function TableView({ caption, rows }: { caption: string; rows: [string, string | number][] }) {
  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none hover:text-foreground">View as table</summary>
      <table className="mt-2 w-full text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1 pr-4">{k}</td>
              <td className="py-1 text-right font-medium text-foreground tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Column chart (change over time)
// ---------------------------------------------------------------------------

interface ColumnDatum {
  label: string;
  /** Short axis label, e.g. "12 Oct". */
  tick: string;
  value: number;
}

export function ColumnChart({ data, caption, unit = "tickets", height = 180 }: { data: ColumnDatum[]; caption: string; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 600;
  const pad = { top: 8, right: 4, bottom: 22, left: 28 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...data.map((d) => d.value));
  const niceMax = Math.max(2, Math.ceil(max / 2) * 2);
  const ticks = [0, niceMax / 2, niceMax];
  const slot = innerW / data.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between columns
  const y = (v: number) => pad.top + innerH - (v / niceMax) * innerH;
  const tickEvery = Math.ceil(data.length / 6);

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label={caption}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} />
            <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * slot + 1;
          const h = (d.value / niceMax) * innerH;
          const r = Math.min(4, barW / 2, h);
          const top = pad.top + innerH - h;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${d.label}: ${d.value} ${unit}`}>
              {/* Hit target: full column height, wider than the mark. */}
              <rect x={pad.left + i * slot} y={pad.top} width={slot} height={innerH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`}
                  fill={MARK}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
              {i % tickEvery === 0 && (
                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                  {d.tick}
                </text>
              )}
            </g>
          );
        })}
        <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
      </svg>
      {hover !== null && data[hover] && (
        <Tooltip x={`${((pad.left + hover * slot + slot / 2) / width) * 100}%`} y={0}>
          <span className="font-medium">{data[hover].value}</span> {unit} · {data[hover].label}
        </Tooltip>
      )}
      <TableView caption={caption} rows={data.map((d) => [d.label, d.value])} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar list (magnitude by category)
// ---------------------------------------------------------------------------

export function BarList({ data, caption, format = String }: { data: { label: string; value: number }[]; caption: string; format?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div>
      <ul className="space-y-2.5" aria-label={caption}>
        {data.map((d) => (
          <li
            key={d.label}
            className="group"
            onMouseEnter={() => setHover(d.label)}
            onMouseLeave={() => setHover(null)}
            title={`${d.label}: ${format(d.value)}`}
          >
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className={cx("truncate", hover === d.label ? "text-foreground" : "text-muted-foreground")}>{d.label}</span>
              <span className="font-medium text-foreground tabular-nums">{format(d.value)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-opacity"
                style={{ width: `${(d.value / max) * 100}%`, background: MARK, opacity: hover && hover !== d.label ? 0.45 : 1, minWidth: d.value ? 4 : 0 }}
              />
            </div>
          </li>
        ))}
      </ul>
      <TableView caption={caption} rows={data.map((d) => [d.label, format(d.value)])} />
    </div>
  );
}
