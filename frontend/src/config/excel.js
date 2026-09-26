// =====================================================================
// EXPORTAR A EXCEL (.xlsx)
//
// exportarTablasHtml: toma las <table> de un contenedor tal como se ven en pantalla
// (con los filtros aplicados) y arma una hoja por tabla. Para no perder precisión,
// una celda puede declarar su valor real con data-valor="1234.5" y data-formato="pct|moneda|numero";
// si no, se interpreta el texto ("S/ 1,234.50", "-12.5 %", "(300)").
// Elementos con data-no-excel se ignoran; data-nivel="2" sangra la celda (árboles).
//
// exportarExcel: arma hojas a partir de datos (columnas + filas).
//
// La librería (exceljs) se descarga recién cuando alguien exporta, para no pesar al abrir la app.
// =====================================================================

const FORMATOS = {
  moneda: '#,##0.00;[Red]-#,##0.00',
  numero: '#,##0.##;[Red]-#,##0.##',
  entero: '#,##0;[Red]-#,##0',
  pct: '0.00%;[Red]-0.00%',
  fecha: 'dd/mm/yyyy',
  fechahora: 'dd/mm/yyyy hh:mm',
};
const AZUL = 'FF1E3A8A';

async function cargarExcelJS() {
  const mod = await import('exceljs');
  return mod.default || mod;
}

// Nombres de hoja: máx. 31 caracteres, sin : \ / ? * [ ] y sin repetir.
function nombreHoja(libro, base) {
  const limpio = String(base || 'Hoja').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Hoja';
  let nombre = limpio;
  let i = 2;
  while (libro.getWorksheet(nombre)) nombre = `${limpio.slice(0, 26)} ${i++}`;
  return nombre;
}

async function descargar(libro, nombreArchivo) {
  const buffer = await libro.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Sin tildes ni caracteres especiales: algunos navegadores ignoran el nombre si los tiene.
  const nombre = String(nombreArchivo || 'reporte').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w .()-]+/g, ' ').replace(/\s+/g, ' ').trim();
  a.download = `${nombre || 'reporte'}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Encabezado de la hoja: título, filtros y quién/cuándo exportó.
function escribirEncabezado(hoja, { titulo, subtitulo }, ancho) {
  let fila = 1;
  if (titulo) {
    hoja.getCell(fila, 1).value = titulo;
    hoja.getCell(fila, 1).font = { bold: true, size: 14, color: { argb: AZUL } };
    fila++;
  }
  if (subtitulo) {
    hoja.getCell(fila, 1).value = subtitulo;
    hoja.getCell(fila, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
    fila++;
  }
  hoja.getCell(fila, 1).value = `Exportado el ${new Date().toLocaleString('es-PE')}`;
  hoja.getCell(fila, 1).font = { size: 8, color: { argb: 'FF94A3B8' } };
  if (ancho > 1) for (let f = 1; f <= fila; f++) hoja.mergeCells(f, 1, f, Math.min(ancho, 12));
  return fila + 2; // deja una fila en blanco
}

// "S/ -1,234.50" -> { valor: -1234.5, formato: 'moneda' } ; "12.5 %" -> { valor: 0.125, formato: 'pct' }
export function interpretarTexto(texto) {
  const t = String(texto ?? '').replace(/ /g, ' ').trim();
  if (!t) return { valor: null };
  const esPct = /%$/.test(t);
  const negativoParentesis = /^\(.*\)$/.test(t);
  const mil = /\bmil$/i.test(t);
  const limpio = t.replace(/^\(|\)$/g, '').replace(/%$/, '').replace(/\bmil$/i, '').replace(/^(S\/|US\$|\$)\s*/i, '').replace(/(S\/|US\$)\s*/i, '').trim();
  if (!/^[-+]?\d{1,3}(,\d{3})*(\.\d+)?$|^[-+]?\d+(\.\d+)?$/.test(limpio)) return { valor: t };
  let n = parseFloat(limpio.replace(/,/g, ''));
  if (negativoParentesis) n = -n;
  if (mil) n *= 1000;
  if (esPct) return { valor: n / 100, formato: 'pct' };
  const esMoneda = /S\/|US\$|\$/.test(t) || /\.\d{2}$/.test(limpio);
  return { valor: n, formato: esMoneda ? 'moneda' : 'numero' };
}

function valorDeCelda(td) {
  if (td.dataset.valor !== undefined && td.dataset.valor !== '') {
    const n = parseFloat(td.dataset.valor);
    if (Number.isFinite(n)) return { valor: n, formato: td.dataset.formato || 'moneda' };
  }
  // Inputs/selects dentro de la tabla (p. ej. cantidades editables): se exporta su valor.
  const control = td.querySelector('input:not([type=checkbox]), select, textarea');
  const texto = control ? (control.tagName === 'SELECT' ? control.options[control.selectedIndex]?.text : control.value) : textoVisible(td);
  return interpretarTexto(texto);
}

// Texto de la celda sin los adornos marcados con data-no-excel (p. ej. los íconos ⊞/⊟ de los árboles).
function textoVisible(el) {
  if (!el.querySelector('[data-no-excel]')) return el.innerText;
  const copia = el.cloneNode(true);
  copia.querySelectorAll('[data-no-excel]').forEach(n => n.remove());
  return copia.textContent;
}

function colorDe(el) {
  const c = getComputedStyle(el).backgroundColor;
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m || (m[4] !== undefined && parseFloat(m[4]) === 0)) return null;
  if (m[1] === '255' && m[2] === '255' && m[3] === '255') return null;
  return `FF${[m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function tablaAHoja(hoja, tabla, filaInicio) {
  const ocupadas = new Set(); // "fila,col" ocupadas por rowspan/colspan
  let fila = filaInicio;
  let maxCol = 1;
  const anchos = {};
  tabla.querySelectorAll('tr').forEach(tr => {
    if (tr.closest('[data-no-excel]')) return;
    // Tablas anidadas (detalle desplegado) se omiten: se exportan como su propia hoja si hace falta.
    if (tr.closest('table') !== tabla) return;
    let col = 1;
    [...tr.children].forEach(td => {
      if (td.hasAttribute('data-no-excel')) return;
      while (ocupadas.has(`${fila},${col}`)) col++;
      const colspan = parseInt(td.getAttribute('colspan'), 10) || 1;
      const rowspan = parseInt(td.getAttribute('rowspan'), 10) || 1;
      const celda = hoja.getCell(fila, col);
      const esEncabezado = td.tagName === 'TH';
      const { valor, formato } = esEncabezado ? { valor: textoVisible(td).trim() } : valorDeCelda(td);
      celda.value = valor;
      if (formato && FORMATOS[formato]) celda.numFmt = FORMATOS[formato];
      const estilo = getComputedStyle(td);
      const negrita = esEncabezado || parseInt(estilo.fontWeight, 10) >= 700;
      celda.font = { bold: negrita, size: esEncabezado ? 10 : 10, color: esEncabezado && colorDe(td) === AZUL ? { argb: 'FFFFFFFF' } : undefined };
      const fondo = colorDe(td) || colorDe(tr);
      if (fondo) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
      if (fondo && ['FF1E3A8A', 'FF0F172A', 'FF1E293B', 'FF334155'].includes(fondo)) celda.font = { ...celda.font, color: { argb: 'FFFFFFFF' } };
      const nivel = parseInt(td.dataset.nivel, 10);
      celda.alignment = { vertical: 'middle', horizontal: esEncabezado ? 'center' : (typeof valor === 'number' ? 'right' : 'left'), indent: Number.isFinite(nivel) ? nivel * 2 : undefined, wrapText: esEncabezado };
      celda.border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
      if (colspan > 1 || rowspan > 1) {
        hoja.mergeCells(fila, col, fila + rowspan - 1, col + colspan - 1);
        for (let r = 0; r < rowspan; r++) for (let c = 0; c < colspan; c++) ocupadas.add(`${fila + r},${col + c}`);
      }
      if (colspan === 1) {
        const largo = String(valor ?? '').length + (Number.isFinite(nivel) ? nivel * 2 : 0);
        anchos[col] = Math.max(anchos[col] || 8, Math.min(typeof valor === 'number' ? 16 : largo + 2, 60));
      }
      col += colspan;
      maxCol = Math.max(maxCol, col - 1);
    });
    fila++;
  });
  Object.entries(anchos).forEach(([c, w]) => { hoja.getColumn(Number(c)).width = Math.max(hoja.getColumn(Number(c)).width || 0, w); });
  return { filaFin: fila, maxCol };
}

// Exporta las tablas visibles de `contenedor`. `hojasPorTabla`: una hoja por tabla (o todas en una).
export async function exportarTablasHtml({ contenedor, nombreArchivo, titulo, subtitulo, hojasPorTabla = true, nombresHojas = [] }) {
  if (!contenedor) throw new Error('No hay nada que exportar.');
  const tablas = [...contenedor.querySelectorAll('table')].filter(t => !t.closest('[data-no-excel]') && !t.parentElement.closest('table'));
  if (tablas.length === 0) throw new Error('No hay tablas para exportar con los filtros actuales.');
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'C&V International - Presupuestos';
  libro.created = new Date();

  let hoja = null;
  let fila = 1;
  tablas.forEach((tabla, i) => {
    const tituloTabla = tabla.dataset.titulo || nombresHojas[i] || (tablas.length > 1 ? `${titulo || 'Tabla'} ${i + 1}` : titulo);
    if (!hoja || hojasPorTabla) {
      hoja = libro.addWorksheet(nombreHoja(libro, tabla.dataset.hoja || nombresHojas[i] || tituloTabla || 'Reporte'), { views: [{ showGridLines: false }] });
      fila = escribirEncabezado(hoja, { titulo: tituloTabla || titulo, subtitulo }, 8);
    } else {
      hoja.getCell(fila, 1).value = tituloTabla;
      hoja.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: AZUL } };
      fila += 1;
    }
    const inicioTabla = fila;
    const { filaFin } = tablaAHoja(hoja, tabla, fila);
    // Congela el encabezado de la tabla y la primera columna.
    const filasEncabezado = tabla.tHead ? tabla.tHead.rows.length : 1;
    if (hojasPorTabla) hoja.views = [{ state: 'frozen', xSplit: 1, ySplit: inicioTabla + filasEncabezado - 1, showGridLines: false }];
    fila = filaFin + 2;
  });
  await descargar(libro, nombreArchivo);
}

// hojas: [{ nombre, titulo, subtitulo, columnas: [{ titulo, clave | valor(fila), formato, ancho }], filas: [...] }]
export async function exportarExcel(nombreArchivo, hojas) {
  const ExcelJS = await cargarExcelJS();
  const libro = new ExcelJS.Workbook();
  libro.creator = 'C&V International - Presupuestos';
  libro.created = new Date();
  hojas.forEach(h => {
    const hoja = libro.addWorksheet(nombreHoja(libro, h.nombre), { views: [{ showGridLines: false }] });
    let fila = escribirEncabezado(hoja, h, h.columnas.length);
    const filaTitulos = fila;
    h.columnas.forEach((c, i) => {
      const celda = hoja.getCell(fila, i + 1);
      celda.value = c.titulo;
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
      celda.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      hoja.getColumn(i + 1).width = c.ancho || Math.max(10, Math.min(String(c.titulo).length + 4, 40));
    });
    fila++;
    h.filas.forEach(f => {
      h.columnas.forEach((c, i) => {
        let v = typeof c.valor === 'function' ? c.valor(f) : f[c.clave];
        if ((c.formato === 'fecha' || c.formato === 'fechahora') && v && !(v instanceof Date)) {
          const d = new Date(v);
          v = Number.isNaN(d.getTime()) ? v : d;
        }
        const celda = hoja.getCell(fila, i + 1);
        celda.value = v === undefined ? null : (Array.isArray(v) ? v.join(', ') : v);
        if (c.formato && FORMATOS[c.formato]) celda.numFmt = FORMATOS[c.formato];
      });
      fila++;
    });
    if (h.filas.length > 0) hoja.autoFilter = { from: { row: filaTitulos, column: 1 }, to: { row: fila - 1, column: h.columnas.length } };
    hoja.views = [{ state: 'frozen', ySplit: filaTitulos, showGridLines: false }];
  });
  await descargar(libro, nombreArchivo);
}
