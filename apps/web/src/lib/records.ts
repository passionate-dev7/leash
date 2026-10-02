import type { LedgerRecord } from './api'

export const asRecords = (value: LedgerRecord[] | { records: LedgerRecord[] }): LedgerRecord[] => (Array.isArray(value) ? value : value.records)
