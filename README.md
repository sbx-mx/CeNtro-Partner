# CeNtro Partner V2

Vista única de Ranking Regional para GitHub Pages.

## Validación

```bash
npm ci
npm run check
npm run build
```

Para actualizar el Excel motor sin reemplazos parciales:

```bash
python -m pip install -r requirements-validation.txt
python scripts/sync_workbook.py "/ruta/al/nuevo.xlsx"
```

El sincronizador exige `Fecha Apertura` y `Tipo Tienda`, valida el libro completo y solo reemplaza la base cuando no existen errores bloqueantes. Las advertencias de cobertura mensual y duplicados de indicadores quedan registradas en `public/data/workbook-audit.json`.

`Rewards %` permanece fuera del cálculo hasta contar con una fuente confirmada; la aplicación no infiere ni rellena ese dato.

La publicación se realiza mediante `.github/workflows/deploy-pages.yml` desde la carpeta compilada `dist`.

## Sugerencias

El pie de página incluye un acceso discreto para sugerencias. Mientras no exista un destino autorizado muestra `Canal de sugerencias pendiente de configuración.` Para habilitarlo, modifica únicamente `SUGGESTIONS_CHANNEL_URL` en `src/layouts/AppLayout.tsx`.
