const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('island', {
  onState: (cb) => ipcRenderer.on('island:state', (_e, d) => cb(d)),
  click: () => ipcRenderer.send('island:click')
});
