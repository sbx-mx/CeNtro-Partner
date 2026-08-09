import type { Pillar } from '../types'

export interface IndicatorConfig {
  sheet: string
  indicator: string
  pillar: Exclude<Pillar,'Todos'>
  evaluator: 'lte36pct'|'lte0'|'lte1'|'equals1'|'gt70'|'gt60pct'|'gt70pct'|'gt0'|'gt1'|'between09pct'|'gt7'
}

export const INDICATORS: IndicatorConfig[] = [
  { sheet:'Rotacion', indicator:'Rotacion', pillar:'Partner', evaluator:'lte36pct' },
  { sheet:'Bajas<90', indicator:'Bajas<90', pillar:'Partner', evaluator:'lte0' },
  { sheet:'Estabilidad 12M', indicator:'Estabilidad 12M', pillar:'Partner', evaluator:'equals1' },
  { sheet:'BB', indicator:'Efectividad', pillar:'Partner', evaluator:'equals1' },
  { sheet:'NPS', indicator:'NPS', pillar:'Cliente', evaluator:'gt70' },
  { sheet:'Desempeño', indicator:'Desempeño', pillar:'Cliente', evaluator:'gt70pct' },
  { sheet:'Conexion', indicator:'Conexion', pillar:'Cliente', evaluator:'gt60pct' },
  { sheet:'Bebida', indicator:'Bebida', pillar:'Cliente', evaluator:'gt70pct' },
  { sheet:'SR% ', indicator:'SR%', pillar:'Cliente', evaluator:'gt0' },
  { sheet:'ADT_AA', indicator:'OMT', pillar:'Negocio', evaluator:'gt1' },
  { sheet:'VMT_AA%', indicator:'VMT%', pillar:'Negocio', evaluator:'gt0' },
  { sheet:'V_ppto', indicator:'ppto%', pillar:'Negocio', evaluator:'gt0' },
  { sheet:'V_AT_AA%', indicator:'AT%', pillar:'Negocio', evaluator:'gt0' },
  { sheet:'vCOGS', indicator:'COGS', pillar:'Negocio', evaluator:'between09pct' },
  { sheet:'SegundasCx', indicator:'Segundas Cx', pillar:'Negocio', evaluator:'gt7' }
]

export const PILLARS: Exclude<Pillar,'Todos'>[] = ['Partner','Cliente','Negocio']
export const EFFECTIVENESS_SHEETS = ['BB','BT','SS'] as const
export const REQUIRED_SHEETS = ['Directorio','Instrucciones',...INDICATORS.map(i=>i.sheet),...EFFECTIVENESS_SHEETS]
  .filter((sheet,index,sheets) => sheets.indexOf(sheet) === index)
export const PERIODS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic','YTD'] as const

export const normalize = (value: unknown) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-zA-Z0-9%<>=]+/g,' ')
  .trim().toLowerCase().replace(/\s+/g,' ')
