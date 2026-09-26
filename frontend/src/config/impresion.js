// =====================================================================
// IMPRIMIR UN FORMULARIO (o cualquier bloque de la pantalla)
//
// Copia el contenido del formulario a un contenedor de impresión, cambia cada campo
// (input / select / textarea) por su valor en texto, quita botones y quita los scrolls
// internos para que salgan todas las filas. Así sirve para todos los módulos sin tocar
// cada formulario. Desde el diálogo de impresión también se puede "Guardar como PDF".
// =====================================================================

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function valorDeControl(el) {
  if (el.tagName === 'SELECT') {
    const textos = [...el.selectedOptions].map(o => o.text.trim()).filter(t => t && !/^(--|seleccione)/i.test(t));
    return textos.join(', ');
  }
  if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '☑' : '☐';
  if (el.type === 'file' || el.type === 'hidden' || el.type === 'button' || el.type === 'submit') return null;
  return el.value;
}

export function imprimirElemento(elemento, { titulo = '', lineas = [] } = {}) {
  if (!elemento) return;
  const copia = elemento.cloneNode(true);

  // Los valores escritos por el usuario no viajan con cloneNode: se leen del original, en el mismo orden.
  const originales = elemento.querySelectorAll('input, select, textarea');
  const copias = copia.querySelectorAll('input, select, textarea');
  copias.forEach((el, i) => {
    const valor = valorDeControl(originales[i]);
    if (valor === null) { el.remove(); return; }
    const span = document.createElement('span');
    span.className = 'valor-impreso';
    span.textContent = valor === '' ? '—' : valor;
    el.replaceWith(span);
  });
  // Botones de acción se quitan; los que son opciones marcadas (meses, chips) se dejan como texto con su color.
  const ACCION = /guardar|cancelar|imprimir|eliminar|agregar|añadir|quitar|limpiar|cerrar|editar|buscar|cargar|actualizar|volver|^\s*[×✕+🗑✖✏]/i;
  copia.querySelectorAll('button').forEach(btn => {
    if (ACCION.test(btn.textContent) || !btn.textContent.trim()) { btn.remove(); return; }
    const span = document.createElement('span');
    span.setAttribute('style', btn.getAttribute('style') || '');
    span.className = btn.className;
    span.style.display = 'inline-block';
    span.style.cursor = 'default';
    span.textContent = btn.textContent;
    btn.replaceWith(span);
  });
  copia.querySelectorAll('[data-no-print], datalist, script').forEach(el => el.remove());

  const contenedor = document.createElement('div');
  contenedor.className = 'reporte-impresion-solo impresion-formulario';
  contenedor.innerHTML = `
    <div class="impresion-encabezado">
      <div class="impresion-empresa">C&amp;V INTERNATIONAL · Sistema de Presupuestos</div>
      <div class="impresion-titulo">${escapar(titulo)}</div>
      <div class="impresion-datos">${lineas.filter(Boolean).map(escapar).join(' &nbsp;·&nbsp; ')}</div>
    </div>`;
  contenedor.appendChild(copia);
  document.body.appendChild(contenedor);

  const limpiar = () => { contenedor.remove(); window.removeEventListener('afterprint', limpiar); };
  window.addEventListener('afterprint', limpiar);
  // Deja un momento para que el navegador aplique los estilos de impresión.
  setTimeout(() => {
    window.print();
    setTimeout(limpiar, 60000); // respaldo si el navegador no avisa "afterprint"
  }, 50);
}
