import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PriceBook } from './quote-cap.js'

export const PRICE_BOOK_PATH = fileURLToPath(new URL('../data/price-book.4217.json', import.meta.url))

/** The mpp.dev catalog listing snapshot (Tempo mainnet, charge intent). Node only. */
export function loadPriceBook(path = PRICE_BOOK_PATH): PriceBook {
  return JSON.parse(readFileSync(path, 'utf8')) as PriceBook
}
