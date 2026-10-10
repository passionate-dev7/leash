// refshot-pw.cjs URL OUT.png W H [--full]
// Playwright port of ui-craft scripts/refshot.py (bhn deepsurge capture hung on this Mac, 2026-10-10).
// Same refusals: error/challenge text and blank frames (luma stddev < 6) exit 2 and write nothing.
// Same TOKENS_JS, written to OUT.tokens.json.
const { chromium } = require(process.env.HOME + '/pwcap/node_modules/playwright')
const fs = require('fs')
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const BAD = ["can't be reached", "err_", "access denied", "just a moment", "verify you are human",
            "attention required", "page not found", "404", "enable javascript", "cf-browser-verification", "dns_probe", "this site can't", "took too long to respond", "err_name_not_resolved"]
const TOKENS_JS = `
(() => {
  const pick = (el) => { if (!el) return null; const s = getComputedStyle(el); return {
    text: (el.innerText || el.value || '').trim().slice(0, 60), font: s.fontFamily, size: s.fontSize,
    weight: s.fontWeight, tracking: s.letterSpacing, leading: s.lineHeight, color: s.color,
    bg: s.backgroundColor, radius: s.borderRadius, padding: s.padding, border: s.border,
    transform: s.textTransform, features: s.fontFeatureSettings }; };
  const q = (sel) => pick([...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && (e.innerText || '').trim()));
  const fonts = new Set(); document.fonts.forEach(f => { if (f.status === 'loaded') fonts.add(f.family.replace(/"/g, '')); });
  return { title: document.title, h1: q('h1'), h2: q('h2'), h3: q('h3'), body: pick(document.body),
    p: q('p'), a: q('a'), button: q('button, [role=button], a[class*=button], a[class*=btn]'),
    input: pick(document.querySelector('input')), loadedFonts: [...fonts],
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyText: (document.body.innerText || '').slice(0, 400), textLen: (document.body.innerText || '').length,
    height: document.documentElement.scrollHeight };
})()
`
;(async () => {
  const [url, out, W = '1440', H = '900'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const full = process.argv.includes('--full')
  const b = await chromium.launch({ executablePath: EXE })
  const ctx = await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1, isMobile: +W < 500, userAgent: +W < 500 ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' : undefined })
  const p = await ctx.newPage()
  let status = 0
  try { const r = await p.goto(url, { waitUntil: 'load', timeout: 45000 }); status = r ? r.status() : 0 } catch (e) { console.log('REFUSE load', e.message.slice(0, 120)); process.exit(2) }
  await p.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
  await p.evaluate(() => document.fonts.ready).catch(() => {})
  await p.waitForTimeout(1500)
  const t = await p.evaluate(TOKENS_JS)
  const low = (t.title + ' ' + t.bodyText).toLowerCase()
  const hit = BAD.find((s) => low.includes(s))
  if (status >= 400 || hit || t.textLen < 80) { console.log('REFUSE', status, hit || 'short text'); await b.close(); process.exit(2) }
  const buf = await p.screenshot({ fullPage: full })
  // blank check: sample luma stddev
  const px = await p.evaluate(async (b64) => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 64, 64); const d = x.getImageData(0, 0, 64, 64).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; s += l; s2 += l * l; n++ } const m = s / n; return Math.sqrt(s2 / n - m * m) }, buf.toString('base64'))
  if (px < 6) { console.log('REFUSE blank', px.toFixed(2)); await b.close(); process.exit(2) }
  fs.writeFileSync(out, buf)
  fs.writeFileSync(out.replace(/\.png$/, '.tokens.json'), JSON.stringify({ url, status, viewport: [+W, +H], lumaStd: +px.toFixed(2), ...t }, null, 1))
  console.log('ok', out, status, 'luma', px.toFixed(1))
  await b.close()
})()
