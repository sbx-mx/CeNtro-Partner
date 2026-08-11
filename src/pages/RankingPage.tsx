import { useDeferredValue, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Building2, CalendarOff, CircleGauge, FileDown, ListChecks, Minus, MonitorUp, Search, Trophy, X } from 'lucide-react'
import { LoadingPanel } from '../components/LoadingPanel'
import { RecoveryPanel } from '../components/RecoveryPanel'
import { StatCard } from '../components/StatCard'
import { useData } from '../components/DataContext'
import type { IndicatorValue, Month, Period, Pillar, StoreResult } from '../types'

const months: Month[] = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const pillars: Pillar[] = ['Todos','Partner','Cliente','Negocio']
const percentIndicators = new Set(['Rotacion','Estabilidad 12M','Desempeño','Conexion','Bebida','SR%','VMT%','ppto%','AT%','COGS'])
const clientIndicatorOrder = ['NPS','Conexion','Desempeño','Bebida','SR%']
const visibleIndicatorNames: Record<string,string> = {
  'Rotacion':'Rotación',
  'Estabilidad 12M':'E-12M',
  'Conexion':'Conexión',
}

type SortDirection = 'desc'|'asc'
type SortColumn = 'rank'|'compliance'|'Efectividad'|'Rotacion'|'Conexion'|'Bebida'|'OMT'|'COGS'|'Segundas Cx'

function isExplicitNA(value: unknown) { return typeof value === 'string' && /^\s*n\/?a\s*$/i.test(value) }
function formatValue(item: IndicatorValue) {
  if (item.displayValue) return item.displayValue
  if (item.status === 'blank') return ''
  if (item.status === 'na' || isExplicitNA(item.value)) return 'N/A'
  if (typeof item.value === 'number') {
    if (percentIndicators.has(item.indicator)) {
      const ratio = Math.abs(item.value) > 1.5 ? item.value / 100 : item.value
      const decimals = item.indicator === 'Estabilidad 12M' ? 0 : 1
      return `${(ratio * 100).toFixed(decimals)}%`
    }
    if (item.indicator === 'OMT') return new Intl.NumberFormat('es-MX', { maximumFractionDigits:0 }).format(Math.round(item.value))
    if (item.indicator === 'Segundas Cx') {
      const truncated = Math.trunc(item.value * 10) / 10
      return new Intl.NumberFormat('es-MX', { minimumFractionDigits:1, maximumFractionDigits:1 }).format(truncated)
    }
    return new Intl.NumberFormat('es-MX', { maximumFractionDigits:2 }).format(item.value)
  }
  return String(item.value ?? '')
}
function stateClass(item: IndicatorValue) {
  if (item.status === 'cumple') return 'indicator-cell is-ok'
  if (item.status === 'no-cumple') return 'indicator-cell is-bad'
  if (item.status === 'na') return 'indicator-cell is-na'
  return 'indicator-cell'
}
function selectionLabel(selection: Period) { return selection === 'YTD' ? 'YTD' : selection.toUpperCase() }
function visibleIndicatorName(indicator: string) {
  return visibleIndicatorNames[indicator] ?? indicator
}
function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLocaleLowerCase('es-MX')
}
function orderIndicators(indicators: IndicatorValue[]) {
  return [...indicators].sort((a,b) => {
    if (a.pillar !== 'Cliente' || b.pillar !== 'Cliente') return 0
    return clientIndicatorOrder.indexOf(a.indicator) - clientIndicatorOrder.indexOf(b.indicator)
  })
}
type ComplianceQuartiles = { q1:number; q2:number; q3:number }

function quantile(sortedValues: number[], percentile: number) {
  if (!sortedValues.length) return 0
  const position = (sortedValues.length - 1) * percentile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sortedValues[lower]
  const weight = position - lower
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight
}

function complianceQuartiles(values: number[]): ComplianceQuartiles {
  const sortedValues = [...values].sort((a,b) => a - b)
  return {
    q1:quantile(sortedValues, 0.25),
    q2:quantile(sortedValues, 0.50),
    q3:quantile(sortedValues, 0.75),
  }
}

function complianceQuartileStyle(value: number, quartiles: ComplianceQuartiles): CSSProperties {
  const palette = value >= quartiles.q3
    ? { surface:'#dff3e8', fill:'#087443', ink:'#064e33', border:'#8bc9a9' }
    : value >= quartiles.q2
      ? { surface:'#fff3bf', fill:'#d6aa00', ink:'#594900', border:'#dfc34d' }
      : value >= quartiles.q1
        ? { surface:'#ffe0b2', fill:'#df7500', ink:'#713800', border:'#e7a251' }
        : { surface:'#f9d6d5', fill:'#c9362b', ink:'#7b1710', border:'#df8e89' }

  return {
    '--compliance-surface':palette.surface,
    '--compliance-fill':palette.fill,
    '--compliance-ink':palette.ink,
    '--compliance-border':palette.border,
    '--compliance-progress':`${Math.max(0, Math.min(100, value * 100))}%`,
  } as CSSProperties
}

function PeriodSelector({ value, periods, onChange }: { value:Period; periods:Period[]; onChange:(value:Period) => void }) {
  const availableMonths = months.filter(month => periods.includes(month))
  return <div className="period-selector mt-1" aria-label="Periodo del ranking">
    <button type="button" className={`period-ytd ${value === 'YTD' ? 'is-active' : ''}`} aria-pressed={value === 'YTD'} onClick={() => onChange('YTD')}>YTD</button>
    <select className="control period-month" aria-label="Seleccionar un mes" value={value === 'YTD' ? '' : value} onChange={event => onChange(event.target.value as Month)}>
      <option value="" disabled>Mes</option>
      {availableMonths.map(month => <option key={month} value={month}>{month.toUpperCase()}</option>)}
    </select>
  </div>
}

function previousLabel(item: IndicatorValue) {
  if (!item.previousMonth || item.previousValue === undefined) return ''
  return formatValue({ ...item, value:item.previousValue, displayValue:item.previousDisplayValue, status:item.previousStatus ?? 'blank' })
}

function complianceComparison(store: StoreResult) {
  const previousMonth = store.indicators.find(indicator => indicator.previousMonth)?.previousMonth
  if (!previousMonth) return null
  const previousApplicable = store.indicators.reduce((sum,indicator) => sum + (indicator.previousApplicable ?? 0), 0)
  const previousFulfilled = store.indicators.reduce((sum,indicator) => sum + (indicator.previousFulfilled ?? 0), 0)
  if (!previousApplicable) return null
  const previousCompliance = previousFulfilled / previousApplicable
  const deltaPoints = (store.compliance - previousCompliance) * 100
  return { previousMonth, previousCompliance, deltaPoints }
}

export function RankingPage() {
  const {
    data, stores, stage, error, retry, selectedPeriod, setSelectedPeriod,
    pillar, setPillar, region, setRegion, regions, dm, setDm, dms, visibleIndicatorCount,
    storeType, setStoreType, storeTypes, hideNewStores, setHideNewStores, newStoreCount,
  } = useData()
  const [sortColumn, setSortColumn] = useState<SortColumn>('rank')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [presentationMode, setPresentationMode] = useState(false)
  const [storeQuery, setStoreQuery] = useState('')
  const [showIndicatorTrends, setShowIndicatorTrends] = useState(() => localStorage.getItem('centro-partner-show-trends') !== 'false')
  const deferredStoreQuery = useDeferredValue(storeQuery)

  useEffect(() => {
    try { localStorage.setItem('centro-partner-show-trends', String(showIndicatorTrends)) }
    catch { /* La preferencia visual no bloquea la navegación. */ }
  }, [showIndicatorTrends])

  const displayedIndicators = useMemo(() => orderIndicators(
    stores[0]?.indicators
      ?? data?.stores[0]?.indicators.filter(indicator => pillar === 'Todos' || indicator.pillar === pillar)
      ?? [],
  ), [stores, data, pillar])

  const visibleStores = useMemo(() => {
    const query = normalizeSearch(deferredStoreQuery)
    if (!query) return stores
    return stores.filter(store => normalizeSearch(`${store.Tienda} ${store.CeCo}`).includes(query))
  }, [stores, deferredStoreQuery])

  const sortedStores = useMemo(() => [...visibleStores].sort((a,b) => {
    if (sortColumn === 'compliance') {
      const difference = sortDirection === 'desc' ? b.compliance - a.compliance : a.compliance - b.compliance
      return difference || a.rank - b.rank
    }
    if (sortColumn !== 'rank') {
      const valueFor = (store: StoreResult) => {
        const item = store.indicators.find(indicator => indicator.indicator === sortColumn)
        return typeof item?.value === 'number' ? item.value : null
      }
      const aValue = valueFor(a)
      const bValue = valueFor(b)
      if (aValue === null && bValue === null) return a.rank - b.rank
      if (aValue === null) return 1
      if (bValue === null) return -1
      const difference = sortDirection === 'desc' ? bValue - aValue : aValue - bValue
      return difference || a.rank - b.rank
    }
    return sortDirection === 'desc' ? b.rank - a.rank : a.rank - b.rank
  }), [visibleStores, sortColumn, sortDirection])

  const quartiles = useMemo(
    () => complianceQuartiles(visibleStores.map(store => store.compliance)),
    [visibleStores],
  )

  const bestVisibleStore = useMemo(() => [...visibleStores].sort((a,b) =>
    b.compliance - a.compliance
    || b.applicable - a.applicable
    || a.Tienda.trim().localeCompare(b.Tienda.trim(), 'es')
  )[0], [visibleStores])

  if (stage !== 'ready' && stage !== 'error' && !data) return <LoadingPanel stage={stage} />
  if (stage === 'error') return <RecoveryPanel message={error} onRetry={retry} />

  const average = visibleStores.length ? visibleStores.reduce((sum,store) => sum + store.compliance, 0) / visibleStores.length : 0
  const activeGroups = pillar === 'Todos' ? (['Partner','Cliente','Negocio'] as const) : ([pillar] as const)
  const title = selectionLabel(selectedPeriod)
  function toggleIndicatorSort(indicator: SortColumn) {
    setSortDirection(current => sortColumn === indicator ? (current === 'asc' ? 'desc' : 'asc') : 'asc')
    setSortColumn(indicator)
  }

  function toggleComplianceSort() {
    setSortDirection(current => sortColumn === 'compliance' ? (current === 'desc' ? 'asc' : 'desc') : 'desc')
    setSortColumn('compliance')
  }

  return <div className={presentationMode ? 'presentation-mode' : undefined}>
    <section className="dashboard-summary mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Tiendas visibles" value={visibleStores.length} icon={Building2} />
      <StatCard label="Total de indicadores" value={visibleIndicatorCount} icon={ListChecks} />
      <StatCard label="Promedio de cumplimiento" value={`${(average * 100).toFixed(1)}%`} icon={CircleGauge} />
      <StatCard label="Mejor tienda" value={bestVisibleStore?.Tienda.trim() ?? '—'} icon={Trophy} />
    </section>

    <section className="ranking-filters card mb-5 py-4">
      <div className="executive-filter-heading">
        <div className="min-w-48"><p className="eyebrow">Vista ejecutiva</p><h2 className="section-title">Resultados {title}</h2>{selectedPeriod !== 'YTD' && <p className="period-note">Las flechas muestran variación vs el mes anterior.</p>}</div>
        <label className="ranking-search ranking-search-top" aria-label="Buscar tienda">
          <Search size={18} aria-hidden="true" />
          <input value={storeQuery} onChange={event => setStoreQuery(event.target.value)} placeholder="Buscar tienda o CeCo" autoComplete="off" />
          {storeQuery && <button type="button" onClick={() => setStoreQuery('')} aria-label="Limpiar búsqueda"><X size={15} aria-hidden="true" /></button>}
        </label>
      </div>
      <div className="mt-4 grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <div className="filter-label">Mes
            <PeriodSelector value={selectedPeriod} periods={data?.periods ?? ['YTD']} onChange={setSelectedPeriod} />
          </div>
          <label className="filter-label">Pilar
            <select value={pillar} onChange={event => setPillar(event.target.value as Pillar)} className="control">{pillars.map(value => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="filter-label">Región
            <select value={region} onChange={event => setRegion(event.target.value)} className="control"><option>Todas</option>{regions.map(value => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="filter-label">Distrito
            <select value={dm} onChange={event => setDm(event.target.value)} className="control"><option>Todos</option>{dms.map(value => <option key={value}>{value}</option>)}</select>
          </label>
          <label className="filter-label">Tipo de tienda
            <select value={storeType} onChange={event => setStoreType(event.target.value)} className="control"><option>Todos</option>{storeTypes.map(value => <option key={value} value={value}>{value === '-' ? 'Sin clasificar' : value.replace('_',' ')}</option>)}</select>
          </label>
      </div>
    </section>

    <section className="card overflow-hidden p-0">
      <div className="section-heading border-b border-slate-200 px-5 py-4">
        <div><p className="eyebrow">Clasificación dinámica</p><h2 className="section-title">Ranking Regional</h2></div>
        <div className="flex items-center gap-2">
          {presentationMode ? <button type="button" onClick={() => setPresentationMode(false)} className="presentation-exit-button"><X size={15} />Salir de presentación</button> : <button type="button" onClick={() => setPresentationMode(true)} className="presentation-button"><MonitorUp size={15} />Modo Presentación</button>}
          <button
            type="button"
            onClick={() => setShowIndicatorTrends(current => !current)}
            className={`trend-toggle ${showIndicatorTrends ? 'is-active' : ''}`}
            aria-pressed={showIndicatorTrends}
            disabled={selectedPeriod === 'YTD'}
            title={selectedPeriod === 'YTD' ? 'La comparación mensual no aplica en YTD' : 'Mostrar u ocultar flechas por indicador'}
          ><ArrowUpDown size={15} />{showIndicatorTrends ? 'Ocultar flechas' : 'Mostrar flechas'}</button>
          <button type="button" onClick={() => setHideNewStores(current => !current)} className={`store-age-toggle ${hideNewStores ? 'is-active' : ''}`} aria-pressed={hideNewStores} title={`${newStoreCount} tiendas tienen menos de un año desde su fecha de apertura`}><CalendarOff size={15} />{hideNewStores ? 'Mostrar todas' : 'Ocultar tiendas < 1 año'}</button>
          <button type="button" onClick={() => window.print()} className="secondary-ranking-control pdf-button"><FileDown size={15} />Guardar PDF</button>
          <span className="secondary-ranking-control summary-chip">{visibleStores.length} tiendas</span>
        </div>
      </div>
      <div className="ranking-scroll"><table className="ranking-table">
        <thead><tr className="group-row"><th rowSpan={2} className="sticky-col store-col store-header">Tienda</th>
          {activeGroups.map(group => {
            const count = displayedIndicators.filter(indicator => indicator.pillar === group).length
            return count ? <th key={group} colSpan={count} className={`group-${group.toLowerCase()}`}>{group}</th> : null
          })}<th colSpan={1} className="group-gestion">Gestión</th></tr>
          <tr className="indicator-header-row">{displayedIndicators.map(indicator => {
            const sortable = ['Efectividad','Rotacion','Conexion','Bebida','OMT','COGS','Segundas Cx'].includes(indicator.indicator)
            const active = sortColumn === indicator.indicator
            return <th key={indicator.indicator} className={`indicator-header ${sortable ? 'is-sortable' : ''}`}>
              {sortable ? <button type="button" onClick={() => toggleIndicatorSort(indicator.indicator as SortColumn)} className="indicator-sort-button" title={active && sortDirection === 'asc' ? 'Ordenar de mayor a menor' : 'Ordenar de menor a mayor'}>
                <span className="indicator-sort-label">{visibleIndicatorName(indicator.indicator)}</span><span className="indicator-sort-icon" aria-hidden="true">{active && (sortDirection === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
              </button> : <span className="indicator-static-label">{visibleIndicatorName(indicator.indicator)}</span>}
            </th>
          })}<th className="compliance-header"><button type="button" onClick={toggleComplianceSort} className="inline-flex items-center gap-1.5" title={sortColumn === 'compliance' && sortDirection === 'desc' ? 'Ordenar de menor a mayor' : 'Ordenar de mayor a menor'}>Cumplimiento {sortColumn === 'compliance' && sortDirection === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button></th></tr></thead>
        <tbody>{sortedStores.map(store => {
          const indicatorMap = new Map(store.indicators.map(indicator => [indicator.indicator, indicator]))
          return <tr key={store.CeCo}><td className="sticky-col store-col font-semibold text-slate-900"><span className="store-name">{store.Tienda.trim()}</span></td>
            {displayedIndicators.map(indicator => {
              const current = indicatorMap.get(indicator.indicator) ?? indicator
              const trendTitle = current.previousMonth ? `Mes anterior ${current.previousMonth.toUpperCase()}: ${previousLabel(current) || 'sin dato'}` : current.detailValue
              return <td key={current.indicator} className={stateClass(current)} title={trendTitle}>
                <span className="indicator-value">{formatValue(current)}</span>
                {showIndicatorTrends && current.trend && current.trend !== 'unavailable' && <span className={`trend-marker is-${current.trend}`} aria-label={trendTitle}>
                  {current.trend === 'up' ? <ArrowUp size={11} /> : current.trend === 'down' ? <ArrowDown size={11} /> : <Minus size={11} />}
                </span>}
              </td>
            })}{(() => {
              const comparison = complianceComparison(store)
              return <td
              className="compliance-cell"
              style={complianceQuartileStyle(store.compliance, quartiles)}
              title={comparison
                ? `Mes anterior ${comparison.previousMonth.toUpperCase()}: ${(comparison.previousCompliance * 100).toFixed(1)}% · Variación ${comparison.deltaPoints >= 0 ? '+' : ''}${comparison.deltaPoints.toFixed(1)} puntos porcentuales`
                : `Cuartiles visibles: Q1 ${(quartiles.q1 * 100).toFixed(1)}% · Q2 ${(quartiles.q2 * 100).toFixed(1)}% · Q3 ${(quartiles.q3 * 100).toFixed(1)}%`}
            ><div className="compliance-meter" aria-label={`Cumplimiento ${(store.compliance * 100).toFixed(1)}%`}><span className="compliance-progress" aria-hidden="true" /><span className="compliance-value">{(store.compliance * 100).toFixed(1)}%</span></div>
              {comparison && <span className={`compliance-comparison ${Math.abs(comparison.deltaPoints) < .05 ? 'is-flat' : comparison.deltaPoints > 0 ? 'is-up' : 'is-down'}`}>
                {Math.abs(comparison.deltaPoints) < .05 ? 'Se mantiene' : `${comparison.deltaPoints > 0 ? '+' : ''}${comparison.deltaPoints.toFixed(1)} pp`} <small>vs {comparison.previousMonth.toUpperCase()}</small>
              </span>}
            </td>
            })()}</tr>
        })}{!sortedStores.length && <tr><td colSpan={displayedIndicators.length + 2} className="empty-ranking">No se encontraron tiendas con esa búsqueda.</td></tr>}</tbody>
      </table></div>
    </section>
  </div>
}
