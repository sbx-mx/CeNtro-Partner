import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Area, IndicatorValue, LoadStage, Month, Period, Pillar, StoreResult, WorkbookResult } from '../types'
import { invalidateDefaultSource, loadDefault } from '../services/excelService'

const ALL_MONTHS: Month[] = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
const FILTER_STORAGE_KEY = 'centro-partner-filters-v2'
const LEGACY_FILTER_STORAGE_KEY = 'centro-partner-filters-v1'
type SavedFilters = { selectedPeriods?:Period[]; pillar?:Pillar; region?:string; dm?:string; area?:Area; storeType?:string; hideNewStores?:boolean }

function readSavedFilters(): SavedFilters {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) ?? localStorage.getItem(LEGACY_FILTER_STORAGE_KEY) ?? '{}') as SavedFilters
    const validPeriods = (saved.selectedPeriods ?? []).filter(period => period === 'YTD' || ALL_MONTHS.includes(period as Month))
    return {
      selectedPeriods:validPeriods.length ? validPeriods : undefined,
      pillar:['Todos','Partner','Cliente','Negocio'].includes(saved.pillar ?? '') ? saved.pillar : undefined,
      region:typeof saved.region === 'string' ? saved.region : undefined,
      dm:typeof saved.dm === 'string' ? saved.dm : undefined,
      area:['Todos','Ops','RH'].includes(saved.area ?? '') ? saved.area : undefined,
      storeType:typeof saved.storeType === 'string' ? saved.storeType : undefined,
      hideNewStores:typeof saved.hideNewStores === 'boolean' ? saved.hideNewStores : undefined,
    }
  } catch { return {} }
}

type Ctx = {
  data: WorkbookResult | null
  stores: StoreResult[]
  stage: LoadStage
  error: string
  selectedPeriods: Period[]
  togglePeriod: (value: Period) => void
  selectAllMonths: () => void
  clearMonths: () => void
  pillar: Pillar
  setPillar: (value: Pillar) => void
  region: string
  setRegion: (value: string) => void
  regions: string[]
  dm: string
  setDm: (value: string) => void
  dms: string[]
  area: Area
  setArea: (value: Area) => void
  storeType: string
  setStoreType: (value: string) => void
  storeTypes: string[]
  hideNewStores: boolean
  setHideNewStores: (value: boolean | ((current: boolean) => boolean)) => void
  newStoreCount: number
  visibleIndicatorCount: number
  retry: () => void
}

const DataContext = createContext<Ctx | null>(null)

function summarizeIndicators(indicators: IndicatorValue[]) {
  const fulfilled = indicators.reduce((sum, indicator) => sum + indicator.fulfilled, 0)
  const applicable = indicators.reduce((sum, indicator) => sum + indicator.applicable, 0)
  const failed = applicable - fulfilled
  const na = indicators.filter(indicator => indicator.applicable === 0).length
  return { fulfilled, failed, na, applicable, compliance: applicable ? fulfilled / applicable : 0 }
}

function openedLessThanOneYear(isoDate: string | null, today = new Date()) {
  if (!isoDate) return false
  const [year, month, day] = isoDate.split('-').map(Number)
  const opened = new Date(year, month - 1, day)
  if (!Number.isFinite(opened.getTime())) return false
  const cutoff = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())
  return opened > cutoff
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [savedFilters] = useState(readSavedFilters)
  const [data, setData] = useState<WorkbookResult | null>(null)
  const [stage, setStage] = useState<LoadStage>('idle')
  const [error, setError] = useState('')
  const [selectedPeriods, setSelectedPeriods] = useState<Period[]>(savedFilters.selectedPeriods ?? ['YTD'])
  const [pillar, setPillar] = useState<Pillar>(savedFilters.pillar ?? 'Todos')
  const [region, setRegion] = useState(savedFilters.region ?? 'Todas')
  const [dm, setDm] = useState(savedFilters.dm ?? 'Todos')
  const [area, setArea] = useState<Area>(savedFilters.area ?? 'Todos')
  const [storeType, setStoreType] = useState(savedFilters.storeType ?? 'Todos')
  const [hideNewStores, setHideNewStores] = useState(savedFilters.hideNewStores ?? false)

  const load = useCallback(async () => {
    setError('')
    setStage(current => current === 'ready' ? 'processing' : 'loading')
    try {
      const result = await loadDefault(selectedPeriods)
      setData(result)
      setStage('ready')
    } catch (cause) {
      console.error(cause)
      setError(cause instanceof Error ? cause.message : 'Error inesperado durante el procesamiento.')
      setStage('error')
    }
  }, [selectedPeriods])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    const reloadOnReconnect = () => void load()
    const reloadUpdatedWorkbook = () => {
      invalidateDefaultSource()
      void load()
    }
    window.addEventListener('online', reloadOnReconnect)
    window.addEventListener('centro:excel-updated', reloadUpdatedWorkbook)
    return () => {
      window.removeEventListener('online', reloadOnReconnect)
      window.removeEventListener('centro:excel-updated', reloadUpdatedWorkbook)
    }
  }, [load])

  useEffect(() => {
    try { localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({ selectedPeriods, pillar, region, dm, area, storeType, hideNewStores })) }
    catch { /* Persistencia progresiva; la aplicación sigue funcionando sin almacenamiento. */ }
  }, [selectedPeriods, pillar, region, dm, area, storeType, hideNewStores])

  const togglePeriod = useCallback((value: Period) => {
    setSelectedPeriods(current => {
      if (value === 'YTD') return ['YTD']
      const months = current.filter((period): period is Month => period !== 'YTD')
      const next = months.includes(value) ? months.filter(month => month !== value) : [...months, value]
      return ALL_MONTHS.filter(month => next.includes(month))
    })
  }, [])

  const selectAllMonths = useCallback(() => setSelectedPeriods([...ALL_MONTHS]), [])
  const clearMonths = useCallback(() => setSelectedPeriods([]), [])

  const regions = useMemo(
    () => Array.from(new Set((data?.stores ?? []).map(store => store.Región).filter(Boolean))).sort((a,b) => a.localeCompare(b,'es')),
    [data],
  )

  const dms = useMemo(
    () => Array.from(new Set((data?.stores ?? [])
      .filter(store => region === 'Todas' || store.Región === region)
      .map(store => store.DM)
      .filter(Boolean))).sort((a,b) => a.localeCompare(b,'es')),
    [data, region],
  )

  const storeTypes = useMemo(
    () => Array.from(new Set((data?.stores ?? []).map(store => store.TipoTienda).filter(Boolean))).sort((a,b) => a.localeCompare(b,'es')),
    [data],
  )

  useEffect(() => {
    if (dm !== 'Todos' && !dms.includes(dm)) setDm('Todos')
  }, [dm, dms])

  useEffect(() => {
    if (storeType !== 'Todos' && !storeTypes.includes(storeType)) setStoreType('Todos')
  }, [storeType, storeTypes])

  const newStoreCount = useMemo(() => (data?.stores ?? []).filter(store =>
    (region === 'Todas' || store.Región === region)
    && (dm === 'Todos' || store.DM === dm)
    && (storeType === 'Todos' || store.TipoTienda === storeType)
    && openedLessThanOneYear(store.FechaApertura)
  ).length, [data, region, dm, storeType])

  const stores = useMemo(() => {
    const filteredByDirectory = (data?.stores ?? []).filter(store =>
      (region === 'Todas' || store.Región === region)
      && (dm === 'Todos' || store.DM === dm)
      && (storeType === 'Todos' || store.TipoTienda === storeType)
      && (!hideNewStores || !openedLessThanOneYear(store.FechaApertura))
    )
    return filteredByDirectory
      .map(store => {
        const pillarIndicators = pillar === 'Todos' ? store.indicators : store.indicators.filter(indicator => indicator.pillar === pillar)
        const indicators = area === 'Todos' ? pillarIndicators : pillarIndicators.filter(indicator => indicator.areas.includes(area))
        return { ...store, indicators, ...summarizeIndicators(indicators) }
      })
      .sort((a,b) => b.compliance - a.compliance || b.fulfilled - a.fulfilled || a.CeCo.localeCompare(b.CeCo))
      .map((store,index) => ({ ...store, rank:index + 1 }))
  }, [data, region, dm, storeType, hideNewStores, pillar, area])

  const visibleIndicatorCount = useMemo(() => {
    const indicators = data?.stores[0]?.indicators ?? []
    return indicators.filter(indicator =>
      (pillar === 'Todos' || indicator.pillar === pillar)
      && (area === 'Todos' || indicator.areas.includes(area))
    ).length
  }, [data, pillar, area])

  return <DataContext.Provider value={{
    data, stores, stage, error, selectedPeriods, togglePeriod, selectAllMonths, clearMonths,
    pillar, setPillar, region, setRegion, regions, dm, setDm, dms, area, setArea,
    storeType, setStoreType, storeTypes, hideNewStores, setHideNewStores, newStoreCount, visibleIndicatorCount,
    retry:() => void load(),
  }}>{children}</DataContext.Provider>
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('DataProvider requerido')
  return context
}
