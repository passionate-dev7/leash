const STOPWORDS = new Set(
  `a about above after again against all also am an and any are as at be because been before being below between both but by can
  could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if
  in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own
  same she should so some such than that the their theirs them themselves then there these they this those through to too under until
  up very was we were what when where which while who whom why will with would you your yours yourself yourselves said says say new
  one two may might much many get got like even still every since however though yet via per etc`
    .split(/\s+/)
    .filter(Boolean),
)

export const MAX_TEXT_CHARS = 8_000

const WORD = /[\p{L}][\p{L}\p{N}'’-]*/gu

export function terms(text: string): string[] {
  const out: string[] = []
  for (const m of text.toLowerCase().matchAll(WORD)) {
    const w = m[0].replace(/^['’-]+|['’-]+$/g, '')
    if (w.length > 2 && !STOPWORDS.has(w)) out.push(w)
  }
  return out
}

function counts(words: readonly string[]): Map<string, number> {
  const tf = new Map<string, number>()
  for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1)
  return tf
}

/** Top `n` terms by frequency, ties broken alphabetically so the output is stable. */
export function keywords(text: string, n = 8): { term: string; count: number }[] {
  return [...counts(terms(text))]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([term, count]) => ({ term, count }))
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'(\[])/u)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Extractive summary: each sentence scores the mean term frequency of its meaningful words
 * (so long sentences are not favoured), the top `n` are returned in their original order.
 */
export function summarize(text: string, n = 3): { summary: string; sentences: string[] } {
  const all = splitSentences(text)
  const tf = counts(terms(text))
  const scored = all
    .map((sentence, index) => {
      const words = terms(sentence)
      const score = words.length < 4 || words.length > 60 ? 0 : words.reduce((sum, w) => sum + (tf.get(w) ?? 0), 0) / words.length
      return { sentence, index, score }
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, n)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence)
  return { summary: scored.join(' '), sentences: scored }
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '-', mdash: '-', hellip: '...' }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' '
    }
    return ENTITIES[body.toLowerCase()] ?? whole
  })
}

/** Title and visible text of an HTML document, text capped at MAX_TEXT_CHARS. */
export function extractPage(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? ''
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr|section|article|blockquote)\s*>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const clean = (s: string) => decodeEntities(s).replace(/[ \t\f\v\u00a0]+/g, ' ').replace(/ ?\n[ \n]*/g, '\n').trim()
  return { title: clean(title).replace(/\s+/g, ' ').slice(0, 300), text: clean(body).slice(0, MAX_TEXT_CHARS) }
}
