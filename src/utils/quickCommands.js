// Respuestas locales exactas (sin IA) para hora, fecha y cuentas sencillas
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[¿?¡!]/g, ' ').replace(/\s+/g, ' ').trim();

// Evaluador matemático seguro en JS puro (sin eval ni Function para cumplir CSP)
function evaluateExpression(expr) {
  const tokens = [];
  const regex = /\d+(?:\.\d+)?|[+\-*/()]/g;
  let match;
  while ((match = regex.exec(expr)) !== null) {
    tokens.push(match[0]);
  }
  if (!tokens.length) return null;

  let pos = 0;
  function peek() { return tokens[pos]; }
  function consume() { return tokens[pos++]; }

  function parseExpr() {
    let left = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = consume();
      const right = parseTerm();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }

  function parseTerm() {
    let left = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = consume();
      const right = parseFactor();
      if (op === '*') left *= right;
      else {
        if (right === 0) return Infinity;
        left /= right;
      }
    }
    return left;
  }

  function parseFactor() {
    if (peek() === '+') {
      consume();
      return parseFactor();
    }
    if (peek() === '-') {
      consume();
      return -parseFactor();
    }
    const tok = peek();
    if (tok === '(') {
      consume();
      const val = parseExpr();
      if (peek() === ')') consume();
      return val;
    }
    if (tok !== undefined && /^\d/.test(tok)) {
      consume();
      return parseFloat(tok);
    }
    throw new Error('Token no válido: ' + tok);
  }

  try {
    const res = parseExpr();
    if (pos < tokens.length) return null;
    return res;
  } catch {
    return null;
  }
}

export function quickAnswer(text) {
  const t = norm(text); const now = new Date();
  if (/\b(que hora es|que horas son|dime la hora|la hora actual)\b/.test(t))
    return `Son las ${now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}, Señor.`;
  if (/(que dia es|que fecha|fecha de hoy|a que dia estamos|que dia estamos)/.test(t) && !/manana|ayer|pasado/.test(t))
    return `Hoy es ${now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, Señor.`;
  return mathAnswer(t);
}

function mathAnswer(t) {
  let s = t
    .replace(/multiplicado por|multiplicado|multiplicar por/g, '*')
    .replace(/dividido entre|dividido por|dividido|dividir entre/g, '/')
    .replace(/\bmas\b/g, '+').replace(/\bmenos\b/g, '-')
    .replace(/\bpor\b/g, '*').replace(/\bentre\b/g, '/')
    .replace(/(\d)\s*x\s*(\d)/g, '$1*$2')
    .replace(/(\d),(\d)/g, '$1.$2');
  const m = s.match(/\d+(?:\.\d+)?(?:\s*[+\-*/()]\s*\d+(?:\.\d+)?)+/);
  if (!m || /\d-\d+-\d/.test(m[0])) return null;
  const cue = /cuanto|calcula|resultado|suma|resta|multiplica|divide|cuantos/.test(t);
  if (!cue && s.replace(m[0], '').replace(/[^a-z0-9]/g, '') !== '') return null;
  
  const r = evaluateExpression(m[0]);
  if (r === null) return null;
  if (!Number.isFinite(r)) return 'No se puede dividir entre cero, Señor.';
  return `El resultado es ${(Number.isInteger(r) ? r : +r.toFixed(4)).toLocaleString('es-ES')}, Señor.`;
}
