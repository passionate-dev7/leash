/**
 * LEASH operator console, client side.
 *
 * Rendering rules, enforced by hand because they are the product:
 *  - Every figure prints the call that produced it and the block/time it was read at.
 *  - The blast radius is the first thing on a key's screen and the first thing on the signing
 *    screen. It is never behind a disclosure triangle.
 *  - A budget is drawn from `getRemainingLimitWithPeriod`. The event stream is shown next to
 *    it, labelled as telemetry, with the gap between them spelled out.
 */

const $ = (sel, root = document) => root.querySelector(sel)

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k === 'class') node.className = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, String(v))
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue
    node.append(c.nodeType ? c : document.createTextNode(String(c)))
  }
  return node
}

const svg = (tag, attrs = {}, ...children) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, String(v))
  for (const c of children.flat()) if (c) node.append(c.nodeType ? c : document.createTextNode(String(c)))
  return node
}

/** `replaceChildren(null)` renders the string "null". Every mount goes through this. */
const mount = (node, ...children) => node.replaceChildren(...children.flat().filter(Boolean))
const add = (node, ...children) => node.append(...children.flat().filter(Boolean))

const short = (a) => (a && a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a ?? '')
const clock = (iso) => (iso ? new Date(iso).toISOString().slice(11, 19) + 'Z' : '')
const stamp = (iso) => (iso ? new Date(iso).toISOString().replace('T', ' ').slice(0, 19) + 'Z' : '')

function units(value, decimals) {
  if (value === undefined || value === null) return '—'
  const s = String(value)
  const neg = s.startsWith('-')
  const digits = (neg ? s.slice(1) : s).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const frac = decimals ? `.${digits.slice(digits.length - decimals)}` : ''
  return `${neg ? '-' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${frac}`
}

async function api(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }))
  if (!res.ok || body.ok === false) {
    const msg = body?.error?.message ?? body?.error ?? body?.compileError ?? `HTTP ${res.status}`
    if (body?.compileError) return body
    throw new Error(msg)
  }
  return body
}

function toast(title, body, kind = '') {
  const node = el('div', { class: `toast ${kind}` }, el('div', { class: 't-title' }, title), body ? el('div', { class: 't-body' }, body) : null)
  $('#toasts').append(node)
  setTimeout(() => node.remove(), kind === 'err' ? 16000 : 9000)
}

const state = { config: null, fleet: null, selected: null, catalog: null, source: null }

// ---------------------------------------------------------------- top bar

function renderChainStatus() {
  const c = state.config
  const box = $('#chainStatus')
  box.replaceChildren(
    el(
      'span',
      { class: 'chip-net' },
      el('span', { class: 'dot' }),
      `${c.network.name} · ${c.network.chainId}`,
    ),
    el('span', {}, `block ${Number(c.network.blockNumber).toLocaleString()}`),
    el('span', {}, `operator ${short(c.operator.address)}`),
    el('span', {}, `${units(c.operator.balance, c.token.decimals)} ${c.token.symbol}`),
  )
  box.title = `Balances and block read from ${c.network.rpcUrl} at ${c.network.readAt}`
}

// ------------------------------------------------------------ blast fan

/**
 * The literal picture: one allowlisted payout address on the left, every catalog service it
 * can pay on the right. Named services are grey, the ones the operator never asked for are
 * amber. If the fan has fourteen amber lines, recipient scoping did not isolate anything.
 */
function fanSvg(entry) {
  const rows = [
    ...entry.intended.map((s) => ({ s, named: true })),
    ...entry.collateral.map((s) => ({ s, named: false })),
  ]
  const rowH = 22
  const top = 18
  const height = Math.max(90, top * 2 + rows.length * rowH)
  const hubX = 200
  const labX = 264
  const hubY = height / 2

  const node = svg('svg', {
    class: 'fan',
    viewBox: `0 0 900 ${height}`,
    height,
    preserveAspectRatio: 'xMinYMin meet',
    role: 'img',
    'aria-label': `${entry.recipient} pays ${rows.length} catalog services`,
  })

  node.append(
    svg('text', { x: hubX - 16, y: hubY - 3, 'text-anchor': 'end', class: 'hub-text' }, short(entry.recipient)),
    svg(
      'text',
      { x: hubX - 16, y: hubY + 11, 'text-anchor': 'end', class: 'hub-text', fill: '#6b6b76' },
      `${rows.length} service${rows.length === 1 ? '' : 's'} · ${entry.realms.length} realm${entry.realms.length === 1 ? '' : 's'}`,
    ),
    svg('circle', { class: 'hub', cx: hubX, cy: hubY, r: 5 }),
  )

  rows.forEach((row, i) => {
    const y = top + i * rowH + rowH / 2
    add(
      node,
      svg('path', {
        class: `edge ${row.named ? 'named' : 'unnamed'}`,
        d: `M ${hubX + 6} ${hubY} C ${hubX + 34} ${hubY}, ${labX - 34} ${y}, ${labX - 6} ${y}`,
      }),
      svg('circle', {
        cx: labX - 6,
        cy: y,
        r: 2,
        fill: row.named ? '#4d4d57' : 'var(--alarm)',
      }),
      svg('text', { x: labX, y: y + 4, class: `lab ${row.named ? 'named' : 'unnamed'}` }, row.s.serviceId),
      svg(
        'text',
        { x: labX + 172, y: y + 4, class: 'lab-sub' },
        `${row.s.realm ?? '—'}   ${units(row.s.amount, row.s.decimals)} ${row.s.intent === 'session' ? 'session' : 'per ' + (row.s.unitType ?? 'call')}`,
      ),
      !row.named
        ? svg('text', { x: labX + 470, y: y + 4, class: 'lab-sub', fill: 'var(--alarm)' }, 'not named in policy')
        : null,
    )
  })
  return node
}

function blastBlock(blast, opts = {}) {
  const r = blast.radius
  const collateral = r.collateral.length
  const body = el('div', { class: 'block blast' })
  body.append(
    el(
      'div',
      { class: 'block-head' },
      el('h3', {}, opts.heading ?? 'Blast radius'),
      el('div', { class: 'spacer' }),
      el('span', { class: 'prov' }, `catalog capture ${stamp(r.indexCapturedAt)} · chain ${r.chainId}`),
    ),
    el(
      'div',
      { class: 'blast-headline' },
      el('div', { class: `blast-count ${collateral === 0 ? 'zero' : ''}` }, String(collateral)),
      el(
        'div',
        { class: 'blast-say' },
        el(
          'strong',
          {},
          collateral === 0
            ? 'Every service this key can pay was named in the policy.'
            : `${collateral} service${collateral === 1 ? '' : 's'} this key can pay that nobody asked for.`,
        ),
        el('p', {}, blast.headline),
        el(
          'p',
          {},
          `${r.reachable.length} reachable across ${r.entries.length} allowlisted address${r.entries.length === 1 ? '' : 'es'}. Recipient scoping is enforced per selector by the AccountKeychain precompile; it cannot separate two services that share a payout address.`,
        ),
      ),
    ),
  )
  for (const entry of r.entries) {
    if (entry.intended.length + entry.collateral.length === 0) {
      body.append(
        el(
          'p',
          { class: 'prov' },
          `${entry.recipient} matches no service in the catalog capture. It is allowlisted, and this console cannot tell you what it pays.`,
        ),
      )
      continue
    }
    body.append(fanSvg(entry))
  }
  if (blast.advice) body.append(el('div', { class: 'advice' }, blast.advice))
  return body
}

// ------------------------------------------------------------ fleet list

function keyRow(k) {
  const record = k.record
  const live = k.key.exists && !k.revokedOnChain
  const budget = k.limit ? Number(k.limit.remaining) : 0
  const cap = record ? Number(record.budget) : budget
  const pct = cap > 0 ? Math.max(0, Math.min(100, (budget / cap) * 100)) : 0
  const row = el(
    'button',
    {
      class: `key-row ${state.selected === k.keyId ? 'is-active' : ''}`,
      onclick: () => selectKey(k.keyId),
    },
    el(
      'div',
      { class: 'key-row-top' },
      el('span', { class: 'key-label' }, record?.agent ?? record?.label ?? 'unregistered key'),
      el('span', { class: `state ${live ? 'live' : 'revoked'}` }, live ? 'live' : 'revoked'),
    ),
    el('div', { class: 'key-id' }, k.keyId),
    el(
      'div',
      { class: 'key-row-meta' },
      el('span', {}, k.limit ? `${units(k.limit.remaining, k.token.decimals)} ${k.token.symbol}` : 'no limit read'),
      k.blast && k.blast.radius.collateral.length > 0
        ? el('span', { style: 'color:var(--alarm)' }, `+${k.blast.radius.collateral.length} unnamed`)
        : null,
      el('span', {}, `${k.spendTotals.paymentCount} pay`),
    ),
  )
  if (live && cap > 0) row.append(el('div', { class: 'minibar' }, el('i', { style: `width:${pct}%` })))
  return row
}

function renderFleet() {
  const f = state.fleet
  const list = $('#keyList')
  mount(
    list,...(f.keys.length ? f.keys.map(keyRow) : [el('p', { class: 'muted pad' }, 'No keys on this account yet. Sign a policy in "New policy".')]))
  mount(
    $('#railFoot'),
    el('div', {}, `indexer: ${f.indexer.source.name}`),
    el('div', {}, f.indexer.source.url),
    el('div', {}, `keys query ${f.indexer.keysQueryOk ? 'ok' : 'FAILED'} · spend query ${f.indexer.spendQueryOk ? 'ok' : 'FAILED'}`),
    el('div', {}, `queried ${stamp(f.indexer.queriedAt)}`),
    f.indexer.error ? el('div', { style: 'color:var(--deny)' }, f.indexer.error.slice(0, 160)) : null,
  )
}

// ----------------------------------------------------------- key detail

function budgetBlock(k) {
  const cap = k.record ? Number(k.record.budget) : null
  const remaining = k.limit ? Number(k.limit.remaining) : null
  const pct = cap && cap > 0 && remaining !== null ? Math.max(0, Math.min(100, (remaining / cap) * 100)) : 0
  const barClass = pct === 0 ? 'bar empty' : pct < 25 ? 'bar low' : 'bar'

  const block = el('div', { class: 'block' }, el('div', { class: 'block-head' }, el('h3', {}, 'Budget, enforced in consensus')))

  if (k.limitError) {
    block.append(
      el('div', { class: 'warnbox' }, el('h4', {}, 'No budget could be read'), el('p', {}, k.limitError.message), el('div', { class: 'prov' }, k.limitError.raw?.slice(0, 300) ?? '')),
    )
    return block
  }
  if (!k.limit) return block

  const periodEnd = Number(k.limit.periodEnd)
  block.append(
    el(
      'div',
      { class: 'budget-row' },
      el(
        'div',
        {},
        el(
          'div',
          { class: 'budget-figure' },
          units(k.limit.remaining, k.token.decimals),
          el('span', { class: 'budget-unit' }, k.token.symbol),
        ),
        el(
          'div',
          { class: 'budget-sub' },
          cap ? `of ${units(k.record.budget, k.token.decimals)} per ${k.record.periodSeconds / 86400} days` : 'cap unknown: this key was not signed by this console',
        ),
      ),
      el(
        'div',
        {},
        el('div', { class: 'budget-sub' }, 'period rolls'),
        el(
          'div',
          { class: 'mono' },
          periodEnd
            ? stamp(new Date(periodEnd * 1000).toISOString())
            : k.key.info.isRevoked
              ? 'zeroed by revokeKey'
              : '—',
        ),
      ),
      el(
        'div',
        {},
        el('div', { class: 'budget-sub' }, 'key expires'),
        el(
          'div',
          { class: 'mono' },
          Number(k.key.info.expiry) > 0
            ? stamp(new Date(Number(k.key.info.expiry) * 1000).toISOString())
            : k.key.info.isRevoked
              ? 'zeroed by revokeKey'
              : '—',
        ),
      ),
    ),
    el('div', { class: barClass }, el('i', { style: `width:${pct}%` })),
    el(
      'div',
      { class: 'prov', style: 'margin-top:10px' },
      el('b', {}, 'source '),
      k.limit.stamp.source,
      el('br'),
      el('b', {}, 'read at '),
      `block ${Number(k.limit.stamp.blockNumber).toLocaleString()} · ${stamp(k.limit.stamp.readAt)} · chain ${k.limit.stamp.chainId}`,
    ),
  )

  if (k.eventVsRead) {
    block.append(
      el(
        'div',
        { class: 'stale' },
        el(
          'div',
          { class: 'cols' },
          el('div', {}, el('span', {}, 'precompile read'), units(k.eventVsRead.precompileRemaining, k.token.decimals)),
          el('div', {}, el('span', {}, 'last AccessKeySpend event'), units(k.eventVsRead.eventRemainingLimit, k.token.decimals)),
          el('div', {}, el('span', {}, 'gap'), units(k.eventVsRead.gap, k.token.decimals)),
          el('div', {}, el('span', {}, 'from tx'), short(k.eventVsRead.txHash)),
        ),
        el('p', { class: 'prov', style: 'margin:8px 0 0' }, k.eventVsRead.note),
      ),
    )
  }
  return block
}

function allowlistBlock(k) {
  const rows = []
  for (const scope of k.allowed.scopes) {
    for (const rule of scope.selectorRules) {
      rows.push(
        el(
          'tr',
          {},
          el('td', { class: 'mono' }, scope.target),
          el('td', { class: 'mono' }, rule.selector),
          el('td', {}, selectorName(rule.selector)),
          el('td', { class: 'n' }, String((rule.recipients ?? []).length)),
          el('td', { class: 'wrap mono' }, (rule.recipients ?? []).join('  ') || 'none (no recipient extraction on this selector)'),
        ),
      )
    }
  }
  return el(
    'div',
    { class: 'block' },
    el(
      'div',
      { class: 'block-head' },
      el('h3', {}, 'Allowlist, as the chain holds it'),
      el('div', { class: 'spacer' }),
      el('span', { class: 'prov' }, `isScoped=${k.allowed.isScoped}`),
    ),
    rows.length
      ? el(
          'table',
          { class: 'grid' },
          el('thead', {}, el('tr', {}, ['target (token or escrow)', 'selector', 'call', 'recipients', 'allowed recipients'].map((h) => el('th', {}, h)))),
          el('tbody', {}, rows),
        )
      : el(
          'div',
          { class: 'warnbox' },
          el('h4', {}, 'Scoped deny-all'),
          el('p', {}, 'allowAnyCalls is false and the scope list is empty. This key can call nothing. That is not the same as allow-all, and it is what a revoked key reads back as.'),
        ),
    el(
      'p',
      { class: 'prov', style: 'margin-top:10px' },
      el('b', {}, 'source '),
      k.allowed.stamp.source,
      el('br'),
      `block ${Number(k.allowed.stamp.blockNumber).toLocaleString()} · ${stamp(k.allowed.stamp.readAt)}`,
    ),
  )
}

function selectorName(sel) {
  const map = {
    '0x95777d59': 'transferWithMemo',
    '0xa9059cbb': 'transfer (never allowlisted by Leash)',
    '0xedc53b00': 'tip20ChannelReserve.open',
    '0xdc48471e': 'tip20ChannelReserve.topUp',
  }
  return map[sel.toLowerCase()] ?? 'unknown selector'
}

function spendBlock(k) {
  if (!k.spend.length)
    return el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Spend history')),
      el('p', { class: 'muted' }, 'No AccessKeySpend events for this key in the indexer window.'),
    )
  const explorer = state.config.network.explorerUrl
  return el(
    'div',
    { class: 'block' },
    el(
      'div',
      { class: 'block-head' },
      el('h3', {}, 'Spend history'),
      el('div', { class: 'spacer' }),
      el(
        'span',
        { class: 'prov' },
        `AccessKeySpend via ${state.fleet.indexer.source.name} · ${stamp(state.fleet.indexer.queriedAt)} · payments ${units(k.spendTotals.payments, k.token.decimals)}, gas ${units(k.spendTotals.gas, k.token.decimals)}`,
      ),
    ),
    el(
      'table',
      { class: 'grid' },
      el('thead', {}, el('tr', {}, ['block', 'time', 'kind', 'amount', 'event remainingLimit', 'fee payer', 'gas used', 'tx'].map((h) => el('th', {}, h)))),
      el(
        'tbody',
        {},
        k.spend.map((r) =>
          el(
            'tr',
            {},
            el('td', { class: 'n' }, Number(r.blockNum).toLocaleString()),
            el('td', {}, r.blockTimestamp ? clock(new Date(Number(r.blockTimestamp) * 1000).toISOString()) : '—'),
            el('td', {}, el('span', { class: `tag ${r.kind === 'gas' ? 'gas' : 'pay'}` }, r.kind)),
            el('td', { class: 'n' }, units(r.amount, k.token.decimals)),
            el('td', { class: 'n muted' }, units(r.eventRemainingLimit, k.token.decimals)),
            el('td', {}, r.feePayer ? short(r.feePayer) : 'self'),
            el('td', { class: 'n' }, r.gasUsed ? Number(r.gasUsed).toLocaleString() : '—'),
            el('td', {}, el('a', { href: `${explorer}/tx/${r.txHash}`, target: '_blank', rel: 'noreferrer' }, short(r.txHash))),
          ),
        ),
      ),
    ),
    el(
      'p',
      { class: 'prov', style: 'margin-top:10px' },
      'A row is classified gas when the fee payer is the account itself and the same transaction carries a second AccessKeySpend. The gas pre-charge is taken at the gas limit and partly refunded after these events fire, so no remainingLimit in this table is a balance.',
    ),
    el(
      'button',
      {
        class: 'ghost',
        style: 'margin-top:10px',
        onclick: (e) => void loadFullSpend(k.keyId, e.target),
      },
      'load full history from the indexer',
    ),
  )
}

/**
 * The embedded table is the slice the fleet query already paid for. This re-queries one key
 * directly, which is a second round trip to the indexer and says so.
 */
async function loadFullSpend(keyId, button) {
  button.disabled = true
  button.textContent = 'querying…'
  try {
    const d = await api(`/api/keys/${keyId}/spend?limit=200${state.source ? `&source=${state.source}` : ''}`)
    const k = state.fleet.keys.find((x) => x.keyId === keyId)
    const dec = k?.token.decimals ?? 6
    button.replaceWith(
      el(
        'div',
        {},
        el(
          'p',
          { class: 'prov' },
          `${d.rows.length} rows from ${d.source.name} in ${Math.round(d.queryTimeMs)} ms, queried ${stamp(d.queriedAt)}. ${d.note}`,
        ),
        el(
          'table',
          { class: 'grid', style: 'margin-top:10px' },
          el('thead', {}, el('tr', {}, ['block', 'kind', 'amount', 'event remainingLimit', 'fee payer', 'tx'].map((h) => el('th', {}, h)))),
          el(
            'tbody',
            {},
            d.rows.map((r) =>
              el(
                'tr',
                {},
                el('td', { class: 'n' }, Number(r.blockNum).toLocaleString()),
                el('td', {}, el('span', { class: `tag ${r.kind === 'gas' ? 'gas' : 'pay'}` }, r.kind)),
                el('td', { class: 'n' }, units(r.amount, dec)),
                el('td', { class: 'n muted' }, units(r.eventRemainingLimit, dec)),
                el('td', {}, r.feePayer ? short(r.feePayer) : 'self'),
                el('td', {}, el('a', { href: r.explorer, target: '_blank', rel: 'noreferrer' }, short(r.txHash))),
              ),
            ),
          ),
        ),
      ),
    )
  } catch (error) {
    button.disabled = false
    button.textContent = 'retry'
    toast('Spend query failed', error.message, 'err')
  }
}

function ungovernableBlock(k) {
  if (!k.ungovernable.length) return null
  return el(
    'div',
    { class: 'block' },
    el('div', { class: 'block-head' }, el('h3', {}, 'Named, but not governable')),
    ...k.ungovernable.map((u) =>
      el('div', { class: 'warnbox', style: 'margin-bottom:10px' }, el('h4', {}, `${u.name} (${u.serviceId})`), el('p', {}, u.reason)),
    ),
  )
}

async function selectKey(keyId) {
  state.selected = keyId
  renderFleet()
  const k = state.fleet.keys.find((x) => x.keyId === keyId)
  const pane = $('#keyDetail')
  if (!k) return pane.replaceChildren(el('p', { class: 'muted pad' }, 'key not found'))

  const live = k.key.exists && !k.revokedOnChain
  const head = el(
    'div',
    { class: 'keyhead' },
    el(
      'div',
      {},
      el('h1', {}, k.record?.agent ?? k.record?.label ?? 'Unregistered agent key'),
      el('div', { class: 'addr' }, k.keyId, ' · ', el('a', { href: k.explorer, target: '_blank', rel: 'noreferrer' }, 'explorer')),
      el(
        'div',
        { class: 'prov', style: 'margin-top:6px' },
        k.record
          ? `signed ${stamp(k.record.signedAt)} · recipients resolved live ${stamp(k.record.resolvedAt)} · authorize tx ${short(k.record.authorizeTx)}`
          : 'no local policy record for this key, so every service its allowlist reaches is counted as unnamed',
      ),
    ),
    el(
      'div',
      { class: 'keyhead-actions' },
      el('span', { class: `state ${live ? 'live' : 'revoked'}` }, live ? 'live' : 'revoked'),
      el('button', { class: 'ghost', onclick: () => runDiagnostics(keyId) }, 'read-trap check'),
      live && k.limit ? el('button', { class: 'ghost', onclick: () => doResize(k) }, 'resize budget') : null,
      live ? el('button', { class: 'danger', onclick: () => doRevoke(keyId) }, 'Revoke key') : null,
    ),
  )

  mount(
    pane,
    head,
    k.blast
      ? blastBlock(k.blast)
      : el(
          'div',
          { class: 'block' },
          el('div', { class: 'block-head' }, el('h3', {}, 'Blast radius')),
          el(
            'p',
            { class: 'muted' },
            k.key.info.isRevoked
              ? 'Nothing left to evaluate. revokeKey zeroes the record, so the key reads back as scoped with an empty allowlist, which is deny-all. Its blast radius before revocation is in the policy record above.'
              : 'This key has no recipient allowlist to evaluate.',
          ),
        ),
    budgetBlock(k),
    ungovernableBlock(k),
    allowlistBlock(k),
    spendBlock(k),
    el('div', { class: 'block', id: 'diagOut' }),
  )
}

async function runDiagnostics(keyId) {
  const out = $('#diagOut')
  out.replaceChildren(el('p', { class: 'muted' }, el('span', { class: 'spin' }), ' calling both read forms…'))
  try {
    const d = await api(`/api/keys/${keyId}/diagnostics`)
    out.replaceChildren(
      el('div', { class: 'block-head' }, el('h3', {}, 'getRemainingLimit vs getRemainingLimitWithPeriod')),
      el('p', {}, d.verdict),
      el('pre', { class: 'calldata' }, JSON.stringify(d, null, 2)),
    )
  } catch (error) {
    out.replaceChildren(el('p', { style: 'color:var(--deny)' }, error.message))
  }
}

/**
 * `updateSpendingLimit` resets the remaining budget for the current period rather than scaling
 * it, so it is both a clamp and a mid-period top-up. It has been called zero times on Tempo
 * mainnet in a 50,000-block window, which is the whole reason this product exists.
 */
async function doResize(k) {
  const current = units(k.limit.remaining, k.token.decimals)
  const next = window.prompt(
    `New per-period limit for ${k.record?.agent ?? k.keyId}, in ${k.token.symbol}.\n\nThis resets the remaining budget for the current period to exactly this number. It does not scale it, and the period end does not move.\n\nRemaining right now: ${current}`,
    current,
  )
  if (!next) return
  toast('Resizing…', `${k.keyId} → ${next} ${k.token.symbol}`)
  try {
    const r = await api(`/api/keys/${k.keyId}/resize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: k.token.address, budgetHuman: next }),
    })
    toast(
      'Budget reset',
      `${r.tx.hash}\nremaining ${r.before.remaining} → ${r.after.remaining}, periodEnd ${r.before.periodEnd} → ${r.after.periodEnd}`,
      'ok',
    )
    await loadFleet()
    await selectKey(k.keyId)
  } catch (error) {
    toast('Resize failed', error.message, 'err')
  }
}

async function doRevoke(keyId) {
  if (!window.confirm(`Revoke ${keyId}?\n\nThe key stops being able to pay. Provisioning a replacement costs about 3.3M gas; revoking costs about 28k.`)) return
  toast('Revoking…', keyId)
  try {
    const r = await api(`/api/keys/${keyId}/revoke`, { method: 'POST' })
    toast('Revoked', `${r.tx.hash}\ngas ${Number(r.tx.gasUsed).toLocaleString()} · ${r.tx.elapsedMs} ms submit to receipt · getKey now reports isRevoked=${r.after.info.isRevoked}`, 'ok')
    toast('What happens to the next payment', r.honesty, '')
    await loadFleet()
    await selectKey(keyId)
  } catch (error) {
    toast('Revoke failed', error.message, 'err')
  }
}

// ------------------------------------------------------------- builder

function renderBuilder() {
  const cat = state.catalog
  const c = state.config
  const selected = new Set()

  const picker = el('div', { class: 'picker' })
  const selectedLine = el('div', { class: 'selected-line' }, 'nothing selected')
  const out = el('div', { class: 'builder-out' }, el('p', { class: 'muted pad' }, 'Pick services, then preview. The blast radius is computed before anything is signed.'))

  const redrawSelected = () => {
    selectedLine.textContent = selected.size ? [...selected].join(', ') : 'nothing selected'
  }

  const search = el('input', {
    type: 'text',
    placeholder: 'filter by id, realm or category',
    oninput: (e) => drawPicker(e.target.value.toLowerCase()),
  })

  function drawPicker(filter = '') {
    picker.replaceChildren(
      ...cat.services
        .filter((s) => !filter || `${s.id} ${s.realm} ${(s.categories ?? []).join(' ')}`.toLowerCase().includes(filter))
        .map((s) => {
          const box = el('input', {
            type: 'checkbox',
            checked: selected.has(s.id),
            onchange: (e) => {
              if (e.target.checked) selected.add(s.id)
              else selected.delete(s.id)
              redrawSelected()
            },
          })
          return el(
            'label',
            { class: 'picker-row' },
            box,
            el('span', { class: 'sid' }, s.id),
            s.intent === 'session' ? el('span', { class: 'shares' }, 'session') : null,
            s.sharesRecipientWith > 0 ? el('span', { class: 'shares' }, `+${s.sharesRecipientWith} share payout`) : null,
            el('span', { class: 'price' }, units(s.amount, s.decimals)),
          )
        }),
    )
  }
  drawPicker()

  const fBudget = el('input', { type: 'text', value: '0.05' })
  const fPeriod = el('select', {}, el('option', { value: '2592000' }, '30 days'), el('option', { value: '604800' }, '7 days'), el('option', { value: '86400' }, '1 day'), el('option', { value: '0' }, 'lifetime, no reset'))
  const fExpiry = el('input', { type: 'number', value: '7', min: '1' })
  const fAgent = el('input', { type: 'text', value: 'research-agent-01' })
  const fCalls = el('input', { type: 'number', value: '1', min: '1' })
  const fSession = el('input', { type: 'checkbox' })

  const body = () => ({
    agent: fAgent.value.trim() || 'agent',
    serviceIds: [...selected],
    budgetHuman: fBudget.value.trim(),
    periodSeconds: Number(fPeriod.value),
    expiryDays: Number(fExpiry.value),
    callsPerService: Number(fCalls.value),
    allowSessionChannels: fSession.checked,
  })

  let lastPreview = null

  const signBtn = el('button', { class: 'solid', disabled: true, onclick: () => doSign(body(), out) }, 'Sign and authorize')

  const previewBtn = el(
    'button',
    {
      class: 'ghost',
      onclick: async () => {
        if (!selected.size) return toast('Pick at least one service', '', 'err')
        out.replaceChildren(el('p', { class: 'pad muted' }, el('span', { class: 'spin' }), ' re-resolving payout addresses from live 402 challenges…'))
        signBtn.disabled = true
        try {
          lastPreview = await api('/api/policy/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body()),
          })
          renderPreview(lastPreview, out)
          signBtn.disabled = lastPreview.ok !== true
        } catch (error) {
          out.replaceChildren(el('p', { class: 'pad', style: 'color:var(--deny)' }, error.message))
        }
      },
    },
    'Preview and compute blast radius',
  )

  const form = el(
    'div',
    { class: 'builder-form' },
    el('label', { class: 'field' }, el('span', {}, 'agent name'), fAgent),
    el('label', { class: 'field' }, el('span', {}, `budget (${c.token.symbol}, ${c.token.decimals} decimals)`), fBudget),
    el('label', { class: 'field' }, el('span', {}, 'period'), fPeriod),
    el('label', { class: 'field' }, el('span', {}, 'expiry in days'), fExpiry),
    el('label', { class: 'field' }, el('span', {}, 'expected calls per service, for budget sizing'), fCalls),
    el(
      'label',
      { class: 'field', style: 'display:flex;gap:8px;align-items:center' },
      fSession,
      el('span', { style: 'margin:0;text-transform:none;letter-spacing:0;font-size:11.5px;color:var(--ink-2)' }, 'allow session channels (recipient allowlists do not apply there)'),
    ),
    el('label', { class: 'field' }, el('span', {}, 'services'), search),
    picker,
    selectedLine,
    el('div', { style: 'display:flex;gap:8px' }, previewBtn, signBtn),
    el(
      'p',
      { class: 'prov', style: 'margin-top:14px' },
      `Catalog capture ${stamp(cat.capturedAt)}. ${cat.services.length} services carried a chain-${c.mpp.resolutionChainId} payout address at capture time; ${cat.unresolved.length} did not and cannot be selected.`,
    ),
  )

  $('#builder').replaceChildren(form, out)
}

function renderPreview(p, out) {
  if (p.ok !== true) {
    out.replaceChildren(el('div', { class: 'block' }, el('div', { class: 'warnbox' }, el('h4', {}, 'This policy does not compile'), el('p', {}, p.compileError))))
    return
  }
  const dec = p.budget.decimals
  const driftRows = p.resolution.drift.filter((d) => d.changed)

  mount(
    out,
    blastBlock(p.blast, { heading: 'Blast radius, before you sign' }),
    driftRows.length
      ? el(
          'div',
          { class: 'block' },
          el(
            'div',
            { class: 'warnbox' },
            el('h4', {}, 'A payout address moved since the catalog capture'),
            ...driftRows.map((d) => el('p', {}, `${d.serviceId}: snapshot ${d.snapshotRecipient} → live ${d.liveRecipient}. ${d.note}`)),
          ),
        )
      : null,
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'What this key will be permitted to do')),
      el('ul', { class: 'plain' }, ...p.describe.map((line) => el('li', {}, line))),
      p.policy.gaps.length
        ? el(
            'div',
            { style: 'margin-top:14px' },
            ...p.policy.gaps.map((g) =>
              el('div', { class: 'warnbox', style: 'margin-bottom:8px' }, el('h4', {}, `${g.name} · ${g.kind}`), el('p', {}, g.detail)),
            ),
          )
        : null,
    ),
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Budget')),
      el(
        'div',
        { class: 'budget-row' },
        el('div', {}, el('div', { class: 'budget-figure' }, units(p.budget.units, dec), el('span', { class: 'budget-unit' }, p.budget.symbol)), el('div', { class: 'budget-sub' }, p.budget.periodSeconds ? `per ${p.budget.periodSeconds / 86400} days` : 'lifetime, no reset')),
        el('div', {}, el('div', { class: 'budget-sub' }, 'one call to each covered service'), el('div', { class: 'mono' }, `${units(p.policy.oneCallOfEachCost, dec)} ${p.budget.symbol}`)),
        el('div', {}, el('div', { class: 'budget-sub' }, 'sized for the expected volume'), el('div', { class: 'mono' }, `${units(p.budget.sizing.total, dec)} ${p.budget.symbol}`)),
      ),
      el('p', { class: 'prov', style: 'margin-top:10px' }, p.budget.sizing.basis),
    ),
    el(
      'div',
      { class: 'block' },
      el(
        'div',
        { class: 'block-head' },
        el('h3', {}, 'Provenance'),
        el('div', { class: 'spacer' }),
        el('span', { class: 'prov' }, `${p.policy.calldataBytes} bytes · selector ${p.policy.selector}`),
      ),
      el(
        'p',
        { class: 'prov' },
        el('b', {}, 'resolved '),
        p.resolution.note,
        el('br'),
        el('b', {}, 'settlement '),
        p.settlement.note,
        p.resolution.currencyMisses.length
          ? el('span', {}, el('br'), el('b', {}, 'currency '), `no chain-${p.settlement.resolutionChainId} offer in the budget token for: ${p.resolution.currencyMisses.join(', ')}`)
          : null,
      ),
      el('p', { class: 'prov', style: 'margin-top:8px' }, 'authorizeKey calldata, encoded from the generated viem/tempo ABI and asserted against selector 0x980a6025. It is shown so it can be checked; the key is actually installed through the key_authorization field of the type-0x76 envelope.'),
      el('pre', { class: 'calldata' }, p.policy.calldata),
    ),
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Offers the resolver did not take')),
      Object.keys(p.resolution.live.alternates).length
        ? el(
            'table',
            { class: 'grid' },
            el('thead', {}, el('tr', {}, ['service', 'intent', 'currency', 'would pay', 'amount'].map((h) => el('th', {}, h)))),
            el(
              'tbody',
              {},
              Object.entries(p.resolution.live.alternates).flatMap(([id, alts]) =>
                alts.map((a) =>
                  el(
                    'tr',
                    {},
                    el('td', {}, id),
                    el('td', {}, a.intent),
                    el('td', { class: 'mono' }, a.currency ?? '—'),
                    el('td', { class: 'mono' }, a.recipient ?? '—'),
                    el('td', { class: 'n' }, a.amount ?? '—'),
                  ),
                ),
              ),
            ),
          )
        : el('p', { class: 'muted' }, 'Each selected service quoted exactly one offer on this chain.'),
      el(
        'p',
        { class: 'prov', style: 'margin-top:10px' },
        'A single 402 can carry several offers on the same chain in different currencies that pay different addresses. Leash picks the charge-intent offer in the policy budget token; the rest are listed here so the choice is visible rather than implicit.',
      ),
    ),
  )
}

async function doSign(body, out) {
  toast('Authorizing…', 'minting an agent key and sending the key_authorization envelope')
  try {
    const r = await api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    toast('Key authorized', `${r.keyId}\n${r.tx.hash} · gas ${Number(r.tx.gasUsed).toLocaleString()} · ${r.tx.elapsedMs} ms`, 'ok')
    out.prepend(
      el(
        'div',
        { class: 'block' },
        el('div', { class: 'block-head' }, el('h3', {}, 'Authorized')),
        el(
          'p',
          { class: 'prov' },
          el('b', {}, 'keyId '),
          r.keyId,
          el('br'),
          el('b', {}, 'tx '),
          r.tx.hash,
          el('br'),
          el('b', {}, 'gas '),
          `${Number(r.tx.gasUsed).toLocaleString()} · ${r.tx.elapsedMs} ms submit to receipt`,
          el('br'),
          el('b', {}, 'read back '),
          `remaining ${r.verified.limit.remaining} at block ${r.verified.limit.stamp.blockNumber}, isRevoked=${r.verified.key.info.isRevoked}, scopes ${r.verified.allowed.scopes.length}`,
        ),
      ),
    )
    await loadFleet()
  } catch (error) {
    toast('Authorize failed', error.message, 'err')
  }
}

// ------------------------------------------------------- other views

async function renderCollisions() {
  const box = $('#collisions')
  box.replaceChildren(el('p', { class: 'pad muted' }, el('span', { class: 'spin' }), ' loading…'))
  const d = await api('/api/shared-recipients')
  mount(
    box,
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Payout addresses that serve more than one service'), el('div', { class: 'spacer' }), el('span', { class: 'prov' }, `capture ${stamp(d.capturedAt)}`)),
      el(
        'p',
        { style: 'max-width:88ch;color:var(--ink-2)' },
        'These are the addresses where recipient scoping does not isolate anything. Allowlisting one service at one of them allowlists every other service behind it. The twelve mpp.orthogonal.com services each hold a distinct address and are correctly separable, which is why they are absent from this table.',
      ),
    ),
    ...d.rows.map((r) =>
      el(
        'div',
        { class: 'block' },
        el(
          'div',
          { class: 'block-head' },
          el('h3', { style: 'text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)' }, r.recipient),
          el('div', { class: 'spacer' }),
          el('span', { class: 'prov' }, `${r.services.length} services · ${r.realms.length} realm${r.realms.length === 1 ? '' : 's'}`),
        ),
        el(
          'table',
          { class: 'grid' },
          el('thead', {}, el('tr', {}, ['service', 'name', 'realm', 'intent', 'list price'].map((h) => el('th', {}, h)))),
          el(
            'tbody',
            {},
            r.services.map((s) =>
              el('tr', {}, el('td', {}, s.id), el('td', {}, s.name), el('td', {}, s.realm ?? '—'), el('td', {}, s.intent), el('td', { class: 'n' }, s.amount)),
            ),
          ),
        ),
      ),
    ),
  )
}

async function renderSources() {
  const box = $('#sources')
  box.replaceChildren(el('p', { class: 'pad muted' }, el('span', { class: 'spin' }), ' probing every indexer…'))
  const d = await api('/api/indexer-sources')
  mount(
    box,
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Telemetry sources, probed just now')),
      el(
        'p',
        { style: 'max-width:88ch;color:var(--ink-2)' },
        'Each row is the result of an actual SELECT against that host a moment ago, not a configuration flag. The console reads from the source selected below; everything else on screen says which one answered.',
      ),
      el(
        'table',
        { class: 'grid', style: 'margin-top:14px' },
        el('thead', {}, el('tr', {}, ['source', 'url', 'chainId', 'documented', 'measured', 'latency', 'probed at'].map((h) => el('th', {}, h)))),
        el(
          'tbody',
          {},
          d.sources.map((s) =>
            el(
              'tr',
              {},
              el('td', {}, el('label', { class: 'picker-row', style: 'border:0;padding:0;gap:6px' }, el('input', {
                type: 'radio',
                name: 'src',
                checked: (state.source ?? state.fleet?.indexer.source.name) === s.name,
                disabled: !s.live,
                onchange: () => {
                  state.source = s.name
                  toast('Telemetry source switched', `${s.name} · ${s.url}`, 'ok')
                  void loadFleet()
                },
              }), s.name)),
              el('td', { class: 'mono' }, s.url),
              el('td', { class: 'mono' }, s.chainIdParam),
              el('td', { class: 'wrap' }, s.requiresPayment ? 'payment required' : 'open'),
              el('td', { class: 'wrap', style: s.live ? 'color:var(--allow)' : 'color:var(--deny)' }, s.status),
              el('td', { class: 'n' }, `${s.latencyMs} ms`),
              el('td', {}, stamp(s.probedAt)),
            ),
          ),
        ),
      ),
      el('p', { class: 'prov', style: 'margin-top:12px' }, ...d.sources.map((s) => el('span', {}, `${s.name}: ${s.note}`, el('br')))),
    ),
    el(
      'div',
      { class: 'block' },
      el('div', { class: 'block-head' }, el('h3', {}, 'Network')),
      el(
        'p',
        { class: 'prov' },
        el('b', {}, 'rpc '),
        state.config.network.rpcUrl,
        el('br'),
        el('b', {}, 'fee sponsorship for agent payments '),
        state.config.sponsorship.agentNote,
        el('br'),
        el('b', {}, 'root key writes '),
        state.config.sponsorship.note,
        el('br'),
        el('b', {}, 'mpp '),
        state.config.mpp.note,
        el('br'),
        el('b', {}, 'registry '),
        state.config.registryPath,
      ),
    ),
  )
}

// --------------------------------------------------------------- boot

async function loadFleet() {
  const f = await api(`/api/fleet${state.source ? `?source=${state.source}` : ''}`)
  state.fleet = f
  if (!state.selected || !f.keys.some((k) => k.keyId === state.selected)) state.selected = f.keys[0]?.keyId ?? null
  renderFleet()
  if (state.selected) await selectKey(state.selected)
  else $('#keyDetail').replaceChildren(el('p', { class: 'muted pad' }, 'No agent keys on this account yet.'))
}

function wireTabs() {
  for (const tab of document.querySelectorAll('.tab[data-view]')) {
    tab.addEventListener('click', async () => {
      for (const t of document.querySelectorAll('.tab[data-view]')) t.classList.toggle('is-active', t === tab)
      for (const v of document.querySelectorAll('.view')) v.classList.add('hidden')
      const view = tab.dataset.view
      $(`#view-${view}`).classList.remove('hidden')
      try {
        if (view === 'new' && !state.catalog) {
          state.catalog = await api('/api/catalog')
          renderBuilder()
        } else if (view === 'collisions') await renderCollisions()
        else if (view === 'sources') await renderSources()
      } catch (error) {
        toast('Load failed', error.message, 'err')
      }
    })
  }
  $('#reloadFleet').addEventListener('click', () => {
    void loadFleet().catch((e) => toast('Reload failed', e.message, 'err'))
  })
}

async function boot() {
  wireTabs()
  try {
    state.config = await api('/api/config')
    renderChainStatus()
    await loadFleet()
  } catch (error) {
    $('#chainStatus').replaceChildren(el('span', { style: 'color:var(--deny)' }, error.message))
    $('#keyDetail').replaceChildren(el('p', { class: 'pad', style: 'color:var(--deny)' }, error.message))
  }
}

void boot()
