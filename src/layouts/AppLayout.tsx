import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MessageSquare, X } from 'lucide-react'

type Campaign = { primary:string; accent:string; primaryColor:string; accentColor:string; style:string; regionLabel:string }
// Configuración centralizada: agrega aquí un destino autorizado cuando exista.
const SUGGESTIONS_CHANNEL_URL = ''
const defaultCampaign: Campaign = {
  primary:'JUNTÉMONOS', accent:'más', primaryColor:'#006241', accentColor:'#111111',
  style:'corporativo-expresivo', regionLabel:'#JUNTÉMONOSCENTROS',
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [campaign, setCampaign] = useState(defaultCampaign)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const suggestionsCloseRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/campaign.json`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then(data => setCampaign({ ...defaultCampaign, ...(data?.campaign ?? {}) }))
      .catch(() => setCampaign(defaultCampaign))
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

  useEffect(() => {
    if (!suggestionsOpen) return
    suggestionsCloseRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSuggestionsOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [suggestionsOpen])

  const applyUpdate = () => window.__CENTRO_UPDATE_SW__?.().catch(console.error)
  const configuredSuggestionsUrl = SUGGESTIONS_CHANNEL_URL.trim()

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <img src={`${import.meta.env.BASE_URL}assets/CeNtro Partner.png`} alt="Logotipo CeNtro Partner" width="56" height="56" decoding="async" className="app-logo h-14 w-14 shrink-0 object-contain" />
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
        <p className="design-credit"><strong>Diseñado por Enrique César Flores</strong></p>
        <p>CeNtro Partner apoya la operación, la toma de decisiones y la mejora continua. Uso exclusivo de equipos autorizados.</p>
        <p className="footer-tags">#DistritoKike 🚀 · #GreenApronService · JUNTÉMONOS MÁS</p>
      </div>
      <button type="button" className="suggestions-link" onClick={() => setSuggestionsOpen(true)} aria-haspopup="dialog">
        <MessageSquare size={17} aria-hidden="true" />
        Sugerencias y/o recomendaciones
      </button>
    </footer>
    {suggestionsOpen && <div className="suggestions-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) setSuggestionsOpen(false)
    }}>
      <section className="suggestions-dialog" role="dialog" aria-modal="true" aria-labelledby="suggestions-title">
        <div className="suggestions-heading">
          <div>
            <p className="eyebrow">Ayúdanos a mejorar</p>
            <h2 id="suggestions-title">Sugerencias y/o recomendaciones</h2>
          </div>
          <button ref={suggestionsCloseRef} type="button" className="suggestions-close" onClick={() => setSuggestionsOpen(false)} aria-label="Cerrar">
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <p>{configuredSuggestionsUrl ? 'Comparte tus comentarios mediante el canal autorizado.' : 'Canal de sugerencias pendiente de configuración.'}</p>
        <div className="suggestions-actions">
          <button type="button" className="suggestions-dismiss" onClick={() => setSuggestionsOpen(false)}>Cerrar</button>
          {configuredSuggestionsUrl && <a className="suggestions-channel" href={configuredSuggestionsUrl} target="_blank" rel="noopener noreferrer">Ir al canal de sugerencias</a>}
        </div>
      </section>
    </div>}
  </div>
}
