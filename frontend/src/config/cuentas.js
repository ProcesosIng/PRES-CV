// Formato ÚNICO de cuenta contable en todos los módulos: "CÓDIGO - Nombre".
// El nombre sale siempre del maestro de cuentas (Odoo), buscando por el código
// completo o por su base de 7 dígitos (sin el prefijo de 2 dígitos del área).
// Si la cuenta no está en el maestro, se conserva el nombre que ya traía (o el de respaldo).
//
// Nombres largos: cada parte menos la última se abrevia con sus iniciales, p. ej.
//   "Valuación y deterioro de activos - Depreciación de propiedades, planta y equipo - Maquinarias y equipos de explotación"
//   -> "VDA - DPPE - Maquinarias y equipos de explotación"
const LARGO_MAXIMO_NOMBRE = 45;
const PALABRAS_SIN_INICIAL = new Set(['y', 'e', 'o', 'u', 'de', 'del', 'la', 'las', 'el', 'los', 'a', 'al', 'en', 'para', 'por', 'con', 'sin']);

function iniciales(parte) {
  return parte
    .split(/[\s,./]+/)
    .filter(p => p && !PALABRAS_SIN_INICIAL.has(p.toLowerCase()))
    .map(p => p[0].toUpperCase())
    .join('');
}

export function abreviarNombreCuenta(nombre) {
  const limpio = String(nombre || '').trim();
  const partes = limpio.split(/\s+-\s+/).filter(Boolean);
  if (limpio.length <= LARGO_MAXIMO_NOMBRE || partes.length < 2) return limpio;
  return [...partes.slice(0, -1).map(iniciales), partes[partes.length - 1]].join(' - ');
}

export function formatearCuentaContable(cuenta, listaCuentas = [], nombreRespaldo = '') {
  const texto = String(cuenta || '').trim();
  const m = texto.match(/^(\d+)\s*(?:-\s*)?(.*)$/);
  if (!m) return texto;
  const codigo = m[1];
  const base = (c) => (c.length > 7 ? c.slice(-7) : c);
  const cod = (c) => String(c?.codigo || c?.id || '');
  const encontrada = listaCuentas.find(c => cod(c) === codigo) || listaCuentas.find(c => base(cod(c)) === base(codigo));
  const nombre = abreviarNombreCuenta(encontrada?.nombre || m[2] || nombreRespaldo || '');
  return nombre ? `${codigo} - ${nombre}` : codigo;
}
