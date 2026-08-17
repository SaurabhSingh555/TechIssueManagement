// Client-side CSV export helper (used by Reports; the FastAPI backend also
// offers server-side CSV endpoints at /api/reports/{type}/export)

export function toCSV(columns, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n')
  return '\uFEFF' + header + '\n' + body
}

export function downloadCSV(filename, columns, rows) {
  const csv = toCSV(columns, rows)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
