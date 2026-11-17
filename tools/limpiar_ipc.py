#!/usr/bin/env python3
"""Limpia electron/main.js de registros IPC duplicados (ipcMain.handle/on/once) y de lineas require duplicadas.
   python tools\\limpiar_ipc.py electron\\main.js            -> solo informa (no toca nada)
   python tools\\limpiar_ipc.py electron\\main.js --aplicar  -> copia .bak, limpia y valida con node --check (si falla, restaura)
Se queda con la PRIMERA aparicion de cada canal y avisa si las copias eran distintas."""
import re, shutil, subprocess, sys, time

def skip_string(t, i):
    q = t[i]; i += 1
    while i < len(t):
        c = t[i]
        if c == '\\': i += 2; continue
        if c == q: return i + 1
        if q == '`' and c == '$' and t[i + 1:i + 2] == '{': i = scan(t, i + 1); continue
        i += 1
    raise ValueError('cadena sin cerrar')

def skip_regex(t, i):
    i += 1; cls = False
    while i < len(t):
        c = t[i]
        if c == '\\': i += 2; continue
        if c == '[': cls = True
        elif c == ']': cls = False
        elif c == '/' and not cls: return i + 1
        elif c == '\n': raise ValueError('regex sin cerrar')
        i += 1
    raise ValueError('regex sin cerrar')

KW = {'return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'yield', 'await'}

def prev_word(t, i):
    j = i - 1
    while j >= 0 and t[j].isspace(): j -= 1
    k = j
    while k >= 0 and (t[k].isalnum() or t[k] in '_$'): k -= 1
    return t[k + 1:j + 1]

def scan(t, i):
    """t[i] es un abridor; devuelve el indice tras su cierre, respetando cadenas, comentarios y regex."""
    depth, prev = 0, ''
    while i < len(t):
        c = t[i]
        if c in '\'"`': i = skip_string(t, i); prev = 'x'; continue
        if c == '/' and t[i + 1:i + 2] == '/': j = t.find('\n', i); i = len(t) if j < 0 else j; continue
        if c == '/' and t[i + 1:i + 2] == '*':
            j = t.find('*/', i + 2)
            if j < 0: raise ValueError('comentario sin cerrar')
            i = j + 2; continue
        if c == '/' and (prev == '' or prev in '(,=:[!&|?{};+-*%<>~^' or prev_word(t, i) in KW): i = skip_regex(t, i); prev = 'x'; continue
        if c in '({[': depth += 1
        elif c in ')}]':
            depth -= 1
            if depth == 0: return i + 1
        if not c.isspace(): prev = c
        i += 1
    raise ValueError('llaves/parentesis sin cerrar')

def main():
    if len(sys.argv) < 2: print(__doc__); sys.exit(1)
    path, aplicar = sys.argv[1], '--aplicar' in sys.argv
    text = open(path, encoding='utf-8').read()
    line = lambda pos: text.count('\n', 0, pos) + 1
    RE = re.compile(r"^[ \t]*ipcMain\.(handle|on|once)\(\s*(['\"])([^'\"]+)\2\s*,", re.M)
    seen, remove, avisos = {}, [], 0
    for m in RE.finditer(text):
        key = ('handle' if m.group(1) == 'handle' else 'listen', m.group(3))
        p = text.index('(', m.start())
        try: end = scan(text, p)
        except ValueError as e: avisos += 1; print(f'AVISO linea {line(m.start())}: no pude analizar {m.group(3)}: {e}. Revisalo a mano.'); continue
        k = end
        while k < len(text) and text[k] in ' \t': k += 1
        if k < len(text) and text[k] == ';': k += 1
        while k < len(text) and text[k] in ' \t': k += 1
        if text[k:k + 2] == '\r\n': k += 2
        elif text[k:k + 1] == '\n': k += 1
        body = re.sub(r'\s+', ' ', text[m.start():end])
        if key in seen: remove.append((m.start(), k, key, line(m.start()), seen[key][0], body != seen[key][1]))
        else: seen[key] = (line(m.start()), body)
    req_seen, lines, pos = set(), text.split('\n'), 0
    for n, l in enumerate(lines):
        s = l.rstrip('\r')
        if re.match(r'^(?:const|let|var)\s+.+=\s*require\(.+\);\s*$', s):
            if s in req_seen: remove.append((pos, pos + len(l) + 1, ('require', s.strip()), n + 1, None, False))
            req_seen.add(s)
        pos += len(l) + 1
    decl = {}
    for n, l in enumerate(lines):
        mm = re.match(r'^(?:async\s+)?function\s+(\w+)|^(?:const|let)\s+(\w+)\s*=', l)
        if mm and not re.match(r'^(?:const|let)\s+.+=\s*require\(', l): decl.setdefault(mm.group(1) or mm.group(2), []).append(n + 1)
    for name, ls in decl.items():
        if len(ls) > 1: print(f'AVISO: "{name}" se declara varias veces (lineas {ls}); revisalo a mano.')
    if not remove:
        print('Sin duplicados detectados. Canales registrados:', len(seen) + avisos + 0, '(OJO: hubo avisos de bloques no analizados)' if avisos else ''); sys.exit(3 if avisos else 0)
    remove.sort()
    for s, e, key, ln, first, distinto in remove:
        extra = f' (la primera esta en la linea {first})' if first else ''
        print(f'DUPLICADO linea {ln}: {key[0]} {key[1]}{extra}' + ('  <-- el contenido es DISTINTO, revisalo' if distinto else ''))
    if not aplicar:
        print(f'\n{len(remove)} bloque(s) a quitar. Repite con --aplicar para limpiar.'); return
    bak = f'{path}.bak-{time.strftime("%Y%m%d-%H%M%S")}'; shutil.copy(path, bak)
    out, last = [], 0
    for s, e, *_ in remove: out.append(text[last:s]); last = e
    out.append(text[last:]); new = ''.join(out)
    open(path, 'w', encoding='utf-8', newline='').write(new)
    r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    if r.returncode != 0:
        shutil.copy(bak, path); print('ERROR de sintaxis tras limpiar; restaurado el original.\n', r.stderr); sys.exit(2)
    print(f'Hecho. Copia de seguridad: {bak}. Sintaxis OK (node --check).')
if __name__ == '__main__':
    main()
