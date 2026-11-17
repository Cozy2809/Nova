// Nova Agent — contrato (Update 19). Valores definitivos de estados, riesgos y códigos de error.
// Sin dependencias de Electron: se puede probar con `node --test`.
'use strict';

/** Estados de una acción. Transiciones válidas en TRANSITIONS. */
const STATE = Object.freeze({
  PENDING: 'pending',                         // creada y validada, aún no decidida
  AWAITING: 'awaiting_confirmation',          // esperando al usuario
  RUNNING: 'running',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  CANCELLED: 'cancelled',                     // cancelada por el usuario, denegada o por tiempo
});
const FINAL = new Set([STATE.SUCCEEDED, STATE.FAILED, STATE.CANCELLED]);
const TRANSITIONS = {
  pending: ['awaiting_confirmation', 'running', 'failed', 'cancelled'],
  awaiting_confirmation: ['running', 'cancelled', 'failed'],
  running: ['succeeded', 'failed', 'cancelled'],
  succeeded: [], failed: [], cancelled: [],
};

/** Riesgo declarado por cada herramienta. */
const RISK = Object.freeze({ LOW: 'low', CONFIRM: 'confirm', HIGH: 'high' });
/** Nivel de confirmación que se pide al usuario. */
const LEVEL = Object.freeze({ NONE: 'none', CONFIRM: 'confirm', STRONG: 'strong' });
/** Quién pide la acción. 'ai' y 'remote' nunca heredan permisos de sesión del usuario. */
const ORIGIN = Object.freeze({ UI: 'ui', AI: 'ai', REMOTE: 'remote', TEST: 'test' });

const ERR = Object.freeze({
  UNKNOWN_TOOL: 'UNKNOWN_TOOL', VALIDATION: 'VALIDATION', POLICY_BLOCKED: 'POLICY_BLOCKED',
  DENIED: 'DENIED', TIMEOUT: 'TIMEOUT', CANCELLED: 'CANCELLED', EXEC: 'EXEC_ERROR',
  VERIFY: 'VERIFY_FAILED', UNAVAILABLE: 'UNAVAILABLE', NOT_ALLOWED_PATH: 'NOT_ALLOWED_PATH',
});

class AgentError extends Error {
  constructor(code, message, details) { super(message); this.name = 'AgentError'; this.code = code; this.details = details; }
}

module.exports = { STATE, FINAL, TRANSITIONS, RISK, LEVEL, ORIGIN, ERR, AgentError };
