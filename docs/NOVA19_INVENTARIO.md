# Update 19 — inventario de archivos

## Añadidos (van dentro del ZIP; ninguno existía antes)

| Archivo | Bytes |
|---|---|
| `LEEME-NOVA19.md` | 6798 |
| `docs/NOVA19_INVENTARIO.md` | — |
| `docs/NOVA_AGENT_INTEGRATION.md` | 9250 |
| `docs/NOVA_ANDROID.md` | 2585 |
| `docs/NOVA_AUDITORIA_Y_PLAN.md` | 7836 |
| `electron/agent/audit.js` | 1524 |
| `electron/agent/contract.js` | 1926 |
| `electron/agent/ipc.js` | 3193 |
| `electron/agent/permissions.js` | 3569 |
| `electron/agent/registry.js` | 2389 |
| `electron/agent/runner.js` | 11090 |
| `electron/agent/schema.js` | 3483 |
| `electron/agent/tools/fs.js` | 9403 |
| `electron/agent/tools/system.js` | 5569 |
| `electron/desktop/fsGuard.js` | 2415 |
| `electron/desktop/fsService.js` | 7471 |
| `electron/desktop/index.js` | 3798 |
| `electron/desktop/ps/media.ps1` | 2967 |
| `electron/desktop/ps/search.ps1` | 2338 |
| `electron/desktop/ps/volume.ps1` | 3281 |
| `electron/desktop/ps/windows.ps1` | 1432 |
| `electron/desktop/system.js` | 7443 |
| `src/desktop/AskDialog.jsx` | 1277 |
| `src/desktop/ConfirmHost.jsx` | 2440 |
| `src/desktop/DesktopShell.jsx` | 5588 |
| `src/desktop/Dock.jsx` | 5188 |
| `src/desktop/Icon.jsx` | 3887 |
| `src/desktop/StartMenu.jsx` | 6872 |
| `src/desktop/TopBar.jsx` | 5070 |
| `src/desktop/WindowFrame.jsx` | 3245 |
| `src/desktop/agent.js` | 2934 |
| `src/desktop/apps/Activity.jsx` | 3234 |
| `src/desktop/apps/DeskSettings.jsx` | 10220 |
| `src/desktop/apps/Explorer.jsx` | 12856 |
| `src/desktop/apps/Media.jsx` | 3504 |
| `src/desktop/apps/SystemPanel.jsx` | 3929 |
| `src/desktop/desktop.css` | 18247 |
| `src/desktop/media.js` | 1713 |
| `src/desktop/prefs.js` | 2403 |
| `src/desktop/util.js` | 1068 |
| `src/desktop/widgets/Widgets.jsx` | 8988 |
| `src/desktop/windows.js` | 3705 |
| `test/agent.test.js` | 13310 |
| `test/desktop.test.js` | 11478 |
| `test/ipc.test.js` | 3465 |
| `tools/instalar_nova19.py` | 7893 |
| `tools/nova19_manifest.txt` | 1146 |

## Modificados (los parchea `tools/instalar_nova19.py`; copia `.bak-nova19` de cada uno)

| Archivo | Cambio |
|---|---|
| `electron/main.js` | +2 líneas: `require('./desktop').init(...)` y `.setStats(m)` |
| `electron/preload.js` | +bloque `agent: {...}` (API mínima del agente) |
| `electron/pcControl.js` | exporta `_roots` |
| `src/App.jsx` | botón ESCRITORIO, vista `DesktopShell`, `startInDesktop` |
| `package.json` | script `test` |

## Eliminados

Ninguno.


## Dependencias nuevas

Ninguna. (Usa Node/Electron, React y PowerShell ya presentes.)
