import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquare } from 'lucide-react'

type Campaign = { primary:string; accent:string; primaryColor:string; accentColor:string; style:string; regionLabel:string; suggestionsUrl:string }
const defaultCampaign: Campaign = {
  primary:'JUNTÉMONOS', accent:'más', primaryColor:'#006241', accentColor:'#111111',
  style:'corporativo-expresivo', regionLabel:'#JUNTÉMONOSCENTROS',
  suggestionsUrl:'https://wa.me/?text=Sugerencia%20para%20CeNtro%20Partner%3A%20',
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [campaign, setCampaign] = useState(defaultCampaign)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const excelHashRef = useRef<string | null>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/campaign.json`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => setCampaign({ ...defaultCampaign, ...(data?.campaign ?? {}) }))
      .catch(() => setCampaign(defaultCampaign))
  }, [])

  useEffect(() => {
    let active = true
    const checkExcelVersion = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/excel-release.json?t=${Date.now()}`, { cache:'no-store' })
        if (!response.ok) return
        const release = await response.json() as { excelSha256?:string }
        if (!active || !release.excelSha256) return
        if (excelHashRef.current && excelHashRef.current !== release.excelSha256) {
          window.dispatchEvent(new Event('centro:excel-updated'))
        }
        excelHashRef.current = release.excelSha256
      } catch { /* La navegación continúa aunque la comprobación no esté disponible. */ }
    }
    const checkWhenVisible = () => { if (document.visibilityState === 'visible') void checkExcelVersion() }
    void checkExcelVersion()
    const interval = window.setInterval(() => void checkExcelVersion(), 300_000)
    document.addEventListener('visibilitychange', checkWhenVisible)
    return () => {
      active = false
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', checkWhenVisible)
    }
  }, [])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    const showUpdate = () => setUpdateAvailable(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('centro:update-available', showUpdate)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('centro:update-available', showUpdate)
    }
  }, [])

  const applyUpdate = () => window.__CENTRO_UPDATE_SW__?.().catch(console.error)

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Logotipo CeNtro Partner" width="56" height="56" decoding="async" loading="eager" fetchPriority="high" className="app-logo h-14 w-14 shrink-0 object-contain" />
          <div className="campaign-heading" data-style={campaign.style}>
            <div className="campaign-lockup" aria-label={`${campaign.primary} ${campaign.accent}`}>
              <span style={{ color:campaign.primaryColor }}>{campaign.primary}</span>
              <span style={{ color:campaign.accentColor }}>{campaign.accent}</span>
            </div>
            <p className="campaign-region" style={{ color:campaign.primaryColor }}>{campaign.regionLabel}</p>
            <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">Ranking Regional</h1>
          </div>
        </div>
        <div className="app-status" aria-live="polite">
          {!online && <span className="network-status is-offline">Sin conexión</span>}
          {updateAvailable && <button type="button" className="update-status" onClick={applyUpdate}>Nueva versión</button>}
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-[1800px] p-4 sm:p-6 lg:p-8">{children}</main>
    <footer className="app-footer">
      <div className="footer-purpose">
        <p className="design-credit"><strong>Diseñado por Jorge Alcantar Aguiar &amp; Enrique César Flores</strong></p>
        <p>Herramienta interna para impulsar decisiones ágiles, ejecución consistente y mejora continua.</p>
        <p className="footer-tags">JUNTÉMONOS MÁS · #GreenApronService</p>
      </div>
      <a className="suggestions-link" href={campaign.suggestionsUrl} target="_blank" rel="noopener noreferrer" aria-label="Enviar sugerencias por WhatsApp">
        <MessageSquare size={17} aria-hidden="true" />
        Sugerencias y/o recomendaciones
      </a>
    </footer>
  </div>
}
