// Overlap scan: for each page, state and width, scroll through the page and at each viewport
// collect the client rects of every visible text node. Fails on (a) two text nodes whose rects
// intersect, (b) text drawn under a fixed/sticky bar whose background is not opaque, and
// (c) horizontal overflow wider than the viewport.
export const WIDTHS = [[1440, 900], [768, 1024], [390, 844]]
export const STATES = [
  { page: 'quote-cap', name: 'initial' },
  { page: 'quote-cap', name: 'pressed', click: 'Let the agent pay this quote' },
  { page: 'delivery-cut', name: 'initial' },
  { page: 'delivery-cut', name: 'signed', click: 'Sign the cut' },
]

function scan() {
  const out = { collisions: [], underBar: [], overflow: document.documentElement.scrollWidth - innerWidth }
  const vis = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none' || s.opacity === '0') return false } return true }
  const bars = [...document.querySelectorAll('body *')].filter((e) => { const p = getComputedStyle(e).position; return (p === 'fixed' || p === 'sticky') && e.getBoundingClientRect().height > 0 && vis(e) })
  const inBar = (n) => bars.find((b) => b.contains(n.parentElement))
  const opaque = (b) => { const c = getComputedStyle(b).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const a = m[1].split(',').map(Number); return a.length < 4 || a[3] >= 0.98 }
  const nodes = []
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (!n.textContent.trim() || !vis(n.parentElement)) continue
    const r = document.createRange(); r.selectNodeContents(n)
    for (const q of r.getClientRects()) if (q.width > 1 && q.height > 1 && q.bottom > 0 && q.top < innerHeight) nodes.push({ n, q, t: n.textContent.trim().slice(0, 40), bar: inBar(n) })
  }
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const A = nodes[i], B = nodes[j]
    if (A.n === B.n || !hit(A.q, B.q)) continue
    if (A.bar !== B.bar) { const bar = A.bar || B.bar; if (opaque(bar)) continue; out.underBar.push(`${A.t} | ${B.t}`); continue }
    out.collisions.push(`${A.t} | ${B.t}`)
  }
  return out
}

export async function runOverlap(browser, base, shotDir) {
  const problems = []
  for (const [w, h] of WIDTHS) for (const s of STATES) {
    const p = await browser.newPage({ viewport: { width: w, height: h } })
    await p.goto(`${base}/#/${s.page}`, { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
    if (s.click) { await p.getByRole('button', { name: s.click }).filter({ visible: true }).first().click(); await p.waitForTimeout(400) }
    const total = await p.evaluate(() => document.documentElement.scrollHeight)
    for (let y = 0, k = 0; y < total; y += Math.round(h * 0.8), k++) {
      await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(120)
      const r = await p.evaluate(scan)
      const tag = `${s.page}/${s.name}@${w} y=${y}`
      for (const c of new Set(r.collisions)) problems.push(`${tag} text collision: ${c}`)
      for (const c of new Set(r.underBar)) problems.push(`${tag} text under translucent sticky bar: ${c}`)
      if (r.overflow > 1 && k === 0) problems.push(`${tag} horizontal overflow ${r.overflow}px`)
      if (shotDir) await p.screenshot({ path: `${shotDir}/${s.page}-${s.name}-${w}-${String(k).padStart(2, '0')}.png` })
    }
    await p.close()
  }
  return problems
}
