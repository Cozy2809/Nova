// Puente mínimo y seguro renderer <-> main
const { contextBridge, ipcRenderer } = require('electron');
const on = (ch) => (cb) => { const f = (_e, d) => cb(d); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); };
contextBridge.exposeInMainWorld('jarvis', {
  chat: (id, messages) => ipcRenderer.invoke('ai:chat', { id, messages }),
  onChunk: on('ai:chunk'),
  onStats: on('stats'),
  tool: (name, args) => ipcRenderer.invoke('tool:run', { name, args }),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (s) => ipcRenderer.invoke('settings:set', s),
  memAdd: (role, content) => ipcRenderer.invoke('mem:add', { role, content }),
  memClear: () => ipcRenderer.invoke('mem:clear'),
  onLevel: on('voice:level'),
  say: (text) => ipcRenderer.invoke('voice:say', text),
  stop: () => ipcRenderer.invoke('voice:stop'),
  onVoiceEvent: on('voice:event'),
  itemAdd: (kind, text) => ipcRenderer.invoke('item:add', { kind, text }),
  itemList: (kind) => ipcRenderer.invoke('item:list', kind),
  itemClear: (kind) => ipcRenderer.invoke('item:clear', kind),
  openApp: (id) => ipcRenderer.invoke('app:open', id),
  cancelListen: () => ipcRenderer.invoke('voice:cancel'),
  onCommand: on('app:cmd'),
  convoState: (on) => ipcRenderer.send('app:convoState', on),
  notify: (p) => ipcRenderer.invoke('notify:send', p),
  whatsapp: (p) => ipcRenderer.invoke('whatsapp:send', p),
  toggleLoopback: (on) => ipcRenderer.invoke('voice:toggleLoopback', on),
  memHistory: () => ipcRenderer.invoke('mem:history'),
  memSearch: (q) => ipcRenderer.invoke('mem:search', q),
  listen: () => ipcRenderer.invoke('voice:listen'),
  speak: (text) => ipcRenderer.invoke('voice:speak', text),
  win: (action) => ipcRenderer.send('win', action)
});
