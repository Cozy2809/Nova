// Pruebas del servicio de archivos y de las herramientas contra una carpeta TEMPORAL (nunca tocan datos reales).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { createCore } = require('../electron/desktop');

function sandbox() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'nova-sb-')));
  const docs = path.join(base, 'Documentos'), desk = path.join(base, 'Escritorio'), outside = path.join(base, 'Fuera');
  for (const d of [docs, desk, outside]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(docs, 'Redes apuntes.pdf'), 'x'); fs.writeFileSync(path.join(docs, 'presupuesto.txt'), 'dinero');
  fs.writeFileSync(path.join(docs, 'foto.png'), 'png'); fs.mkdirSync(path.join(docs, 'Sub')); fs.writeFileSync(path.join(docs, 'Sub', 'Informe Redes.docx'), 'd');
  fs.writeFileSync(path.join(outside, 'secreto.txt'), 's');
  const trashed = [];
  const shell = { trashItem: async (p) => { trashed.push(p); fs.rmSync(p, { recursive: true }); }, openPath: async () => '', showItemInFolder() {} };
  const core = createCore({ shell, execFile: () => { throw new Error('no debe llamarse PowerShell'); }, getRoots: () => [docs, desk], getPlaces: () => [{ id: 'documents', label: 'Documentos', path: docs }, { id: 'x', label: 'Fantasma', path: path.join(base, 'noexiste') }], platform: 'linux', settings: () => ({}), env: {} });
  return { base, docs, desk, outside, trashed, core, agent: core.agent };
}
const waitConfirm = async (agent, id) => { for (let i = 0; i < 200; i++) { if (agent.get(id)?.state === 'awaiting_confirmation') return; await new Promise((r) => setTimeout(r, 5)); } throw new Error('no pidió confirmación'); };
const confirmRun = async (agent, req, ans = { allow: true, ack: true }) => { const s = agent.submit(req); await waitConfirm(agent, s.action.id); agent.answer(s.action.id, ans); return s.done; };

test('fs.places solo devuelve ubicaciones que existen', async () => {
  const sb = sandbox(); const r = await sb.agent.run({ tool: 'fs.places', args: {} });
  assert.equal(r.state, 'succeeded'); assert.deepEqual(r.result.places.map((p) => p.id), ['documents']);
});

test('fs.list lista una carpeta real y rechaza rutas fuera de las carpetas personales', async () => {
  const sb = sandbox();
  const ok = await sb.agent.run({ tool: 'fs.list', args: { path: sb.docs } });
  assert.equal(ok.state, 'succeeded'); assert.ok(ok.result.items.some((i) => i.name === 'presupuesto.txt' && i.size === 6)); assert.equal(ok.result.parent, null); // raíz permitida
  const sub = await sb.agent.run({ tool: 'fs.list', args: { path: path.join(sb.docs, 'Sub') } }); assert.equal(sub.result.parent, sb.docs);
  const bad = await sb.agent.run({ tool: 'fs.list', args: { path: sb.outside } });
  assert.equal(bad.state, 'failed'); assert.equal(bad.error.code, 'NOT_ALLOWED_PATH');
  const trav = await sb.agent.run({ tool: 'fs.list', args: { path: path.join(sb.docs, '..', 'Fuera') } });
  assert.equal(trav.error.code, 'NOT_ALLOWED_PATH');
});

test('enlace simbólico que apunta fuera de las carpetas permitidas → rechazado', async () => {
  const sb = sandbox(); const link = path.join(sb.docs, 'enlace');
  try { fs.symlinkSync(sb.outside, link, 'dir'); } catch { return; } // sin permisos para enlaces: se omite
  const r = await sb.agent.run({ tool: 'fs.list', args: { path: link } }); assert.equal(r.error.code, 'NOT_ALLOWED_PATH');
});

test('fs.search encuentra por nombre (sin acentos ni mayúsculas) y por extensión con datos reales', async () => {
  const sb = sandbox();
  const r = await sb.agent.run({ tool: 'fs.search', args: { query: 'redes' } });
  assert.equal(r.state, 'succeeded'); assert.deepEqual(r.result.items.map((i) => i.name).sort(), ['Informe Redes.docx', 'Redes apuntes.pdf']); assert.equal(r.result.source, 'walk');
  const pdf = await sb.agent.run({ tool: 'fs.search', args: { query: '', ext: 'pdf' } }); assert.deepEqual(pdf.result.items.map((i) => i.name), ['Redes apuntes.pdf']);
  assert.equal((await sb.agent.run({ tool: 'fs.search', args: { query: 'secreto' } })).result.items.length, 0); // fuera de las carpetas permitidas
  const content = await sb.agent.run({ tool: 'fs.search', args: { query: 'dinero', mode: 'content' } });
  assert.equal(content.state, 'failed'); assert.equal(content.error.code, 'UNAVAILABLE'); // sin índice de Windows no se inventa
});

test('fs.mkdir: pide confirmación, crea la carpeta y se verifica en disco', async () => {
  const sb = sandbox(); const dir = path.join(sb.docs, 'Facturas');
  const r = await confirmRun(sb.agent, { tool: 'fs.mkdir', args: { path: dir } }, { allow: true });
  assert.equal(r.state, 'succeeded'); assert.equal(r.verified, true); assert.ok(fs.statSync(dir).isDirectory());
  const again = await confirmRun(sb.agent, { tool: 'fs.mkdir', args: { path: dir } }, { allow: true }); assert.equal(again.state, 'failed'); // ya existe
});

test('fs.move: no ejecuta sin confirmación, mueve, verifica y nunca sobrescribe', async () => {
  const sb = sandbox(); const dest = path.join(sb.docs, 'Archivo'); fs.mkdirSync(dest);
  const src = path.join(sb.docs, 'foto.png');
  const s = sb.agent.submit({ tool: 'fs.move', args: { paths: [src], toDir: dest } }); await waitConfirm(sb.agent, s.action.id);
  assert.ok(fs.existsSync(src)); // aún no se movió
  assert.match(sb.agent.get(s.action.id).summary, /Mover 1 elemento/);
  sb.agent.answer(s.action.id, { allow: true }); const r = await s.done;
  assert.equal(r.state, 'succeeded'); assert.equal(r.verified, true); assert.ok(!fs.existsSync(src)); assert.ok(fs.existsSync(path.join(dest, 'foto.png')));
  fs.writeFileSync(src, 'otra'); const clash = await confirmRun(sb.agent, { tool: 'fs.move', args: { paths: [src], toDir: dest } }, { allow: true });
  assert.equal(clash.state, 'failed'); assert.match(clash.error.message, /no sobrescribe/); assert.equal(fs.readFileSync(path.join(dest, 'foto.png'), 'utf8'), 'png');
});

test('fs.move: rechaza mover una carpeta dentro de sí misma, carpetas raíz y destinos fuera', async () => {
  const sb = sandbox();
  const self = await confirmRun(sb.agent, { tool: 'fs.move', args: { paths: [path.join(sb.docs, 'Sub')], toDir: path.join(sb.docs, 'Sub') } }, { allow: true }); assert.equal(self.state, 'failed');
  const root = await confirmRun(sb.agent, { tool: 'fs.move', args: { paths: [sb.docs], toDir: sb.desk } }, { allow: true }); assert.equal(root.state, 'failed');
  const out = await confirmRun(sb.agent, { tool: 'fs.move', args: { paths: [path.join(sb.docs, 'foto.png')], toDir: sb.outside } }, { allow: true }); assert.equal(out.error.code, 'NOT_ALLOWED_PATH');
  assert.ok(fs.existsSync(path.join(sb.docs, 'foto.png')));
});

test('fs.copy conserva el original; fs.rename cambia el nombre y verifica', async () => {
  const sb = sandbox(); const src = path.join(sb.docs, 'presupuesto.txt');
  const c = await confirmRun(sb.agent, { tool: 'fs.copy', args: { paths: [src], toDir: sb.desk } }, { allow: true });
  assert.equal(c.state, 'succeeded'); assert.ok(fs.existsSync(src)); assert.ok(fs.existsSync(path.join(sb.desk, 'presupuesto.txt')));
  const r = await confirmRun(sb.agent, { tool: 'fs.rename', args: { path: src, newName: 'presupuesto 2026.txt' } }, { allow: true });
  assert.equal(r.state, 'succeeded'); assert.ok(!fs.existsSync(src)); assert.ok(fs.existsSync(path.join(sb.docs, 'presupuesto 2026.txt')));
  const bad = await confirmRun(sb.agent, { tool: 'fs.rename', args: { path: path.join(sb.docs, 'foto.png'), newName: 'a/b:c' } }, { allow: true }); assert.equal(bad.state, 'succeeded'); // se limpia a "a b c"
  assert.ok(fs.existsSync(path.join(sb.docs, 'a b c')));
});

test('fs.trash: alto riesgo → exige confirmación fuerte; sin ack no borra; con ack va a la papelera', async () => {
  const sb = sandbox(); const f = path.join(sb.docs, 'foto.png');
  const no = await confirmRun(sb.agent, { tool: 'fs.trash', args: { paths: [f] } }, { allow: true }); // sin ack
  assert.equal(no.state, 'cancelled'); assert.ok(fs.existsSync(f)); assert.equal(sb.trashed.length, 0);
  const yes = await confirmRun(sb.agent, { tool: 'fs.trash', args: { paths: [f] } }, { allow: true, ack: true });
  assert.equal(yes.state, 'succeeded'); assert.equal(yes.verified, true); assert.deepEqual(sb.trashed, [f]);
});

test('dryRun: nada cambia en disco', async () => {
  const sb = sandbox(); const f = path.join(sb.docs, 'foto.png');
  const t = await sb.agent.run({ tool: 'fs.trash', args: { paths: [f] }, dryRun: true }); assert.equal(t.state, 'succeeded'); assert.ok(fs.existsSync(f));
  const m = await sb.agent.run({ tool: 'fs.move', args: { paths: [f], toDir: sb.desk }, dryRun: true }); assert.equal(m.result.planned[0].to, path.join(sb.desk, 'foto.png')); assert.ok(fs.existsSync(f));
});

test('fs.open bloquea programas y scripts; abre documentos permitidos', async () => {
  const sb = sandbox(); fs.writeFileSync(path.join(sb.docs, 'x.bat'), 'echo'); fs.writeFileSync(path.join(sb.docs, 'ok.txt'), 't');
  const bad = await sb.agent.run({ tool: 'fs.open', args: { path: path.join(sb.docs, 'x.bat') } }); assert.equal(bad.error.code, 'POLICY_BLOCKED');
  const ok = await sb.agent.run({ tool: 'fs.open', args: { path: path.join(sb.docs, 'ok.txt') } }); assert.equal(ok.state, 'succeeded');
});

test('origen IA: abrir un archivo exige confirmación (aiRisk)', async () => {
  const sb = sandbox(); const s = sb.agent.submit({ tool: 'fs.open', args: { path: path.join(sb.docs, 'presupuesto.txt') }, origin: 'ai' });
  await waitConfirm(sb.agent, s.action.id); sb.agent.cancel(s.action.id); assert.equal((await s.done).state, 'cancelled');
});

test('herramientas de Windows en otra plataforma: error real UNAVAILABLE, no datos inventados', async () => {
  const sb = sandbox();
  for (const [tool, args] of [['system.windows', {}], ['media.status', {}], ['media.volume.get', {}], ['apps.list', {}], ['system.processes', {}]]) {
    const r = await sb.agent.run({ tool, args }); assert.equal(r.state, 'failed', tool); assert.equal(r.error.code, 'UNAVAILABLE', tool);
  }
  const m = await sb.agent.run({ tool: 'system.metrics', args: {} }); assert.equal(m.result.available, false); assert.equal(m.result.cpu, null);
});

test('system.metrics usa las cifras reales del worker y deja null lo que no existe', async () => {
  const sb = sandbox(); const core = createCore({ shell: {}, execFile() {}, getRoots: () => [sb.docs], getStats: () => ({ cpu: 12, ram: 40, disk: 55, gpu: null, temp: null, rx: 3, tx: 1 }), platform: 'linux' });
  const r = await core.agent.run({ tool: 'system.metrics', args: {} });
  assert.equal(r.result.cpu, 12); assert.equal(r.result.gpu, null); assert.equal(r.result.gpuTemp, null); assert.equal(r.result.available, true);
});

test('registro: todas las herramientas tienen riesgo, resumen y esquema coherentes', () => {
  const { registry } = sandbox().core; assert.ok(registry.size() >= 20);
  for (const t of registry.list()) { assert.ok(['low', 'confirm', 'high'].includes(t.risk), t.name); assert.equal(typeof t.summarize, 'function'); assert.equal(typeof t.execute, 'function'); }
  const writers = registry.list().filter((t) => ['fs.move', 'fs.copy', 'fs.rename', 'fs.mkdir', 'fs.trash'].includes(t.name)); assert.equal(writers.length, 5);
  assert.ok(writers.every((t) => t.risk !== 'low' && typeof t.dryRun === 'function' && typeof t.verify === 'function'));
});
