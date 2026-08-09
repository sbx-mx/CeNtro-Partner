# Auditoría vigente — CeNtro Partner

Fecha: 8 de agosto de 2026

## Resultado técnico

- TypeScript, Vite y PWA compilados correctamente para `/CeNtro-Partner/`.
- Excel motor sincronizado de forma atómica mediante Python y publicado tanto en `public/data` como en `docs/data`.
- 372 CeCo únicos, seis campos obligatorios del Directorio y 15 indicadores activos.
- `Estabilidad 24M` retirada del motor y de la interfaz conforme al nuevo libro.
- Procesamiento de indicadores indexado por CeCo para evitar búsquedas repetidas por tienda.
- Filtros persistentes por Región, Distrito y Tipo de tienda.
- Control independiente para ocultar dinámicamente tiendas con menos de un año desde su apertura.
- Flujo manual y seguro para auditar o eliminar archivos obsoletos declarados explícitamente.

## Excel

- SHA-256: `d7d8837b0e48562c8d44a7d329ec832f6d09aebbcb67284eb2f29e9014a9aa3a`.
- 21 pestañas y 0 errores estructurales bloqueantes.
- Directorio: 372 tiendas, sin CeCo duplicados y sin metadatos de apertura o tipo faltantes.
- Angel / CeCo 38101 validada con Región Centro Centro, DM Daniel Flores Maldonado, apertura 06/09/2002 y tipo Cafe.
- Advertencias conservadas sin alterar datos: `vCOGS` y `SR%` no contienen columna julio; `VMT_AA%` repite los CeCo 43142 y 43147 y el motor conserva la última fila, como en la lógica original.
- `Rewards %` no se incorpora hasta recibir una fuente confirmada.

## Validación

- `python scripts/validate_workbook.py`: 0 errores, 4 advertencias documentadas.
- `npm run check`: correcto.
- `npm run build`: correcto; 1,593 módulos transformados y Service Worker generado.
