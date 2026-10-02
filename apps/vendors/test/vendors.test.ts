import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertFetchable, catalog, createVendorRouter, extractPage, isPublicAddress, keywords, summarize } from '../src/index.js'

const ARTICLE =
  'Tempo settles payments in stablecoins. Agents pay for APIs over MPP and each payment settles on Tempo within a block. ' +
  'The weather was mild. Spend limits on Tempo are enforced by the protocol, so an agent cannot spend past its limit. ' +
  'A vendor that fails after settlement still keeps the payment.'

test('keywords ranks by frequency and drops stopwords', () => {
  const top = keywords(ARTICLE)
  assert.equal(top[0]?.term, 'tempo')
  assert.ok(top.length <= 8 && top.length > 0)
  assert.ok(!top.some((k) => ['the', 'and', 'that'].includes(k.term)))
})

test('summarize returns at most three sentences, in source order, and drops the off-topic one', () => {
  const { sentences, summary } = summarize(ARTICLE)
  assert.ok(sentences.length >= 1 && sentences.length <= 3)
  assert.ok(!summary.includes('weather'))
  const positions = sentences.map((s) => ARTICLE.indexOf(s))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
})

test('extractPage strips scripts and tags, decodes entities, caps text', () => {
  const html = `<html><head><title>A &amp; B</title><script>alert(1)</script></head><body><p>Hello&nbsp;world</p><style>p{}</style><p>${'x'.repeat(9000)}</p></body></html>`
  const page = extractPage(html)
  assert.equal(page.title, 'A & B')
  assert.ok(page.text.startsWith('Hello world'))
  assert.ok(!page.text.includes('alert'))
  assert.equal(page.text.length, 8000)
})

test('scrape refuses non-https, odd ports, credentials and private addresses', () => {
  for (const bad of ['http://example.com', 'https://example.com:8443', 'https://u:p@example.com', 'https://127.0.0.1', 'https://10.1.2.3', 'https://169.254.169.254/latest', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/'])
    assert.throws(() => assertFetchable(bad), Error, bad)
  assert.equal(assertFetchable('https://example.com/a').hostname, 'example.com')
  assert.equal(isPublicAddress('8.8.8.8'), true)
  assert.equal(isPublicAddress('192.168.1.1'), false)
})

test('catalog: atlas services have distinct virtual recipients under one master, relay shares a payout', () => {
  const entries = catalog('http://localhost:4180/')
  assert.equal(entries.length, 5)
  const atlas = entries.filter((e) => e.vendorId === 'atlas')
  assert.equal(new Set(atlas.map((e) => e.recipient)).size, 3)
  assert.ok(atlas.every((e) => e.virtual && e.recipient.toLowerCase().startsWith('0x52e26e0e')))
  const relay = entries.filter((e) => e.vendorId === 'relay')
  assert.equal(new Set(relay.map((e) => e.recipient)).size, 1)
  assert.ok(relay.every((e) => !e.virtual))
  assert.equal(entries[0]?.url, 'http://localhost:4180/v/atlas/search')
})

const router = createVendorRouter({ secretKey: 'test-secret-test-secret-test-secret' })
const post = (path: string, body: unknown) => new Request(`http://127.0.0.1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

test('summarize validates before charging: empty text is 422, valid text without payment is a 402 challenge', async () => {
  const empty = await router(post('/v/relay/summarize', { text: '   ' }))
  assert.equal(empty?.status, 422)
  const unpaid = await router(post('/v/relay/summarize', { text: ARTICLE }))
  assert.equal(unpaid?.status, 402)
  assert.ok(unpaid?.headers.get('www-authenticate')?.startsWith('Payment'))
})

test('scrape charges before it validates: an unpaid request is a 402 even with a bad body', async () => {
  const res = await router(post('/v/atlas/scrape', { nothing: true }))
  assert.equal(res?.status, 402)
})

test('router ignores paths outside /v/ and answers 404 and 405 inside it', async () => {
  assert.equal(await router(new Request('http://127.0.0.1/api/health')), null)
  assert.equal((await router(new Request('http://127.0.0.1/v/atlas/nothing')))?.status, 404)
  assert.equal((await router(new Request('http://127.0.0.1/v/atlas/scrape')))?.status, 405)
})
