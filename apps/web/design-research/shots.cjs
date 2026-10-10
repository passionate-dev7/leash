// shots.cjs BASE OUTPREFIX : viewport shots (not full page) + full-page shots of quote-cap and delivery-cut, with the primary action pressed.
const { chromium } = require(process.env.HOME + '/pwcap/node_modules/playwright')
const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell'
const [base, out] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch({ executablePath: EXE })
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
    await p.goto(base + '/#/quote-cap', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    await p.screenshot({ path: `${out}-${w}.png` })
    await p.screenshot({ path: `${out}-qc-full-${w}.png`, fullPage: true })
    await p.getByRole('button', { name: /Let the agent pay/ }).click(); await p.waitForTimeout(300)
    await p.screenshot({ path: `${out}-qc-pressed-${w}.png`, fullPage: true })
    await p.goto(base + '/#/delivery-cut', { waitUntil: 'networkidle' }); await p.waitForTimeout(800)
    await p.screenshot({ path: `${out}-dc-full-${w}.png`, fullPage: true })
    const small = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).map(e => e.textContent.trim().slice(0, 30)))
    console.log(w, 'sub-12px text nodes on delivery-cut:', small.length)
    await p.goto(base + '/#/quote-cap', { waitUntil: 'networkidle' }); await p.waitForTimeout(500)
    const s2 = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12).length)
    const mono = await p.evaluate(() => [...document.querySelectorAll('body *')].filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && /Mono/.test(getComputedStyle(e).fontFamily)).map(e => e.textContent.trim().slice(0, 24)))
    console.log(w, 'sub-12px on quote-cap:', s2, '| mono text:', JSON.stringify(mono))
    await p.close()
  }
  await b.close()
})()
