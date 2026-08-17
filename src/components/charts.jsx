// Lightweight dependency-free SVG charts
const PALETTE = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b', '#84cc16', '#06b6d4']

export function palette(i) {
  return PALETTE[i % PALETTE.length]
}

// Horizontal bar list chart with labels + values
export function BarChart({ data = [], height = 220, color, format }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex flex-col gap-2.5" style={{ minHeight: height }}>
      {data.length === 0 && <p className="py-10 text-center text-xs text-slate-400">No data</p>}
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-right text-xs text-slate-600" title={d.label}>{d.label}</span>
          <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
            <div
              className="flex h-full items-center rounded px-1.5 text-[10px] font-bold text-white transition-all"
              style={{ width: `${Math.max(6, (d.value / max) * 100)}%`, backgroundColor: color || palette(i) }}
            >
              {d.value > 0 && format ? format(d.value) : d.value > 0 ? d.value : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// Vertical column chart (e.g., issues by month)
export function ColumnChart({ data = [], height = 200 }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-700">{d.value}</span>
          <div className="flex w-full max-w-12 items-end rounded-t" style={{ height: height - 48 }}>
            <div
              className="w-full rounded-t bg-gradient-to-t from-indigo-600 to-indigo-400 transition-all"
              style={{ height: `${Math.max(4, (d.value / max) * (height - 48))}px` }}
            />
          </div>
          <span className="text-[10px] font-medium text-slate-500">{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// Donut chart with legend
export function DonutChart({ data = [], size = 150, thickness = 26 }) {
  const total = Math.max(1, data.reduce((a, d) => a + d.value, 0))
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={thickness} />
        {data.filter((d) => d.value > 0).map((d, i) => {
          const len = (d.value / total) * c
          const el = (
            <circle
              key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={palette(i)} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              className="transition-all"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          )
          offset += len
          return el
        })}
      </svg>
      <div className="flex min-w-36 flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: palette(i) }} />
            <span className="flex-1 truncate text-slate-600">{d.label}</span>
            <span className="font-semibold text-slate-800">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
