# Nova update 30 — Windows + Nova como un solo entorno

Base requerida: **update 29 ya integrada** (el instalador lo comprueba por hash y se detiene si no coincide).

## Qué cambia

**Corrige fallos de la update 29**
- Los accesos fijados del dock no se abrían (el IPC rechazaba a la ventana del dock). Ahora se lanzan desde el proceso principal por identificador, con la misma política de seguridad del agente.
- Se perdían la posición del panel y el monitor guardados (el `merge` de `prefs.js` descartaba claves desconocidas) y las ventanas se pisaban entre sí al guardar. Ahora hay **un único almacén de preferencias en el proceso principal**; cada ventana envía solo el parche de lo que cambió y todas reciben el resultado.
- Los avisos enviados con `notify:send` nunca llegaban al centro de avisos. Ahora todo pasa por un centro de avisos del proceso principal (historial persistente en `nova-notices.json`, no leídos, duplicados agrupados).
- El acceso de Inicio abría un Electron vacío si Nova no estaba en modo `--dev`, y no agrupaba con el icono de la barra de tareas. Ahora pasa la carpeta del proyecto y usa `appUserModelId`.
- La barra superior tapaba los botones de las ventanas maximizadas; el dock/barra robaban el foco; no se reaccionaba a cambiar de monitor/resolución; ocultar los widgets cerraba Nova aunque el dock siguiera; Alt+F4 destruía la ventana principal; las estadísticas se pausaban con widgets visibles; el botón de widgets no traía el panel al frente; el orbe de Nova arrancaba el modo escucha en vez de abrir Nova; el panel no se restauraba al arrancar.

**Integración con Windows (API públicas, sin sustituir el shell)**
- **Dock** ajustado a su contenido, sin robar foco, con iconos reales, ventanas abiertas (activa, minimizada), clic para traer al frente/minimizar, menú contextual (mostrar, minimizar, maximizar, restaurar, cerrar), accesos al **menú Inicio**, **vista de tareas** y **mostrar escritorio**. Admite carpetas y varios monitores.
- **Barra superior** compacta (según contenido) por defecto, alineación izquierda/centro/derecha, ancho completo opcional, ocultación automática en el borde, módulos configurables (estado, voz, widgets, dock, Inicio, campana con contador, aviso emergente, aplicación activa, CPU/RAM, hora), una por monitor.
- **Monitores**: dock y barra siguen conectar/desconectar monitores, resolución, DPI y la posición de la barra de tareas; si un monitor elegido desaparece pasan a la principal.
- **Pantalla completa / no molestar**: dock y barra se ocultan con juegos, vídeo a pantalla completa o presentaciones; con el modo concentración de Windows los avisos se guardan sin emergente.
- **Barra de tareas real**: lista de salto (clic derecho en el icono de Nova: hablar, widgets, dock, asistente) y punto rojo con avisos sin leer.
- **Inicio y cierre**: instancia única; Nova arranca opcionalmente solo con dock/barra/widgets («Al arrancar: solo dock, barra y widgets»); cerrar la ventana la oculta mientras haya shell activo; «Iniciar con Windows» reutiliza el ajuste existente; modo calma con **Ctrl+Alt+N**.
- **Tema**: «Sistema» sigue el modo claro/oscuro de Windows y «Color de Windows» su acento.
- **Widgets**: un solo sistema visual (tarjetas, cabeceras, foco visible, reducción de movimiento, alto contraste), reordenables con subir/bajar, atenuación en reposo, centro de avisos con estados.

## Lo que NO se hace (y por qué)
- No se reemplaza ni se modifica la barra de tareas/Explorer, ni se reserva espacio de pantalla (AppBar) desde Electron: dock y barra son capas encima de las ventanas, por eso la barra es compacta y se puede ocultar.
- El vidrio es translúcido por CSS: Electron no desenfoca el escritorio real en ventanas transparentes. Acrylic/Mica quedan fuera hasta poder probarlos en tu Windows 11.
- Los widgets no se anclan «bajo» las ventanas (eso exige trucos no públicos del shell).

## Instalación (Nova cerrada)
```powershell
Set-Location '.'
Expand-Archive -LiteralPath "$HOME\Downloads\nova-update30.zip" -DestinationPath $env:TEMP\nova-update30 -Force
python "$env:TEMP\nova-update30\tools\instalar_nova30.py" --project '"$PWD"' --comprobar
python "$env:TEMP\nova-update30\tools\instalar_nova30.py" --project '"$PWD"'
if ($LASTEXITCODE -ne 0) { throw 'El instalador se detuvo; no se cambió nada.' }
npm test
npm run build
```
El instalador verifica la integridad del paquete y la versión base de **todos** los archivos antes de copiar ninguno, guarda los originales en `backup-nova30-AAAAMMDD-HHMMSS\` (ignorada por Git) y deshace sola la instalación si algo falla a mitad. No toca `.env`, conversaciones, base de datos, voces ni dependencias (`package.json` y `package-lock.json` no cambian).

## Reversión (Nova cerrada)
```powershell
python "$env:TEMP\nova-update30\tools\instalar_nova30.py" --project '"$PWD"' --revertir
npm run build
```
Restaura los archivos de la copia y borra los archivos nuevos de la update. Tus preferencias guardadas siguen siendo válidas; la update 29 solo ignorará los ajustes nuevos. `nova-notices.json` (en `%APPDATA%\jarvis-clone`) puede borrarse a mano si quieres.

## Comprobaciones manuales (en Windows)
1. **Ajustes › Integración con Windows**: activa dock y barra; deben aparecer sin quitar el foco a la app que estabas usando.
2. Dock: pulsa un acceso fijado (app, archivo y carpeta) → se abre. Abre el Bloc de notas → aparece con punto; clic lo minimiza/trae; clic derecho → menú.
3. Dock: Inicio, vista de tareas y mostrar escritorio funcionan.
4. Maximiza una ventana: los botones de cerrar/minimizar siguen accesibles (barra compacta centrada).
5. Reproduce un vídeo a pantalla completa → dock y barra se ocultan; al salir vuelven. Prueba el modo «no molestar».
6. Con dos monitores: elige ambos; desconecta uno → pasa a la principal; reconéctalo.
7. Mueve/oculta la barra de tareas de Windows y cambia la resolución → el dock se recoloca.
8. Pide a Nova un aviso al móvil → aparece en la barra y en el centro de avisos; desactiva la barra → sale como aviso de Windows.
9. Punto rojo en el icono de Nova en la barra de tareas con avisos sin leer; se quita al leerlos.
10. Clic derecho en el icono de Nova en la barra de tareas → lista de salto; probar «Hablar con Nova» con Nova ya abierta (no abre una segunda).
11. Cierra la ventana de Nova con dock activo → Nova sigue; Salir desde la bandeja o el menú del dock.
12. Reinicia: dock, barra, panel y su posición vuelven. Prueba «Al arrancar: solo dock, barra y widgets».
13. **Crear acceso** en Inicio, anclarlo a la barra de tareas y abrirlo (debe abrir Nova, no Electron vacío, y agrupar con la ventana).
14. Ctrl+Alt+N oculta/muestra dock y barra.

Los scripts de PowerShell nuevos (`shellwatch.ps1`, `shell.ps1`, `windows.ps1`) y la lógica de Electron no se pudieron ejecutar en Windows en el entorno de desarrollo: están cubiertos por pruebas con simulaciones (63 en total) y compilados con esbuild, pero los puntos 2–7, 9–10 y 13 son los que hay que confirmar. Si el vigilante falla, el dock sigue visible (solo se pierde el ocultar en pantalla completa y la lista de ventanas).
