#!/usr/bin/env python3
"""Arregla el error 'Cannot read properties of null (reading slice)' del panel de memoria. IDEMPOTENTE, copia .bak-mem.
   python tools\\arreglar_memoria.py     (desde la carpeta jarvis-clone, con JARVIS cerrado)
Causa: se guardo un mensaje con contenido nulo en la base de datos (una orden que no devolvio texto)."""
import os, shutil, subprocess, sys
ROOT = os.getcwd(); P = lambda *a: os.path.join(ROOT, *a)
rd = lambda p: open(p, 'rb').read().decode('utf-8-sig', errors='replace')
def patch(rel, marker, pairs, check=False):
    p = P(*rel.split('/'))
    if not os.path.exists(p): print(f'[FALLO] {rel} no existe'); return
    t = rd(p)
    if marker in t: print(f'[YA ESTABA] {rel}'); return
    new = t
    for old, nw in pairs:
        if old not in new: print(f'[FALLO] {rel}: no encuentro el fragmento a cambiar ({old[:50]}...). Enviame ese archivo.'); return
        new = new.replace(old, nw, 1)
    if not os.path.exists(p + '.bak-mem'): shutil.copy(p, p + '.bak-mem')
    open(p, 'wb').write(new.encode('utf-8'))
    if check:
        r = subprocess.run(['node', '--check', p], capture_output=True, text=True)
        if r.returncode: shutil.copy(p + '.bak-mem', p); print(f'[FALLO] {rel}: error de sintaxis, restaurado: {r.stderr[:150]}'); return
    print(f'[REPARADO] {rel}')
if not os.path.isdir(P('electron')): print('Ejecutalo desde la carpeta jarvis-clone.'); sys.exit(1)
patch('src/components/MemoryPanel.jsx', "String(r.content ?? '')", [("r.content.slice(0, 120)", "String(r.content ?? '').slice(0, 120)")])
patch('electron/memoryService.js', "DELETE FROM messages WHERE content IS NULL", [
    ("add: (role, content) => db.prepare('INSERT INTO messages(role,content,ts) VALUES(?,?,?)').run(role, content, Date.now()),",
     "add: (role, content) => { if (content == null || !String(content).trim()) return; return db.prepare('INSERT INTO messages(role,content,ts) VALUES(?,?,?)').run(role, String(content), Date.now()); },"),
    ("module.exports = {", "db.prepare(\"DELETE FROM messages WHERE content IS NULL OR TRIM(content) = ''\").run(); // limpia filas vacías antiguas\nmodule.exports = {")], check=True)
patch('src/hooks/useAI.js', "content == null || String(content)", [("const reply = (content, sources) => { set(", "const reply = (content, sources) => { if (content == null || String(content).trim() === '') content = 'Entendido, Señor.'; set(")])
print('\nListo. Reinicia JARVIS (Ctrl+C y npm run dev): el cambio de electron/ solo se aplica al reiniciar.')
