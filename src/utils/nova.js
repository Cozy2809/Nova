// Atajos para las funciones internas de Nova (electron/novaIpc.js). Devuelve { error } si no están disponibles.
export const nv = (ch, d) => (window.jarvis?.nova ? window.jarvis.nova(ch, d) : Promise.resolve({ error: 'No disponible aquí' }));
export const onNv = (ch, cb) => (window.jarvis?.onNova ? window.jarvis.onNova(ch, cb) : () => {});
