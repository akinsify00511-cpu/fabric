import { cleanLeadRows, suggestLeadMapping, type LeadImportMapping, type LeadImportRow } from './smartLeadImport'

export type ImportPreview = {
  headers: string[]
  mapping: LeadImportMapping
  totalRows: number
  cleanRows: number
  duplicateRows: number
  invalidRows: number
  duplicateSourceRows: number[]
  invalidSourceRows: { row: number; reason: string }[]
}

export function buildLeadImportPreview(rows: LeadImportRow[], headers: string[]): ImportPreview {
  return buildLeadImportPreviewWithMapping(rows, headers, suggestLeadMapping(headers))
}

export function buildLeadImportPreviewWithMapping(rows: LeadImportRow[], headers: string[], mapping: LeadImportMapping): ImportPreview {
  const result = cleanLeadRows(rows, mapping)
  return { headers, mapping, totalRows: rows.length, cleanRows: result.rows.length, duplicateRows: result.duplicates.length, invalidRows: result.invalid.length, duplicateSourceRows: result.duplicates, invalidSourceRows: result.invalid }
}
