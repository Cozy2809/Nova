// Isla emergente Nova 18: mantiene el icono y anima suavemente el panel ampliado.
const path = require('path');
let deps = null, isl = null, timer = null, transitionTimer = null;
let expanded = false, transitioning = false, pinned = false, leaveAt = 0;
let lastState = { st: 'idle' };
const W = 176, H = 40, PANEL_W = 620, PANEL_H = 620, MOTION_MS = 210;
const within = (p, b, m = 0) => p.x >= b.x - m && p.x <= b.x + b.width + m && p.y >= b.y - m && p.y <= b.y + b.height + m;
function ui(phase) { try { deps?.getWin()?.webContents.send('nova:island-ui', { phase }); } catch {} }
function placePanel() {
  const win = deps.getWin(); if (!win || !isl) return;
  const ib = isl.getBounds(), wa = deps.screen.getDisplayNearestPoint({ x: ib.x, y: ib.y }).workArea;
  const width = Math.max(360, Math.min(PANEL_W, wa.width - 20));
  const height = Math.max(420, Math.min(PANEL_H, wa.height - 20));
  let x = Math.round(ib.x + ib.width / 2 - width / 2);
  let y = ib.y + ib.height + 5;
  x = Math.max(wa.x + 10, Math.min(wa.x + wa.width - width - 10, x));
  if (y + height > wa.y + wa.height - 10) y = Math.max(wa.y + 10, ib.y - height - 5);
  win.setSize(width, height); win.setPosition(x, y);
}
function expand() {
  const win = deps?.getWin(); if (!win || !isl || expanded || transitioning) return;
  clearTimeout(transitionTimer); placePanel();
  win.setAlwaysOnTop(true, 'screen-saver'); win.setOpacity(0); win.showInactive();
  expanded = true; leaveAt = 0; ui('enter');
  transitionTimer = setTimeout(() => { try { if (expanded) win.setOpacity(1); } catch {} }, 32);
}
function collapse() {
  const win = deps?.getWin(); if (!win || !expanded || transitioning) return;
  expanded = false; transitioning = true; pinned = false; leaveAt = 0; ui('exit');
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    try { win.hide(); win.setOpacity(1); } catch {}
    ui('reset'); transitioning = false;
  }, MOTION_MS);
}
function poll() {
  const win = deps?.getWin(); if (!win || !isl || transitioning) return;
  const p = deps.screen.getCursorScreenPoint(), ib = isl.getBounds(), wb = win.getBounds();
  const inIsl = within(p, ib, 14), inWin = expanded && win.isVisible() && within(p, wb, 10);
  if (!expanded) { if (inIsl && !win.isVisible()) expand(); return; }
  const busy = lastState.st && lastState.st !== 'idle';
  if (inIsl || inWin || pinned || busy || win.isFocused()) { leaveAt = 0; return; }
  if (!leaveAt) leaveAt = Date.now(); else if (Date.now() - leaveAt > 520) collapse();
}
function start() {
  if (isl || !deps) return;
  clearInterval(timer); clearTimeout(transitionTimer); transitioning = false; expanded = false; pinned = false; ui('reset');
  const { BrowserWindow, screen, ipcMain } = deps, wa = screen.getPrimaryDisplay().workArea;
  isl = new BrowserWindow({ width: W, height: H, x: Math.round(wa.x + wa.width / 2 - W / 2), y: wa.y + 4, frame: false, transparent: true, resizable: false, movable: false, minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true, focusable: false, hasShadow: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'islandPreload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false } });
  isl.setAlwaysOnTop(true, 'screen-saver'); isl.loadFile(path.join(__dirname, 'island.html'));
  isl.once('ready-to-show', () => { isl?.showInactive(); isl?.webContents.send('island:state', lastState); });
  isl.on('closed', () => { isl = null; });
  deps.onClick = () => { if (expanded && pinned) collapse(); else { pinned = true; if (!expanded) expand(); } };
  ipcMain.removeAllListeners('island:click'); ipcMain.on('island:click', () => deps.onClick());
  const win = deps.getWin(); if (win) { win.setOpacity(1); win.hide(); }
  timer = setInterval(poll, 70); deps.mem.setSettings({ islandMode: 'true' });
}
function stop() {
  if (!isl) return;
  clearInterval(timer); clearTimeout(transitionTimer); timer = null; transitionTimer = null;
  ui('reset'); try { isl.destroy(); } catch {} isl = null; expanded = false; transitioning = false; pinned = false; leaveAt = 0;
  const win = deps.getWin(); if (win) { win.setOpacity(1); win.setAlwaysOnTop(false); win.setSize(1280, 800); win.center(); win.show(); win.focus(); }
  deps.mem.setSettings({ islandMode: 'false' });
}
module.exports = {
  init(d) { deps = d; }, start, stop, active: () => !!isl,
  setState(s) { lastState = s || { st: 'idle' }; try { isl?.webContents.send('island:state', lastState); } catch {} }
};
