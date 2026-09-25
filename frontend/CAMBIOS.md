# Cambios aplicados

## Archivos nuevos
- `src/data/store.js` — capa de datos jerárquica (Versión → Área → Módulo → Registros), persistida en localStorage. Reemplaza el estado volátil que vivía en `Dashboard.jsx`.
- `src/data/schema.sql` — esquema relacional de referencia para cuando se construya el backend real. `store.js` usa la misma forma de datos, para que migrar sea casi mecánico.
- `src/config/modulosPorArea.js` — matriz de módulos visibles por área, sin la duplicación de ~18 ítems copiados 7 veces que tenía `Dashboard.jsx`.

## Archivos corregidos
- `src/components/DashBoard.jsx` — ahora lee/escribe a través de `store.js`, aislado correctamente por (versión, área, módulo). Antes los registros se indexaban solo por nombre de módulo, y podían mezclarse entre áreas distintas que comparten un módulo (ej. "Remuneraciones" en Administración y en Logística).
- `src/components/Offcanvas.jsx` — ahora estampa `id_version` / `area` / `modulo` sobre lo que devuelve cada formulario y persiste con `guardarRegistros()`. Se quitó el import muerto de `TransporteForm`.
- `src/components/SelectorVersiones.jsx` — las versiones y el clonado ahora son reales (usan `store.js`). Antes "clonar desde" solo copiaba el texto del presupuesto, no los registros; y toda la lista de versiones se perdía al recargar la página.
- `src/components/common/BaseRegistroForm.jsx` — **bug corregido**: `handleAutocomplete` leía `registro.detalle_columnas` sin comprobar que `registro` existiera, lo que rompía la app (`TypeError`) apenas se escribía en el buscador de empleado al crear un registro nuevo.

## Archivos eliminados (código muerto)
- `src/components/PlantillaPresupuesto.jsx` — nunca se importaba en ningún lado y además estaba roto (usaba variables como `registrosGuardados`, `configModulos`, `eliminarRegistro` que no existían en su scope).
- `src/components/modulos/TransporteForm.jsx` y `src/components/modulos/TransporteTabla.jsx` — se importaban pero nunca se usaban: el módulo "Transporte" ya caía al formulario/tabla genéricos (`BaseRegistroForm` / `TablaGenerica`).

## Pendiente / recomendado a futuro
- `store.js` usa localStorage porque no hay backend — funciona para una sola persona en un solo navegador, **no es multiusuario**. `schema.sql` queda como plano para cuando se construya la API real; los componentes no deberían necesitar cambios grandes en ese momento.
- Unificar el formato de `id_registro` (hoy `RemuneracionesForm`/`UniformesForm` generan sus propios IDs con `Date.now()`; `store.js` usa `crypto.randomUUID()` cuando el formulario no trae uno). Antes de escalar a multiusuario, conviene que todos los formularios dejen de generar IDs y se los pida siempre al store.
