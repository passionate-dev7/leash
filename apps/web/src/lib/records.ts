import type { LedgerRecord } from './api'

export const asRecords = (value: { records: LedgerRecord[] }): LedgerRecord[] => value.records
