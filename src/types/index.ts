export type Month = 'ene'|'feb'|'mar'|'abr'|'may'|'jun'|'jul'|'ago'|'sep'|'oct'|'nov'|'dic'
export type Period = Month|'YTD'
export type Pillar = 'Todos'|'Partner'|'Cliente'|'Negocio'
export type Area = 'Todos'|'Ops'|'RH'
export type IndicatorArea = Exclude<Area,'Todos'>
export type LoadStage = 'idle'|'loading'|'validating'|'processing'|'ready'|'error'
export interface DirectoryRow {
  CeCo: string
  Tienda: string
  Región: string
  DM: string
  FechaApertura: string | null
  TipoTienda: string
}
export interface IndicatorValue {
  sheet: string
  indicator: string
  pillar: Exclude<Pillar,'Todos'>
  areas: IndicatorArea[]
  rule: string
  multipleMonthLogic: string
  ytdLogic: string
  value: unknown
  displayValue?: string
  detailValue?: string
  score: number | null
  fulfilled: number
  applicable: number
  status: 'cumple'|'no-cumple'|'na'|'blank'
  previousMonth?: Month
  previousValue?: unknown
  previousDisplayValue?: string
  previousStatus?: 'cumple'|'no-cumple'|'na'|'blank'
  trend?: 'up'|'down'|'flat'|'unavailable'
}
export interface StoreResult extends DirectoryRow {
  indicators: IndicatorValue[]
  compliance: number
  applicable: number
  fulfilled: number
  failed: number
  na: number
  rank: number
}
export interface AuditItem { level: 'ok'|'warning'|'error'; category: string; message: string }
export interface SheetAudit {
  sheet: string
  found: boolean
  rows: number
  headers: string[]
  missingHeaders: string[]
  validCeCos: number
  duplicateCeCos: string[]
}
export interface WorkbookResult {
  stores: StoreResult[]
  audit: AuditItem[]
  sheets: SheetAudit[]
  periods: Period[]
  selectedPeriods: Period[]
  fileName: string
  processedAt: string
  foundSheets: string[]
  missingSheets: string[]
  indicatorCount: number
  validCeCos: number
  duplicateDirectoryCeCos: string[]
}
