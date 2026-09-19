/**
 * The demo page renders a live stream of real chain events. It has no data of its own: every
 * number, hash, revert name and timestamp arrives over SSE from a run that is happening while
 * the page is open. If the server is not running, this page shows nothing, which is the
 * correct behaviour for a demo whose whole claim is that it is not a mock.
 */

const $ = (s, r = document) => r.querySelector(s)

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') n.className = v
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v)
    else n.setAttribute(k, String(v))
  }
  for (const c of kids.flat()) {
    if (c === undefined || c === null || c === false) continue
    n.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return n
}

const svgEl = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v))
  for (const c of kids.flat()) if (c) n.append(c.nodeType ? c : document.createTextNode(String(c)))
  return n
}

const short = (a) => (a && a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : (a ?? ''))
const tstamp = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '')

function units(value, decimals) {
  if (value === undefined || value === null) return '—'
  const s = String(value)
  const neg = s.startsWith('-')
  const digits = (neg ? s.slice(1) : s).padStart(decimals + 1, '0')
  return `${neg ? '−' : ''}${digits.slice(0, digits.length - decimals)}.${digits.slice(digits.length - decimals)}`
}

const tape = () => $('#tape')
const push = (node) => {
  tape().append(node)
  node.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const cards = new Map()
let stepOrder = []
let stepIndex = -1
let currentStep = null
let network = null

// --------------------------------------------------------------- hud

function setSteps(steps) {
  stepOrder = steps.map((s) => s.id)
  $('#steps').replaceChildren(
    ...steps.map((s) => el('div', { class: 'step-pip', 'data-step': s.id }, el('i'), s.title)),
  )
}

function markStep(id) {
  stepIndex = stepOrder.indexOf(id)
  currentStep = id
  for (const pip of document.querySelectorAll('.step-pip')) {
    const i = stepOrder.indexOf(pip.dataset.step)
    pip.classList.toggle('active', i === stepIndex)
    pip.classList.toggle('past', i < stepIndex)
  }
}

function setGauge(e) {
  const box = $('#gauge')
  box.hidden = false
  const remaining = Number(e.remaining)
  const cap = Number(e.cap)
  const pct = cap > 0 ? Math.max(0, Math.min(100, (remaining / cap) * 100)) : 0
  $('#gaugeValue').textContent = units(e.remaining, e.decimals)
  $('#gaugeUnit').textContent = e.symbol
  const fill = $('#gaugeFill')
  fill.style.width = `${pct}%`
  const bar = fill.parentElement
  bar.classList.toggle('low', pct > 0 && pct < 40)
  bar.classList.toggle('empty', pct === 0)
  $('#gaugeProv').textContent = `${e.source.split(' @ ')[0]} · block ${e.blockNumber} · ${tstamp(e.readAt)}`
}

// ---------------------------------------------------------- blast fan

function blastFan(e) {
  const rows = [
    ...e.intended.map((s) => ({ ...s, named: true })),
    ...e.collateral.map((s) => ({ ...s, named: false })),
  ]
  const rowH = 23
  const top = 16
  const height = Math.max(120, top * 2 + rows.length * rowH)
  const hubX = 210
  const labX = 280
  const hubY = height / 2
  const node = svgEl('svg', {
    class: 'blast-fan',
    viewBox: `0 0 860 ${height}`,
    height,
    preserveAspectRatio: 'xMinYMin meet',
    role: 'img',
    'aria-label': `${e.recipient} pays ${rows.length} catalog services`,
  })
  node.append(
    svgEl('text', { x: hubX - 18, y: hubY - 3, 'text-anchor': 'end', class: 'sub-t', 'font-size': '11.5' }, short(e.recipient)),
    svgEl('text', { x: hubX - 18, y: hubY + 12, 'text-anchor': 'end', class: 'sub-t' }, 'one payout address'),
    svgEl('circle', { class: 'hub', cx: hubX, cy: hubY, r: 6 }),
  )
  rows.forEach((row, i) => {
    const y = top + i * rowH + rowH / 2
    node.append(
      svgEl('path', {
        class: `edge ${row.named ? 'named' : 'unnamed'}`,
        d: `M ${hubX + 7} ${hubY} C ${hubX + 40} ${hubY}, ${labX - 40} ${y}, ${labX - 7} ${y}`,
      }),
      svgEl('circle', { cx: labX - 7, cy: y, r: 2.2, fill: row.named ? '#55555f' : '#ffab2d' }),
      svgEl('text', { x: labX, y: y + 4, class: row.named ? 'named-t' : 'unnamed-t' }, row.serviceId),
      svgEl('text', { x: labX + 150, y: y + 4, class: 'sub-t' }, row.realm ?? ''),
      svgEl(
        'text',
        { x: labX + 330, y: y + 4, class: 'sub-t', fill: row.named ? '#55555f' : '#ffab2d' },
        row.named ? 'named in the policy' : 'NOT named in the policy',
      ),
    )
  })
  return node
}

// ------------------------------------------------------------ render

const handlers = {
  start(e) {
    network = e.network
    setSteps(e.steps)
    $('#chain').innerHTML = `${network.name} · chain ${network.chainId}<br>operator ${short(network.operator)}`
    push(
      el(
        'div',
        { class: 'aside' },
        network.settlementNote,
      ),
    )
  },

  step(e) {
    markStep(e.id)
    push(
      el(
        'div',
        { class: 'divider' },
        el('span', { class: 'n' }, String(stepOrder.indexOf(e.id) + 1).padStart(2, '0')),
        el('h2', {}, e.title),
        el('span', {}, e.line),
      ),
    )
  },

  fact(e) {
    const last = tape().lastElementChild
    const row = el(
      'div',
      {},
      el('span', { class: 'k' }, e.label),
      e.value,
      e.source ? el('div', { class: 'src' }, `${e.source}${e.at ? ` · ${tstamp(e.at)}` : ''}`) : null,
    )
    if (last && last.classList.contains('facts')) last.append(row)
    else push(el('div', { class: 'facts' }, row))
  },

  services(e) {
    push(
      el(
        'table',
        { class: 'svc' },
        el('thead', {}, el('tr', {}, ['service', 'payout address', 'price', 'intent', 'resolved'].map((h) => el('th', {}, h)))),
        el(
          'tbody',
          {},
          e.services.map((s) =>
            el(
              'tr',
              {},
              el('td', {}, s.serviceId, el('div', { class: 'two' }, s.realm ?? '')),
              el('td', {}, s.recipient, el('div', { class: 'two' }, s.endpoint)),
              el('td', {}, units(s.amount, s.decimals), el('div', { class: 'two' }, `per ${s.unitType ?? 'call'}`)),
              el('td', {}, s.intent),
              el('td', {}, el('span', { class: 'badge402' }, 'HTTP 402'), el('div', { class: 'two' }, tstamp(s.resolvedAt))),
            ),
          ),
        ),
      ),
    )
  },

  blast(e) {
    const panel = el(
      'div',
      { class: 'blastpanel' },
      el(
        'div',
        { class: 'blast-top' },
        el('div', { class: 'blast-n' }, String(e.collateral.length)),
        el(
          'div',
          { class: 'blast-copy' },
          el('strong', {}, `services this key can pay that nobody asked for`),
          el('p', {}, e.headline),
          el(
            'p',
            {},
            'The policy names two. The allowlist holds one address, and that address is the payout for sixteen. The consensus rule is doing exactly what it was told; it was told the wrong thing. No existing tool shows an operator this before they sign.',
          ),
        ),
      ),
      blastFan(e),
      e.advice ? el('div', { class: 'blast-advice' }, e.advice) : null,
      el('div', { class: 'card-detail' }, `evaluated against the MPP catalog capture of ${tstamp(e.capturedAt)}; the named services' payout addresses were re-resolved from live 402 challenges moments ago`),
    )
    push(panel)
  },

  policy(e) {
    push(
      el(
        'div',
        {},
        el('ul', { class: 'policy' }, ...e.lines.map((l) => el('li', {}, l))),
        el('div', { class: 'card-detail' }, `authorizeKey calldata ${e.calldataBytes} bytes, selector ${e.selector}, asserted against viem/tempo's generated ABI`),
        ...e.gaps.map((g) => el('div', { class: 'aside' }, `${g.name} (${g.kind}): ${g.detail}`)),
      ),
    )
  },

  budget(e) {
    setGauge(e)
    push(
      el(
        'div',
        { class: 'budgetline' },
        el('span', {}, 'remaining'),
        el('span', { class: 'big' }, `${units(e.remaining, e.decimals)} ${e.symbol}`),
        e.delta ? el('span', { class: 'delta' }, `−${units(e.delta, e.decimals)} this call`) : null,
        e.eventRemaining !== undefined
          ? el(
              'span',
              {},
              `last AccessKeySpend event said ${units(e.eventRemaining, e.decimals)}`,
              e.eventGap && e.eventGap !== '0' ? ` · stale by ${units(e.eventGap, e.decimals)}` : ' · agrees here, and is still not what is displayed',
            )
          : null,
        el('span', { class: 'src' }, `${e.source} · block ${e.blockNumber} · ${tstamp(e.readAt)}`),
      ),
    )
  },

  attempt(e) {
    const card = el(
      'div',
      { class: 'card pending' },
      el(
        'div',
        { class: 'card-head' },
        el('span', { class: 'verdict pending' }, 'SENDING'),
        el('span', { class: 'card-title' }, e.label),
      ),
      el('div', { class: 'card-detail' }, e.detail),
      el('div', { class: 'card-expect' }, `Expected: ${e.expected}`),
    )
    cards.set(e.id, card)
    push(card)
  },

  result(e) {
    const card = cards.get(e.id) ?? el('div', { class: 'card' })
    if (!cards.has(e.id)) {
      cards.set(e.id, card)
      card.append(
        el(
          'div',
          { class: 'card-head' },
          el('span', { class: 'verdict' }, ''),
          el('span', { class: 'card-title' }, e.label),
        ),
      )
      push(card)
    }
    card.className = `card ${e.outcome}`
    const badge = card.querySelector('.verdict')
    badge.className = `verdict ${e.outcome}`
    badge.textContent = e.outcome === 'allowed' ? 'ALLOWED BY THE CHAIN' : e.outcome === 'refused' ? 'REFUSED BY THE CHAIN' : 'REJECTED BY THE NODE'
    for (const n of card.querySelectorAll('.waiting')) n.remove()

    if (e.outcome === 'allowed') {
      card.append(
        el(
          'div',
          { class: 'txline' },
          el('span', {}, 'tx'),
          e.explorer ? el('a', { href: e.explorer, target: '_blank', rel: 'noreferrer' }, e.hash) : (e.hash ?? ''),
          e.gasUsed ? el('span', {}, 'gas') : null,
          e.gasUsed ? Number(e.gasUsed).toLocaleString() : null,
          el('span', {}, 'took'),
          `${e.elapsedMs} ms`,
          e.feePayer ? el('span', {}, 'fee payer') : null,
          e.feePayer ? short(e.feePayer) : null,
        ),
      )
    } else {
      card.append(
        el(
          'div',
          { class: 'revert' },
          el('span', { class: 'revert-name' }, e.revertName ?? 'unnamed'),
          el('span', { class: 'txline' }, `${e.elapsedMs} ms · rejectedPreExecution=${e.preExecution}`),
        ),
        el('div', { class: 'revert-msg' }, e.revertMessage ?? ''),
        el('div', { class: 'revert-raw' }, `node said: ${e.revertRaw ?? ''}`),
      )
    }
  },

  tick(e) {
    const card = cards.get(e.id)
    if (!card) return
    let w = card.querySelector('.waiting')
    if (!w) {
      w = el('div', { class: 'waiting' }, el('b', {}, '0'), ' s, ', el('span', {}, e.note))
      card.append(w)
    }
    w.querySelector('b').textContent = (e.elapsedMs / 1000).toFixed(0)
  },

  note(e) {
    push(el('div', { class: 'aside' }, e.text))
  },

  done(e) {
    markStep(null)
    for (const pip of document.querySelectorAll('.step-pip')) {
      pip.classList.remove('active')
      pip.classList.add('past')
    }
    push(
      el(
        'div',
        { class: 'finale' },
        el('h2', {}, `Done in ${(e.elapsedMs / 1000).toFixed(1)} seconds, entirely on chain`),
        el('ul', {}, ...e.verdict.map((v) => el('li', {}, v))),
        el(
          'div',
          { class: 'card-detail', style: 'margin-top:16px' },
          'Every hash above resolves on the Moderato explorer. Re-run this and the hashes change; the outcomes do not.',
        ),
      ),
    )
    $('#runBtn').disabled = false
    $('#runBtn').textContent = 'Run it again'
  },

  error(e) {
    push(el('div', { class: 'failure' }, el('h2', {}, 'The run stopped'), el('div', { class: 'revert-raw' }, e.message)))
    $('#runBtn').disabled = false
    $('#runBtn').textContent = 'Try again'
  },
}

// --------------------------------------------------------------- run

function run() {
  const btn = $('#runBtn')
  btn.disabled = true
  btn.textContent = 'Running…'
  tape().replaceChildren()
  cards.clear()
  $('#gauge').hidden = true

  const src = new EventSource('/api/run')
  for (const type of Object.keys(handlers))
    src.addEventListener(type, (ev) => {
      try {
        handlers[type](JSON.parse(ev.data))
      } catch (error) {
        console.error(type, error)
      }
    })
  src.addEventListener('error', () => {
    // The stream closes when the run finishes; only report it if nothing arrived.
    src.close()
    if (btn.disabled) {
      btn.disabled = false
      btn.textContent = 'Run it live'
      if (!tape().children.length)
        push(
          el(
            'div',
            { class: 'failure' },
            el('h2', {}, 'No stream'),
            el('div', {}, 'The demo server is not answering /api/run. Start it with pnpm demo.'),
          ),
        )
    }
  })
}

$('#runBtn').addEventListener('click', run)

fetch('/api/steps')
  .then((r) => r.json())
  .then((d) => setSteps(d.steps))
  .catch(() => {})
