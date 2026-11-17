// Política de permisos verificable: decide(tool, args, ctx) devuelve siempre una decisión con motivo.
// Reglas (en este orden):
//  1. Interruptor global (`PC_CONTROL=off` o ajuste agent.enabled=false): solo se permiten herramientas de riesgo bajo.
//  2. Riesgo efectivo = el mayor entre tool.risk y, si el origen es IA/remoto, tool.aiRisk.
//  3. Contenido no fiable (ctx.untrusted: la orden nace de una web, un archivo, un correo…): sin concesiones de sesión
//     y sin ejecución automática; lo alto queda en confirmación fuerte.
//  4. low  → sin confirmación si la política lo permite (agent.lowRiskAuto, por defecto sí).
//     confirm → confirmación; puede recordarse "en esta sesión" solo si el origen es la interfaz y el contenido es fiable.
//     high → confirmación FUERTE (el usuario debe marcar la casilla de entendimiento; el proceso principal lo exige).
//  5. Cambios masivos: si tool.impact(args).count >= MASS (10), se sube a confirmación fuerte.
'use strict';
const { RISK, LEVEL, ORIGIN } = require('./contract');
const { ORDER } = require('./registry');

const MASS = 10;
const maxRisk = (a, b) => (ORDER[a] >= ORDER[b] ? a : b);

function effectiveRisk(tool, origin) {
  return origin === ORIGIN.AI || origin === ORIGIN.REMOTE ? maxRisk(tool.risk, tool.aiRisk || tool.risk) : tool.risk;
}

/**
 * @param {object} tool  herramienta registrada
 * @param {object} args  parámetros ya validados
 * @param {{origin:string, untrusted?:boolean, settings?:object, env?:object, sessionGrants?:Set<string>}} ctx
 * @returns {{allow:boolean, confirm:boolean, level:string, risk:string, reason:string, canRemember:boolean}}
 */
function decide(tool, args, ctx = {}) {
  const origin = ctx.origin || ORIGIN.UI, settings = ctx.settings || {}, env = ctx.env || {};
  let risk = effectiveRisk(tool, origin);
  const disabled = String(env.PC_CONTROL || '').toLowerCase() === 'off' || String(settings['agent.enabled'] ?? 'true') === 'false';
  if (disabled && risk !== RISK.LOW) return { allow: false, confirm: false, level: LEVEL.NONE, risk, reason: 'El control del PC está desactivado (PC_CONTROL=off o ajuste del agente).', canRemember: false };

  let mass = 0;
  if (typeof tool.impact === 'function') { try { mass = Number(tool.impact(args)?.count) || 0; } catch {} }
  if (mass >= MASS && risk === RISK.CONFIRM) risk = RISK.HIGH;

  const untrusted = !!ctx.untrusted;
  const lowAuto = String(settings['agent.lowRiskAuto'] ?? 'true') !== 'false';

  if (risk === RISK.LOW) {
    if (lowAuto && !untrusted) return { allow: true, confirm: false, level: LEVEL.NONE, risk, reason: 'Riesgo bajo y ejecución automática permitida.', canRemember: false };
    return { allow: true, confirm: true, level: LEVEL.CONFIRM, risk, reason: untrusted ? 'La orden procede de contenido externo.' : 'Confirmación de riesgo bajo activada.', canRemember: false };
  }
  if (risk === RISK.CONFIRM) {
    const canRemember = origin === ORIGIN.UI && !untrusted;
    if (canRemember && ctx.sessionGrants && ctx.sessionGrants.has(tool.name)) return { allow: true, confirm: false, level: LEVEL.NONE, risk, reason: 'Permitida en esta sesión por el usuario.', canRemember };
    return { allow: true, confirm: true, level: LEVEL.CONFIRM, risk, reason: 'La acción modifica algo y requiere confirmación.', canRemember };
  }
  return { allow: true, confirm: true, level: LEVEL.STRONG, risk, reason: mass >= MASS ? `Cambio masivo (${mass} elementos).` : 'Acción de alto riesgo.', canRemember: false };
}

module.exports = { decide, effectiveRisk, MASS };
