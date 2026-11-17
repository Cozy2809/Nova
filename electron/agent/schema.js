// Validador de parámetros mínimo y estricto (sin dependencias). Rechaza claves desconocidas.
// Tipos: string, path, enum, integer, number, boolean, array (con items). Devuelve { ok, value } o { ok:false, errors }.
'use strict';

const MAX_STR = 4000;

function check(def, v, key, errors) {
  if (v === undefined || v === null) {
    if (def.required) errors.push(`«${key}» es obligatorio`);
    return def.default;
  }
  switch (def.type) {
    case 'string': case 'path': {
      if (typeof v !== 'string') { errors.push(`«${key}» debe ser texto`); return; }
      if (v.includes('\0')) { errors.push(`«${key}» contiene caracteres no válidos`); return; }
      const max = def.max || (def.type === 'path' ? 520 : MAX_STR);
      if (v.length > max) { errors.push(`«${key}» supera ${max} caracteres`); return; }
      if (def.required && !v.trim()) { errors.push(`«${key}» está vacío`); return; }
      if (def.pattern && !def.pattern.test(v)) { errors.push(`«${key}» no tiene un formato válido`); return; }
      return v;
    }
    case 'enum': if (!def.values.includes(v)) { errors.push(`«${key}» debe ser uno de: ${def.values.join(', ')}`); return; } return v;
    case 'integer': case 'number': {
      if (typeof v !== 'number' || !Number.isFinite(v) || (def.type === 'integer' && !Number.isInteger(v))) { errors.push(`«${key}» debe ser un número${def.type === 'integer' ? ' entero' : ''}`); return; }
      if ((def.min !== undefined && v < def.min) || (def.max !== undefined && v > def.max)) { errors.push(`«${key}» fuera de rango (${def.min ?? '−∞'} a ${def.max ?? '∞'})`); return; }
      return v;
    }
    case 'boolean': if (typeof v !== 'boolean') { errors.push(`«${key}» debe ser verdadero o falso`); return; } return v;
    case 'array': {
      if (!Array.isArray(v)) { errors.push(`«${key}» debe ser una lista`); return; }
      const max = def.maxItems || 200;
      if (v.length > max) { errors.push(`«${key}» admite como máximo ${max} elementos`); return; }
      if (def.required && !v.length) { errors.push(`«${key}» no puede estar vacío`); return; }
      const out = [];
      v.forEach((x, i) => { const r = check({ ...def.items, required: true }, x, `${key}[${i}]`, errors); out.push(r); });
      return out;
    }
    default: errors.push(`tipo de esquema desconocido para «${key}»`);
  }
}

function validate(schema, args) {
  const errors = [];
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) return { ok: false, errors: ['Los parámetros deben ser un objeto'] };
  const defs = schema || {};
  for (const k of Object.keys(args)) if (!Object.hasOwn(defs, k)) errors.push(`Parámetro desconocido: «${k}»`);
  const value = {};
  for (const [k, def] of Object.entries(defs)) { const r = check(def, args[k], k, errors); if (r !== undefined) value[k] = r; }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}

// Versión serializable del esquema para mostrarla en la interfaz o a la IA (sin RegExp)
const describe = (schema) => Object.fromEntries(Object.entries(schema || {}).map(([k, d]) => [k, { type: d.type, required: !!d.required, ...(d.values ? { values: d.values } : {}), ...(d.min !== undefined ? { min: d.min } : {}), ...(d.max !== undefined ? { max: d.max } : {}), ...(d.items ? { items: d.items.type } : {}), ...(d.description ? { description: d.description } : {}) }]));

module.exports = { validate, describe };
