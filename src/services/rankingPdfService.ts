import type { CellDef, RowInput, Styles } from 'jspdf-autotable'

export type PdfTone = 'ok' | 'bad' | 'na' | 'neutral' | 'average' | 'up' | 'down' | 'flat'
  | 'compliance-top' | 'compliance-upper' | 'compliance-lower' | 'compliance-bottom'

export interface RankingPdfCell {
  value: string
  tone?: PdfTone
}

export interface RankingPdfIndicator {
  name: string
  group: string
}

export interface RankingPdfRow {
  store: string
  indicators: RankingPdfCell[]
  compliance: RankingPdfCell
  comparison: RankingPdfCell
}

export interface RankingPdfInput {
  period: string
  filters: string[]
  indicators: RankingPdfIndicator[]
  rows: RankingPdfRow[]
  averageRow?: RankingPdfRow
  logoUrl?: string
}

type Rgb = [number, number, number]
const ink: Rgb = [23, 54, 43]
const green: Rgb = [0, 98, 65]
const deepGreen: Rgb = [0, 76, 52]
const softRule: Rgb = [202, 220, 212]
const white: Rgb = [255, 255, 255]
const clientGreen: Rgb = [24, 121, 78]
const businessGreen: Rgb = [47, 107, 86]

function safeFilePart(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 52)
}

function cellStyle(tone: PdfTone = 'neutral'): Partial<Styles> {
  if (tone === 'compliance-top') return { fillColor:[223, 243, 232], textColor:[6, 78, 51], lineColor:[139, 201, 169], lineWidth:.45, fontStyle:'bold' }
  if (tone === 'compliance-upper') return { fillColor:[255, 243, 191], textColor:[89, 73, 0], lineColor:[223, 195, 77], lineWidth:.45, fontStyle:'bold' }
  if (tone === 'compliance-lower') return { fillColor:[255, 224, 178], textColor:[113, 56, 0], lineColor:[231, 162, 81], lineWidth:.45, fontStyle:'bold' }
  if (tone === 'compliance-bottom') return { fillColor:[249, 214, 213], textColor:[123, 23, 16], lineColor:[223, 142, 137], lineWidth:.45, fontStyle:'bold' }
  if (tone === 'ok') return { fillColor:[232, 245, 238], textColor:[8, 116, 67], fontStyle:'bold' }
  if (tone === 'bad') return { fillColor:[253, 236, 236], textColor:[180, 35, 24], fontStyle:'bold' }
  if (tone === 'na') return { fillColor:[238, 242, 246], textColor:[100, 116, 139], fontStyle:'bold' }
  if (tone === 'average') return { fillColor:[229, 243, 236], textColor:deepGreen, fontStyle:'bold' }
  if (tone === 'up') return { fillColor:[242, 250, 246], textColor:[8, 116, 67], fontStyle:'bold' }
  if (tone === 'down') return { fillColor:[255, 246, 245], textColor:[180, 35, 24], fontStyle:'bold' }
  if (tone === 'flat') return { fillColor:[248, 250, 249], textColor:[82, 99, 92], fontStyle:'bold' }
  return { fillColor:[255, 255, 255], textColor:ink }
}

function pdfCell(cell: RankingPdfCell): CellDef {
  return { content:cell.value || '—', styles:cellStyle(cell.tone) }
}

function buildBodyRow(row: RankingPdfRow, average = false, showComparison = true): RowInput {
  return [
    {
      content:row.store,
      styles:average
        ? { ...cellStyle('average'), halign:'left' }
        : { fillColor:[255, 253, 250], textColor:[18, 32, 27], fontStyle:'bold', halign:'left' },
    },
    ...row.indicators.map(pdfCell),
    pdfCell(row.compliance),
    ...(showComparison ? [pdfCell(row.comparison)] : []),
  ]
}

function groupedHeader(indicators: RankingPdfIndicator[], showComparison: boolean): RowInput[] {
  return [
    [
      { content:'#  TIENDA', styles:{ fillColor:deepGreen, textColor:white } },
      ...indicators.map(indicator => ({
        content:indicator.name,
        styles:{
          fillColor:indicator.group === 'Partner' ? green : indicator.group === 'Cliente' ? clientGreen : businessGreen,
          textColor:white,
        },
      })),
      { content:'CUMPLIMIENTO', styles:{ fillColor:deepGreen, textColor:white } },
      ...(showComparison ? [{ content:'VS MES ANTERIOR', styles:{ fillColor:deepGreen, textColor:white } }] : []),
    ],
  ]
}

function storeColumnWidth(rows: RankingPdfRow[], available: number, indicatorCount: number, fixedWidth: number) {
  const longest = Math.max(10, ...rows.map(row => row.store.length))
  const contentWidth = Math.min(138, Math.max(112, 52 + longest * 1.45))
  const minimumIndicators = indicatorCount * 28
  return Math.min(contentWidth, Math.max(108, available - minimumIndicators - fixedWidth))
}

async function imageDataUrl(source?: string) {
  if (!source) return null
  if (source.startsWith('data:image/')) return source
  const response = await fetch(source, { cache:'force-cache' })
  if (!response.ok) throw new Error(`No se pudo cargar el logotipo: HTTP ${response.status}`)
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Formato de imagen no válido'))
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el logotipo'))
    reader.readAsDataURL(blob)
  })
}

export async function createRankingPdf(input: RankingPdfInput) {
  const [{ jsPDF }, { default:autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ orientation:'landscape', unit:'pt', format:'letter', compress:true, putOnlyUsedFonts:true })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 20
  const tableWidth = pageWidth - marginX * 2
  const showComparison = input.period.trim().toUpperCase() !== 'YTD'
  const complianceWidth = 66
  const comparisonWidth = showComparison ? 74 : 0
  const allRows = input.averageRow ? [input.averageRow, ...input.rows] : input.rows
  const storeWidth = storeColumnWidth(allRows, tableWidth, input.indicators.length, complianceWidth + comparisonWidth)
  const fontSize = input.indicators.length >= 14 ? 5.5 : input.indicators.length >= 10 ? 6.2 : 7
  const headerFontSize = Math.max(5.1, fontSize - .25)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(headerFontSize)
  const indicatorSpace = tableWidth - storeWidth - complianceWidth - comparisonWidth
  const naturalIndicatorWidths = input.indicators.map(indicator => Math.max(26, doc.getTextWidth(indicator.name) + 5.4))
  const naturalWidthTotal = naturalIndicatorWidths.reduce((sum, width) => sum + width, 0)
  const distributableSpace = Math.max(0, indicatorSpace - naturalWidthTotal)
  const indicatorWidths = naturalIndicatorWidths.map(width => width + distributableSpace / Math.max(1, input.indicators.length))
  const columnStyles: Record<number, Partial<Styles>> = {
    0:{ cellWidth:storeWidth, overflow:'linebreak', halign:'left' },
    [input.indicators.length + 1]:{ cellWidth:complianceWidth },
  }
  if (showComparison) columnStyles[input.indicators.length + 2] = { cellWidth:comparisonWidth, overflow:'linebreak' }
  input.indicators.forEach((_, index) => { columnStyles[index + 1] = { cellWidth:indicatorWidths[index] } })

  const filterLine = input.filters.filter(Boolean).join(' · ')
  const logo = await imageDataUrl(input.logoUrl).catch(() => null)
  const drawPageHeader = () => {
    doc.setTextColor(...deepGreen)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('CeNtro Partner · Ranking Regional', marginX, 19, { maxWidth:tableWidth - 38 })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(72, 96, 86)
    doc.text(`Resultados ${input.period}${filterLine ? ` · ${filterLine}` : ''}`, marginX, 32, { maxWidth:tableWidth - 38 })
    if (logo) doc.addImage(logo, 'PNG', pageWidth - marginX - 28, 6, 28, 28, 'centro-partner-logo', 'FAST')
    doc.setDrawColor(...softRule)
    doc.setLineWidth(.5)
    doc.line(marginX, 39, pageWidth - marginX, 39)
  }
  const charsPerStoreLine = Math.max(18, Math.floor(storeWidth / (fontSize * .58)))
  const bodyEntries = [
    ...(input.averageRow ? [{ row:input.averageRow, tableRow:buildBodyRow(input.averageRow, true, showComparison) }] : []),
    ...input.rows.map(row => ({ row, tableRow:buildBodyRow(row, false, showComparison) })),
  ]
  const bodyPages: RowInput[][] = []
  let pageRows: RowInput[] = []
  let usedHeight = 0
  const bodyHeightBudget = pageHeight - 49 - 38 - 22
  for (const entry of bodyEntries) {
    const storeLines = Math.max(1, Math.ceil(entry.row.store.length / charsPerStoreLine))
    const comparisonLines = showComparison ? Math.max(1, entry.row.comparison.value.split('\n').length) : 1
    const estimatedHeight = Math.max(15, Math.max(storeLines, comparisonLines) * fontSize * 1.25 + 6.2)
    if (pageRows.length && usedHeight + estimatedHeight > bodyHeightBudget) {
      bodyPages.push(pageRows)
      pageRows = []
      usedHeight = 0
    }
    pageRows.push(entry.tableRow)
    usedHeight += estimatedHeight
  }
  if (pageRows.length || !bodyPages.length) bodyPages.push(pageRows)

  bodyPages.forEach((rows, pageIndex) => {
    if (pageIndex) doc.addPage('letter', 'landscape')
    drawPageHeader()
    autoTable(doc, {
      head:groupedHeader(input.indicators, showComparison),
      body:rows,
      startY:49,
      margin:{ top:49, right:marginX, bottom:38, left:marginX },
      tableWidth,
      theme:'grid',
      showHead:'firstPage',
      pageBreak:'avoid',
      rowPageBreak:'avoid',
      styles:{
        font:'helvetica',
        fontSize,
        cellPadding:{ top:3.1, right:2.1, bottom:3.1, left:2.1 },
        lineWidth:.25,
        lineColor:[220, 231, 226],
        textColor:ink,
        valign:'middle',
        halign:'center',
        overflow:'linebreak',
      },
      headStyles:{
        fillColor:[240, 245, 242],
        textColor:[43, 75, 63],
        fontStyle:'bold',
        fontSize:headerFontSize,
        minCellHeight:18,
        lineColor:[187, 210, 200],
        overflow:'hidden',
      },
      bodyStyles:{ minCellHeight:15 },
      columnStyles,
    })
  })

  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...softRule)
    doc.setLineWidth(.5)
    doc.line(marginX, pageHeight - 25, pageWidth - marginX, pageHeight - 25)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(49, 92, 75)
    doc.text('Diseñado por Jorge Alcantar Aguiar & Enrique César Flores', marginX, pageHeight - 13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...green)
    doc.text('JUNTÉMONOS MÁS · #GreenApronService', pageWidth / 2, pageHeight - 13, { align:'center' })
    doc.setTextColor(49, 92, 75)
    doc.text(`Página ${page} de ${totalPages}`, pageWidth - marginX, pageHeight - 13, { align:'right' })
  }

  const nameParts = ['CeNtro_Partner', input.period, ...input.filters].map(safeFilePart).filter(Boolean)
  const fileBase = (nameParts.join('_') || 'CeNtro_Partner').slice(0, 180).replace(/_+$/g, '')
  const fileName = `${fileBase}.pdf`
  doc.setProperties({
    title:fileName.replace(/\.pdf$/i, ''),
    subject:'Ranking Regional filtrado',
    author:'Jorge Alcantar Aguiar & Enrique César Flores',
    creator:'CeNtro Partner',
  })
  return { doc, fileName, totalPages }
}

export async function downloadRankingPdf(input: RankingPdfInput) {
  const result = await createRankingPdf(input)
  result.doc.save(result.fileName)
  return { fileName:result.fileName, totalPages:result.totalPages }
}
