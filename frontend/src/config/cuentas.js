// Formato ÚNICO de cuenta contable en todos los módulos: "CÓDIGO - Nombre".
// El nombre sale siempre del maestro de cuentas (Odoo), buscando por el código
// completo o por su base de 7 dígitos (sin el prefijo de 2 dígitos del área).
// Si la cuenta no está en el maestro, se conserva el nombre que ya traía (o el de respaldo).
export function formatearCuentaContable(cuenta, listaCuentas = [], nombreRespaldo = '') {
  const texto = String(cuenta || '').trim();
  const m = texto.match(/^(\d+)\s*(?:-\s*)?(.*)$/);
  if (!m) return texto;
  const codigo = m[1];
  const base = (c) => (c.length > 7 ? c.slice(-7) : c);
  const cod = (c) => String(c?.codigo || c?.id || '');
  const encontrada = listaCuentas.find(c => cod(c) === codigo) || listaCuentas.find(c => base(cod(c)) === base(codigo));
  const nombre = String(encontrada?.nombre || m[2] || nombreRespaldo || '').trim();
  return nombre ? `${codigo} - ${nombre}` : codigo;
}
