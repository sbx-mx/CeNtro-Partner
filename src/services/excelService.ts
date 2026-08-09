import type { WorkBook, WorkSheet } from 'xlsx'
import { EFFECTIVENESS_SHEETS, INDICATORS, PERIODS, REQUIRED_SHEETS, normalize, type IndicatorConfig } from '../config/indicators'
import type { AuditItem, DirectoryRow, IndicatorArea, IndicatorValue, Month, Period, SheetAudit, StoreResult, WorkbookResult } from '../types'

type Row = Record<string, unknown>
type Instruction = { areas: IndicatorArea[]; rule: string; multipleMonthLogic: string; ytdLogic: string }
type IndicatorSheet = { config: IndicatorConfig; actualName: string; rows: Row[]; rowsByCeCo: Map<string,Row>; cecoKey?: string; periodKeys: Partial<Record<Period,string>> }
type WorkbookSource = {
  fileName: string
  directory: DirectoryRow[]
  duplicateDirectoryCeCos: string[]
  foundSheets: string[]
  missingSheets: string[]
  instructions: Map<string,Instruction>
  indicatorSheets: Map<string,IndicatorSheet>
  baseAudit: AuditItem[]
  baseSheetAudits: SheetAudit[]
}

const MONTHS: Month[] = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
type XlsxModule = typeof import('xlsx')
const findSheet = (wb: WorkBook, expected: string) => wb.SheetNames.find(name => normalize(name) === normalize(expected))
const toRows = (XLSX: XlsxModule, ws: WorkSheet) => XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true, blankrows: false })
const findKey = (obj: Row, expected: string) => Object.keys(obj).find(key => normalize(key) === normalize(expected))
const cleanCeCo = (value: unknown) => {
  const digits = String(value ?? '').trim().replace(/\.0+$/,'').replace(/\D/g,'')
  return digits ? digits.padStart(5,'0') : ''
}
const isExplicitNA = (value: unknown) => typeof value === 'string' && /^\s*n\/?a\s*$/i.test(value)
const isBlank = (value: unknown) => value === null || value === undefined || value === ''
const numeric = (value: unknown): number | null => {
  if (isBlank(value) || isExplicitNA(value)) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value).trim().replace(/\u00a0/g,'').replace(/[$%]/g,'').replace(/,/g,'.')
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}
const parseAreas = (value: unknown): IndicatorArea[] => {
  const tokens = String(value ?? '').split(',').map(item => normalize(item)).filter(Boolean)
  const areas: IndicatorArea[] = []
  if (tokens.includes('ops')) areas.push('Ops')
  if (tokens.includes('rh')) areas.push('RH')
  return areas
}
const ratio = (value: unknown) => {
  const number = numeric(value)
  if (number === null) return null
  return Math.abs(number) > 1.5 ? number / 100 : number
}

const isoDate = (XLSX: XlsxModule, value: unknown): string | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0,10)
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`
  }
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/)
  const date = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : new Date(text)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0,10) : null
}

const percentageValue = (value: unknown): number | null => {
  if (isBlank(value) || isExplicitNA(value)) return null
  const number = numeric(value)
  if (number === null) return null
  const percentage = Math.abs(number) > 1 ? number / 100 : number
  return percentage >= 0 && percentage <= 1 ? percentage : null
}

function evaluate(config: IndicatorConfig, value: unknown): number | null {
  const number = numeric(value)
  const percentage = ratio(value)
  if (number === null) return null
  switch(config.evaluator) {
    case 'lte36pct': return percentage !== null && percentage <= 0.36 ? 1 : 0
    case 'lte0': return number <= 0 ? 1 : 0
    case 'lte1': return number <= 1 ? 1 : 0
    case 'equals1': return number === 1 ? 1 : 0
    case 'gt70': return number > 70 ? 1 : 0
    case 'gt60pct': return percentage !== null && percentage > 0.60 ? 1 : 0
    case 'gt70pct': return percentage !== null && percentage > 0.70 ? 1 : 0
    case 'gt0': return number > 0 ? 1 : 0
    case 'gt1': return number > 1 ? 1 : 0
    case 'between09pct': return percentage !== null && percentage >= -0.009 && percentage <= 0.009 ? 1 : 0
    case 'gt7': return number > 7 ? 1 : 0
  }
}

function summarize(store: DirectoryRow, indicators: IndicatorValue[]): StoreResult {
  const fulfilled = indicators.reduce((sum, indicator) => sum + indicator.fulfilled, 0)
  const applicable = indicators.reduce((sum, indicator) => sum + indicator.applicable, 0)
  const failed = applicable - fulfilled
  const na = indicators.filter(indicator => indicator.applicable === 0).length
  return { ...store, indicators, fulfilled, failed, na, applicable, compliance: applicable ? fulfilled / applicable : 0, rank: 0 }
}

function selectedMonths(selection: Period[]): Month[] {
  if (selection.includes('YTD')) return MONTHS
  const selected = new Set(selection)
  return MONTHS.filter(month => selected.has(month))
}

function valuesForStore(sheet: IndicatorSheet, ceco: string, periods: Period[]) {
  const row = sheet.rowsByCeCo.get(ceco)
  if (!row) return new Map<Period,unknown>()
  const values = new Map<Period,unknown>()
  periods.forEach(period => {
    const key = sheet.periodKeys[period]
    if (key) values.set(period, row[key])
  })
  return values
}

function simpleIndicator(config: IndicatorConfig, instruction: Instruction, value: unknown): IndicatorValue {
  const score = evaluate(config, value)
  const explicitNA = isExplicitNA(value)
  const blank = isBlank(value)
  const applicable = score === null ? 0 : 1
  return {
    sheet: config.sheet,
    indicator: config.indicator,
    pillar: config.pillar,
    areas: instruction.areas,
    rule: instruction.rule,
    multipleMonthLogic: instruction.multipleMonthLogic,
    ytdLogic: instruction.ytdLogic,
    value,
    score,
    fulfilled: score === 1 ? 1 : 0,
    applicable,
    status: score === null ? (explicitNA ? 'na' : blank ? 'blank' : 'na') : score === 1 ? 'cumple' : 'no-cumple',
  }
}

function aggregateEvaluable(config: IndicatorConfig, instruction: Instruction, values: unknown[]): IndicatorValue {
  let fulfilled = 0
  let applicable = 0
  values.forEach(value => {
    const score = evaluate(config, value)
    if (score === null) return
    applicable += 1
    fulfilled += score
  })
  if (!applicable) return simpleIndicator(config, instruction, null)
  const score = fulfilled / applicable
  return {
    sheet: config.sheet,
    indicator: config.indicator,
    pillar: config.pillar,
    areas: instruction.areas,
    rule: instruction.rule,
    multipleMonthLogic: instruction.multipleMonthLogic,
    ytdLogic: instruction.ytdLogic,
    value: score,
    displayValue: `${fulfilled}/${applicable}`,
    score,
    fulfilled,
    applicable,
    status: score === 1 ? 'cumple' : 'no-cumple',
  }
}

function buildEffectiveness(source: WorkbookSource, config: IndicatorConfig, ceco: string, selection: Period[]): IndicatorValue {
  const months = selectedMonths(selection)
  const details: string[] = []
  let total = 0
  let valueCount = 0
  const areas = new Set<IndicatorArea>()
  const rules: string[] = []
  const multipleMonthLogic: string[] = []
  const ytdLogic: string[] = []

  EFFECTIVENESS_SHEETS.forEach(sheetName => {
    const sheet = source.indicatorSheets.get(sheetName)
    const instruction = source.instructions.get(normalize(sheetName))
    instruction?.areas.forEach(area => areas.add(area))
    if (instruction?.rule) rules.push(`${sheetName}: ${instruction.rule}`)
    if (instruction?.multipleMonthLogic) multipleMonthLogic.push(`${sheetName}: ${instruction.multipleMonthLogic}`)
    if (instruction?.ytdLogic) ytdLogic.push(`${sheetName}: ${instruction.ytdLogic}`)

    let sheetTotal = 0
    let sheetValueCount = 0
    if (sheet?.cecoKey) {
      const values = valuesForStore(sheet, ceco, months)
      months.forEach(month => {
        const percentage = percentageValue(values.get(month))
        if (percentage === null) return
        sheetTotal += percentage
        sheetValueCount += 1
      })
    }
    total += sheetTotal
    valueCount += sheetValueCount
    details.push(`${sheetName} ${sheetValueCount ? `${Math.round((sheetTotal / sheetValueCount) * 100)}% (${sheetValueCount})` : 'N/A'}`)
  })

  if (!valueCount) return {
    sheet:'BB, BT, SS', indicator:'Efectividad', pillar:config.pillar, areas:[...areas],
    rule:rules.join(' · '), multipleMonthLogic:multipleMonthLogic.join(' · '), ytdLogic:ytdLogic.join(' · '),
    value:null, displayValue:'N/A', detailValue:`${details.join(' · ')} · Total: N/A`, score:null,
    fulfilled:0, applicable:0, status:'na',
  }
  const score = total / valueCount
  return {
    sheet:'BB, BT, SS', indicator:'Efectividad', pillar:config.pillar, areas:[...areas],
    rule:rules.join(' · '), multipleMonthLogic:multipleMonthLogic.join(' · '), ytdLogic:ytdLogic.join(' · '),
    value:score, displayValue:`${Math.round(score * 100)}%`,
    detailValue:`${details.join(' · ')} · Promedio: ${Math.round(score * 100)}% (${valueCount} ${valueCount === 1 ? 'valor' : 'valores'})`,
    score, fulfilled:score, applicable:1, status:score === 1 ? 'cumple' : 'no-cumple',
  }
}

function buildIndicator(source: WorkbookSource, config: IndicatorConfig, ceco: string, selection: Period[]): IndicatorValue {
  if (config.indicator === 'Efectividad') return buildEffectiveness(source, config, ceco, selection)
  const sheet = source.indicatorSheets.get(config.sheet)
  const instruction = source.instructions.get(normalize(config.sheet)) ?? { areas:[], rule:'', multipleMonthLogic:'', ytdLogic:'' }
  if (!sheet?.cecoKey) return simpleIndicator(config, instruction, null)

  const isYTD = selection.includes('YTD')
  const months = selectedMonths(selection)
  const monthValues = valuesForStore(sheet, ceco, months)
  const validMonthEntries = months
    .map(month => [month, monthValues.get(month)] as const)
    .filter(([,value]) => numeric(value) !== null)

  const logic = normalize(isYTD ? instruction.ytdLogic : instruction.multipleMonthLogic)

  if (logic.includes('ultimo dato') || logic.includes('mes mas cercano')) {
    const latest = [...validMonthEntries].reverse()[0]
    return simpleIndicator(config, instruction, latest?.[1] ?? null)
  }

  if (isYTD && logic.includes('dato columna ytd')) {
    const ytdValue = valuesForStore(sheet, ceco, ['YTD']).get('YTD') ?? null
    return simpleIndicator(config, instruction, ytdValue)
  }

  if (logic.includes('promedia')) {
    const valid = validMonthEntries.map(([,value]) => numeric(value)!).filter(Number.isFinite)
    const average = valid.length ? valid.reduce((sum,value) => sum + value, 0) / valid.length : null
    return simpleIndicator(config, instruction, average)
  }

  if (!isYTD && logic.includes('suma los valores') && normalize(config.indicator) === normalize('Bajas<90')) {
    const valid = validMonthEntries.map(([,value]) => numeric(value)!).filter(Number.isFinite)
    const total = valid.length ? valid.reduce((sum,value) => sum + value, 0) : null
    return simpleIndicator(config, instruction, total)
  }

  if (logic.includes('suma los valores') || logic.includes('contar aquellos datos 1 o 0')) {
    const result = aggregateEvaluable(config, instruction, months.map(month => monthValues.get(month)))
    return result
  }

  if (isYTD) {
    const ytdValue = valuesForStore(sheet, ceco, ['YTD']).get('YTD') ?? null
    return simpleIndicator(config, instruction, ytdValue)
  }

  const latest = [...validMonthEntries].reverse()[0]
  return simpleIndicator(config, instruction, latest?.[1] ?? null)
}

function evaluateSource(source: WorkbookSource, selection: Period[]): WorkbookResult {
  const normalizedSelection = selection.includes('YTD') ? ['YTD'] as Period[] : MONTHS.filter(month => selection.includes(month))
  const effectiveSelection = normalizedSelection
  let stores = source.directory.map(store => summarize(store, INDICATORS.map(config => buildIndicator(source, config, store.CeCo, effectiveSelection))))
  stores = stores
    .sort((a,b) => b.compliance - a.compliance || b.fulfilled - a.fulfilled || a.CeCo.localeCompare(b.CeCo))
    .map((store,index) => ({ ...store, rank:index + 1 }))

  const periodLabel = effectiveSelection.includes('YTD') ? 'YTD' : effectiveSelection.map(period => period.toUpperCase()).join(', ')
  const audit = [...source.baseAudit, { level:'ok' as const, category:'Ranking', message:`Ranking generado para ${periodLabel} con ${stores.length} tiendas.` }]
  return {
    stores,
    audit,
    sheets: source.baseSheetAudits,
    periods: [...PERIODS],
    selectedPeriods: effectiveSelection,
    fileName: source.fileName,
    processedAt: new Date().toISOString(),
    foundSheets: source.foundSheets,
    missingSheets: source.missingSheets,
    indicatorCount: INDICATORS.length,
    validCeCos: source.directory.length,
    duplicateDirectoryCeCos: source.duplicateDirectoryCeCos,
  }
}

async function parseSource(buffer: ArrayBuffer, fileName: string): Promise<WorkbookSource> {
  // XLSX es el módulo más pesado. Se carga sólo cuando comienza el procesamiento
  // para que la interfaz ejecutiva aparezca antes y el navegador mantenga la navegación fluida.
  const XLSX = await import('xlsx')
  const baseAudit: AuditItem[] = []
  const baseSheetAudits: SheetAudit[] = []
  let wb: WorkBook
  try { wb = XLSX.read(buffer, { type:'array', cellDates:true }) }
  catch { throw new Error('El archivo no pudo abrirse como libro de Excel válido.') }

  const missingSheets = REQUIRED_SHEETS.filter(sheet => !findSheet(wb, sheet))
  const foundSheets = REQUIRED_SHEETS.filter(sheet => Boolean(findSheet(wb, sheet)))
  if (missingSheets.length) throw new Error(`Pestañas faltantes: ${missingSheets.join(', ')}`)

  const directoryName = findSheet(wb, 'Directorio')!
  const directoryRows = toRows(XLSX, wb.Sheets[directoryName])
  if (!directoryRows.length) throw new Error('La pestaña Directorio no contiene registros.')
  const cecoKey = findKey(directoryRows[0], 'CeCo')
  const storeKey = findKey(directoryRows[0], 'Tienda')
  const regionKey = findKey(directoryRows[0], 'Región')
  const dmKey = findKey(directoryRows[0], 'DM')
  const openingDateKey = findKey(directoryRows[0], 'Fecha Apertura')
  const storeTypeKey = findKey(directoryRows[0], 'Tipo Tienda')
  const missingDirectoryHeaders = [['CeCo',cecoKey],['Tienda',storeKey],['Región',regionKey],['DM',dmKey],['Fecha Apertura',openingDateKey],['Tipo Tienda',storeTypeKey]].filter(([,key]) => !key).map(([header]) => header as string)
  if (missingDirectoryHeaders.length) throw new Error(`Directorio requiere encabezados: ${missingDirectoryHeaders.join(', ')}.`)

  const seen = new Set<string>()
  const duplicateDirectoryCeCos: string[] = []
  const directory: DirectoryRow[] = []
  directoryRows.forEach(row => {
    const CeCo = cleanCeCo(row[cecoKey!])
    if (!/^\d{5}$/.test(CeCo)) return
    if (seen.has(CeCo)) { duplicateDirectoryCeCos.push(CeCo); return }
    seen.add(CeCo)
    directory.push({
      CeCo,
      Tienda:String(row[storeKey!] ?? '').trim(),
      Región:String(row[regionKey!] ?? '').trim(),
      DM:String(row[dmKey!] ?? '').trim(),
      FechaApertura:isoDate(XLSX, row[openingDateKey!]),
      TipoTienda:String(row[storeTypeKey!] ?? '').trim(),
    })
  })
  baseSheetAudits.push({ sheet:directoryName, found:true, rows:directoryRows.length, headers:Object.keys(directoryRows[0]), missingHeaders:[], validCeCos:directory.length, duplicateCeCos:duplicateDirectoryCeCos })

  const instructionsName = findSheet(wb, 'Instrucciones')!
  const instructionRows = toRows(XLSX, wb.Sheets[instructionsName])
  if (!instructionRows.length) throw new Error('La pestaña Instrucciones no contiene registros.')
  const instructionHeaders = {
    sheet: findKey(instructionRows[0], 'Pestaña'),
    area: findKey(instructionRows[0], 'Area'),
    rule: findKey(instructionRows[0], 'Ponderacion'),
    multiple: findKey(instructionRows[0], 'Logica Selección Mes Multiple'),
    ytd: findKey(instructionRows[0], 'Logica YTD'),
  }
  const missingInstructionHeaders = [
    !instructionHeaders.sheet ? 'Pestaña' : '',
    !instructionHeaders.area ? 'Area' : '',
    !instructionHeaders.rule ? 'Ponderacion' : '',
    !instructionHeaders.multiple ? 'Logica Selección Mes Multiple' : '',
    !instructionHeaders.ytd ? 'Logica YTD' : '',
  ].filter(Boolean)
  if (missingInstructionHeaders.length) throw new Error(`Instrucciones requiere encabezados: ${missingInstructionHeaders.join(', ')}.`)

  const instructions = new Map<string,Instruction>()
  instructionRows.forEach(row => {
    const sheet = normalize(row[instructionHeaders.sheet!])
    if (!sheet) return
    instructions.set(sheet, {
      areas: parseAreas(row[instructionHeaders.area!]),
      rule: String(row[instructionHeaders.rule!] ?? ''),
      multipleMonthLogic: String(row[instructionHeaders.multiple!] ?? ''),
      ytdLogic: String(row[instructionHeaders.ytd!] ?? ''),
    })
  })
  const instructionSheets = [...new Set([...INDICATORS.map(config => config.sheet), ...EFFECTIVENESS_SHEETS])]
  const missingInstructionRows = instructionSheets.filter(sheet => !instructions.has(normalize(sheet)))
  const missingInstructionAreas = instructionSheets.filter(sheet => !(instructions.get(normalize(sheet))?.areas.length))
  if (missingInstructionRows.length) throw new Error(`Instrucciones no contiene lógica para: ${missingInstructionRows.join(', ')}.`)
  if (missingInstructionAreas.length) throw new Error(`Instrucciones requiere Area válida (Ops, RH u Ops ,RH) para: ${missingInstructionAreas.join(', ')}.`)
  baseSheetAudits.push({ sheet:instructionsName, found:true, rows:instructionRows.length, headers:Object.keys(instructionRows[0]), missingHeaders:[], validCeCos:0, duplicateCeCos:[] })
  baseAudit.push({ level:'ok', category:'Instrucciones', message:`Se leyeron Area, Ponderacion, Logica Selección Mes Multiple y Logica YTD para los ${INDICATORS.length} indicadores.` })

  const indicatorSheets = new Map<string,IndicatorSheet>()
  const sourceConfigs = new Map(INDICATORS.map(config => [config.sheet, config]))
  EFFECTIVENESS_SHEETS.forEach(sheet => {
    if (!sourceConfigs.has(sheet)) sourceConfigs.set(sheet, { sheet, indicator:sheet, pillar:'Partner', evaluator:'equals1' })
  })
  sourceConfigs.forEach(config => {
    const actualName = findSheet(wb, config.sheet)!
    const rows = toRows(XLSX, wb.Sheets[actualName])
    const ceco = rows[0] ? findKey(rows[0], 'CeCo') : undefined
    const periodKeys: Partial<Record<Period,string>> = {}
    if (rows[0]) PERIODS.forEach(period => { const key = findKey(rows[0], period); if (key) periodKeys[period] = key })
    if (!ceco) throw new Error(`${actualName} requiere el encabezado CeCo.`)
    const rowsByCeCo = new Map<string,Row>()
    const counts = new Map<string,number>()
    rows.forEach(row => {
      const currentCeCo = cleanCeCo(row[ceco])
      if (!currentCeCo) return
      rowsByCeCo.set(currentCeCo, row)
      counts.set(currentCeCo, (counts.get(currentCeCo) ?? 0) + 1)
    })
    const duplicateCeCos = [...counts].filter(([,count]) => count > 1).map(([currentCeCo]) => currentCeCo)
    indicatorSheets.set(config.sheet, { config, actualName, rows, rowsByCeCo, cecoKey:ceco, periodKeys })
    baseSheetAudits.push({ sheet:actualName, found:true, rows:rows.length, headers:rows[0] ? Object.keys(rows[0]) : [], missingHeaders:[], validCeCos:rowsByCeCo.size, duplicateCeCos })
  })
  baseAudit.push({ level:'ok', category:'Estructura', message:`${directory.length} tiendas y ${INDICATORS.length} indicadores cargados por pestaña y encabezado.` })
  baseAudit.push({ level:'ok', category:'Directorio', message:`Tienda, Región, DM, Fecha Apertura y Tipo Tienda relacionados exclusivamente por CeCo para ${directory.length} tiendas únicas.` })

  return { fileName, directory, duplicateDirectoryCeCos, foundSheets, missingSheets, instructions, indicatorSheets, baseAudit, baseSheetAudits }
}

export async function parseWorkbook(buffer: ArrayBuffer, fileName: string, selection: Period[] = ['YTD']): Promise<WorkbookResult> {
  return evaluateSource(await parseSource(buffer, fileName), selection)
}

let defaultSource: Promise<WorkbookSource> | null = null
export function invalidateDefaultSource() {
  defaultSource = null
}
function fetchDefaultSource() {
  if (!defaultSource) {
    const url = new URL(`${import.meta.env.BASE_URL}data/Base_CeNtro%20Partner.xlsx`, window.location.origin)
    defaultSource = fetch(url.toString(), { cache:'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`No fue posible cargar el Excel predeterminado (HTTP ${response.status}).`)
        return parseSource(await response.arrayBuffer(), 'Base_CeNtro Partner.xlsx')
      })
      .catch(error => { defaultSource = null; throw error })
  }
  return defaultSource
}

export async function loadDefault(selection: Period[] = ['YTD']) {
  return evaluateSource(await fetchDefaultSource(), selection)
}
