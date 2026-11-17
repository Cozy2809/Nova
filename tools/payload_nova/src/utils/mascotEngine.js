// Mascota neón de NOVA (canvas 2D puro). Saluda, mueve la boca al hablar, escucha, piensa,
// juega cuando hay inactividad (pelota, paseo, juguetes, dibujo) y se duerme si el Señor tarda mucho.
const TAU = Math.PI * 2;
const PLAYS = ['ball', 'walk', 'toys', 'draw', 'dance', 'stars'];
const CAP = {
  ball: ['¡Pelota!', '¡Goool!', 'Uy, se escapó'], walk: ['Paseíto…', 'La, la, la…', '¡Qué buen día!'],
  toys: ['Mira, cubos', 'Cuac, cuac', '¡Un trompo!'], draw: ['Estoy dibujando', '¡Una estrella!', '¡Un corazón!'],
  dance: ['¡Mira cómo bailo!', 'Chun, chun, chun', 'Uuu, ritmo'], stars: ['Qué bonitas…', 'Una estrella fugaz', 'Mira cuántas'], pet: ['¡Jiji!', 'Cosquillas', 'Me gusta', '¡Mimitos!'],
  greet: ['¡Hola, Señor!'], wake: ['¡Ya volvió!'], sleep: ['zzz…']
};
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const SHAPES = [
  [[0.1, 0.8], [0.25, 0.2], [0.4, 0.8], [0.55, 0.2], [0.7, 0.8], [0.85, 0.2]],
  Array.from({ length: 11 }, (_, i) => { const r = i % 2 ? 0.2 : 0.45, a = -Math.PI / 2 + (i * Math.PI) / 5; return [0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]; }),
  Array.from({ length: 37 }, (_, i) => { const a = (i / 36) * TAU; return [0.5 + (16 * Math.sin(a) ** 3) / 40, 0.45 - (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 40]; })
];

export function createMascot(ctx, W, H, { reduce = false, boredAfter = 40, sleepAfter = 240 } = {}) {
  const ground = H - 14, mid = W / 2;
  let t = 0, mode = 'greet', modeT = 0, idleFor = 0, lastPlay = '', playLen = 16;
  let x = mid, dir = 1, step = 0, blinkT = rnd(2, 4), blinkP = -1, blink = 0, lx = 0, ly = 0, tx = 0, ty = 0, lookT = 0, mouth = 0;
  let caption = '', capLife = 0, capAt = 6, draw = 0, shape = 0, lastToy = -1, kickAnim = 0, kickDir = 1, propPos = [mid, ground];
  const ball = { x: mid + 70, y: ground - 30, vx: 0, vy: 0, r: 7, kick: 1 };
  const fx = []; // partículas: corazones, chispas y notas musicales
  const burst = (kind, n, px = x, py = ground - 52) => { for (let i = 0; i < n; i++) fx.push({ kind, x: px + rnd(-16, 16), y: py + rnd(-6, 6), vx: rnd(-22, 22), vy: -rnd(22, 52), life: rnd(1.1, 1.9), age: 0, s: rnd(0.8, 1.3), ph: rnd(0, TAU) }); if (fx.length > 40) fx.splice(0, fx.length - 40); };
  const say = (s) => { caption = s; capLife = 2.6; };
  const isPlay = (m) => PLAYS.includes(m);
  say(CAP.greet[0]);

  const neon = (h, l = 62, a = 1) => `hsla(${h},100%,${l}%,${a})`;
  const glow = (h, b = 8) => { ctx.shadowColor = neon(h, 55); ctx.shadowBlur = b; };
  const noGlow = () => { ctx.shadowBlur = 0; };
  function rr(x0, y0, w, h, r) { ctx.beginPath(); ctx.moveTo(x0 + r, y0); ctx.arcTo(x0 + w, y0, x0 + w, y0 + h, r); ctx.arcTo(x0 + w, y0 + h, x0, y0 + h, r); ctx.arcTo(x0, y0 + h, x0, y0, r); ctx.arcTo(x0, y0, x0 + w, y0, r); ctx.closePath(); }

  function setMode(m) {
    if (mode === m) return; mode = m; modeT = 0;
    if (m === 'ball') { ball.x = clamp(x + 45 * dir, 20, W - 20); ball.y = ground - 30; ball.vx = rnd(-40, 40); ball.vy = 0; ball.kick = 1; }
    if (m === 'walk') dir = Math.random() < 0.5 ? -1 : 1;
    if (m === 'draw') { draw = 0; shape = 0; }
    if (m === 'toys') lastToy = -1;
    if (m === 'pet') { say(pick(CAP.pet)); burst('heart', 7); }
    if (m === 'greet') say(CAP.greet[0]);
    if (m === 'sleep') say(CAP.sleep[0]);
  }
  function startPlay() {
    let p; do { p = pick(PLAYS); } while (p === lastPlay);
    lastPlay = p; playLen = rnd(14, 20); setMode(p); if (p !== 'toys') say(pick(CAP[p])); capAt = rnd(5, 8);
  }

  function tick(dt, inp = {}) {
    dt = clamp(dt || 0, 0, 0.1); t += dt; modeT += dt;
    const st = inp.state || 'idle', busy = st === 'speaking' || st === 'listening' || st === 'thinking';
    if (inp.active || busy) idleFor = 0; else idleFor += dt;
    if (st === 'speaking') setMode('talk'); else if (st === 'listening') setMode('listen'); else if (st === 'thinking') setMode('think');
    else if (mode === 'talk' || mode === 'listen' || mode === 'think') setMode('idle');
    if (inp.active && (isPlay(mode) || mode === 'sleep')) { setMode('greet'); say(CAP.wake[0]); }
    if (mode === 'greet' && modeT > 3.2) setMode('idle');
    if (mode === 'pet' && modeT > 2.6) setMode('idle');
    if (!reduce) {
      if (mode === 'idle' && idleFor > boredAfter) startPlay();
      else if (isPlay(mode) && modeT > playLen) { if (idleFor > sleepAfter) setMode('sleep'); else startPlay(); }
    }
    if (capLife > 0) capLife -= dt;
    capAt -= dt; if (isPlay(mode) && mode !== 'toys' && capAt <= 0 && capLife <= 0) { say(pick(CAP[mode])); capAt = rnd(5, 8); }
    // movimiento
    const mv = reduce ? 0.3 : 1;
    if (mode === 'walk') { x += dir * 26 * dt * mv; step += dt * 6; if (x > W * 0.8) dir = -1; if (x < W * 0.2) dir = 1; }
    else if (mode === 'ball') {
      ball.vy += 520 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
      const floor = ground - ball.r;
      if (ball.y > floor) { ball.y = floor; ball.vy = Math.abs(ball.vy) > 25 ? -ball.vy * 0.68 : 0; ball.vx *= 0.985; }
      if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx) * 0.8; }
      if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx) * 0.8; }
      x = lerp(x, clamp(ball.x - 30 * (ball.vx >= 0 ? 1 : -1), 40, W - 40), Math.min(1, dt * 1.6));
      ball.kick -= dt; kickAnim = Math.max(0, kickAnim - dt * 3);
      if (ball.kick <= 0 && Math.abs(ball.x - x) < 55) {
        kickDir = ball.x >= x ? 1 : -1; ball.vx = kickDir * rnd(70, 130); ball.vy = -rnd(150, 260); ball.kick = rnd(1.8, 3); kickAnim = 1;
        if (Math.random() < 0.4) say(pick(CAP.ball));
      }
    } else if (mode === 'dance') {
      x = mid + Math.sin(modeT * 2.2) * W * 0.18; step += dt * 8;
    } else if (mode === 'toys') {
      x = lerp(x, W * 0.4, Math.min(1, dt * 2)); const k = Math.floor(modeT / 4.5) % 3; if (k !== lastToy) { lastToy = k; say(CAP.toys[k]); }
    } else if (mode === 'draw') {
      x = lerp(x, W * 0.34, Math.min(1, dt * 2)); draw += dt * 0.22;
      if (draw >= 1) { draw = 0; shape = (shape + 1) % 3; say(['Otra vez…', '¡Una estrella!', '¡Un corazón!'][shape]); }
    } else x = lerp(x, mid, Math.min(1, dt * 2));
    // parpadeo
    blinkT -= dt; if (blinkT <= 0 && blinkP < 0) blinkP = 0;
    if (blinkP >= 0) { blinkP += dt / 0.14; blink = Math.sin(Math.min(1, blinkP) * Math.PI); if (blinkP >= 1) { blinkP = -1; blink = 0; blinkT = rnd(2, 5.5); } }
    // mirada
    const bob = (mode === 'walk' ? Math.sin(step * 2) * 1.6 : Math.sin(t * 2) * 0.8) * (reduce ? 0.3 : 1), headY = ground - 60 + bob;
    lookT -= dt; if (lookT <= 0) { tx = rnd(-3, 3); ty = rnd(-2, 2); lookT = rnd(1.5, 3.5); }
    let gx = tx, gy = ty;
    if (mode === 'ball') { gx = clamp((ball.x - x) / 18, -3.5, 3.5); gy = clamp((ball.y - headY) / 25, -2, 3); }
    else if (mode === 'draw') { gx = 3; gy = 2; } else if (mode === 'toys') { gx = 2; gy = 2.5; } else if (mode === 'stars') { gx = 1; gy = -3; } else if (mode === 'dance') { gx = Math.sin(modeT * 4) * 2; gy = 0; }
    else if (mode === 'think') { gx = Math.sin(t * 1.2) * 3.5; gy = -2.5; }
    else if (mode === 'listen' || mode === 'talk' || mode === 'greet') { gx = tx * 0.3; gy = 0; } else if (mode === 'sleep') { gx = 0; gy = 0; }
    lx = lerp(lx, gx, Math.min(1, dt * 8)); ly = lerp(ly, gy, Math.min(1, dt * 8));
    const mt = mode === 'talk' ? clamp((inp.tts || 0) * 1.7, 0, 1) : mode === 'listen' ? clamp((inp.mic || 0) * 0.5, 0, 0.35) : 0;
    mouth = lerp(mouth, mt, Math.min(1, dt * 22));
    if (mode === 'dance' && Math.random() < dt * 2.5) burst('note', 1, x + rnd(-24, 24), headY - 18);
    if (mode === 'pet' && Math.random() < dt * 6) burst('heart', 1, x, headY - 24);
    if ((mode === 'walk' || mode === 'talk') && !reduce && Math.random() < dt * 1.4) burst('spark', 1, x, headY - 8);
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.age += dt; f.x += (f.vx + Math.sin(f.age * 4 + f.ph) * 8) * dt; f.y += f.vy * dt; f.vy *= 0.985; if (f.age >= f.life) fx.splice(i, 1); }
    render(inp, bob, headY);
  }

  function render(inp, bob, headY) {
    ctx.clearRect(0, 0, W, H); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.lineWidth = 1; ctx.strokeStyle = neon(187, 60, 0.25); ctx.beginPath(); ctx.moveTo(10, ground + 1); ctx.lineTo(W - 10, ground + 1); ctx.stroke();
    props(headY); character(inp, bob, headY); particles(); bubble(headY);
  }

  function particles() {
    for (const f of fx) {
      ctx.globalAlpha = Math.max(0, 1 - f.age / f.life);
      if (f.kind === 'heart') { ctx.fillStyle = neon(340, 66, 1); glow(340, 6); const s = 4.5 * f.s; ctx.beginPath(); ctx.moveTo(f.x, f.y + s * 0.9); ctx.bezierCurveTo(f.x - s * 1.6, f.y - s * 0.3, f.x - s * 0.7, f.y - s * 1.5, f.x, f.y - s * 0.5); ctx.bezierCurveTo(f.x + s * 0.7, f.y - s * 1.5, f.x + s * 1.6, f.y - s * 0.3, f.x, f.y + s * 0.9); ctx.fill(); }
      else if (f.kind === 'note') { ctx.fillStyle = neon(285, 70, 1); glow(285, 5); ctx.font = `${12 * f.s}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText(f.ph > 3 ? '♪' : '♫', f.x, f.y); }
      else { ctx.strokeStyle = neon(48, 75, 1); glow(48, 6); ctx.lineWidth = 1.3; const s = 3.2 * f.s * (0.6 + 0.4 * Math.sin(f.age * 12)); ctx.beginPath(); ctx.moveTo(f.x - s, f.y); ctx.lineTo(f.x + s, f.y); ctx.moveTo(f.x, f.y - s); ctx.lineTo(f.x, f.y + s); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; noGlow();
  }

  function props(headY) {
    if (mode === 'ball') {
      ctx.fillStyle = neon(48, 55, 0.9); glow(48, 10); ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, TAU); ctx.fill(); noGlow();
      ctx.strokeStyle = 'rgba(2,11,20,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r * 0.55, 0.3, 2.6); ctx.stroke();
    } else if (mode === 'toys') {
      const k = Math.floor(modeT / 4.5) % 3, lt = modeT % 4.5, bx = clamp(x + 46, 30, W - 24); ctx.lineWidth = 2;
      if (k === 0) {
        ctx.strokeStyle = neon(48, 60, 1); ctx.fillStyle = neon(48, 40, 0.25); glow(48, 6);
        for (const dx of [-9, 9]) { rr(bx + dx - 8, ground - 16, 16, 16, 2); ctx.fill(); ctx.stroke(); }
        rr(bx - 8, ground - 32 - Math.max(0, 1 - lt / 1.2) * 40, 16, 16, 2); ctx.fill(); ctx.stroke();
      } else if (k === 1) {
        const sq = 1 + (lt > 1.5 ? 0.12 * Math.sin(lt * 9) : 0);
        ctx.strokeStyle = neon(55, 62, 1); ctx.fillStyle = neon(55, 45, 0.35); glow(55, 6);
        ctx.beginPath(); ctx.ellipse(bx, ground - 8, 11 * sq, 7 / sq, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx + 8, ground - 19, 5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + 13, ground - 19); ctx.lineTo(bx + 18, ground - 17); ctx.lineTo(bx + 13, ground - 16); ctx.stroke();
      } else {
        const w = Math.sin(modeT * 14) * 3; ctx.strokeStyle = neon(310, 62, 1); ctx.fillStyle = neon(310, 45, 0.3); glow(310, 6);
        ctx.beginPath(); ctx.moveTo(bx - 10 + w, ground - 20); ctx.lineTo(bx + 10 + w, ground - 20); ctx.lineTo(bx, ground); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + w, ground - 20); ctx.lineTo(bx + w, ground - 27); ctx.stroke();
      }
      noGlow(); propPos = [bx, ground - 14];
    } else if (mode === 'draw') {
      const px = x + 38, py = ground - 74, pw = 50, ph = 52;
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.strokeStyle = neon(187, 60, 0.6); ctx.lineWidth = 1.2; rr(px, py, pw, ph, 3); ctx.fill(); ctx.stroke();
      const pts = SHAPES[shape].map(([u, v]) => [px + 4 + u * (pw - 8), py + 4 + v * (ph - 8)]);
      const idx = draw * (pts.length - 1), n = Math.floor(idx), fr = idx - n, col = [310, 48, 340][shape];
      ctx.strokeStyle = neon(col, 62, 1); glow(col, 5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      let tip = pts[Math.min(n, pts.length - 1)];
      if (n < pts.length - 1) { const a = pts[n], b = pts[n + 1]; tip = [lerp(a[0], b[0], fr), lerp(a[1], b[1], fr)]; ctx.lineTo(tip[0], tip[1]); }
      ctx.stroke(); noGlow(); propPos = tip;
    } else if (mode === 'stars') {
      for (let i = 0; i < 9; i++) { const sx = 14 + ((i * 97) % (W - 28)), sy = 10 + ((i * 53) % 46), tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.6 + i * 1.7)); ctx.fillStyle = neon(i % 3 ? 195 : 48, 78, tw); ctx.beginPath(); ctx.arc(sx, sy, 1.1 + tw * 1.1, 0, TAU); ctx.fill(); }
      const p = (modeT % 7) / 1.1; if (p < 1) { ctx.strokeStyle = neon(195, 85, 1 - p); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(W * 0.8 - p * 90, 8 + p * 40); ctx.lineTo(W * 0.8 - p * 90 + 16, 8 + p * 40 - 6); ctx.stroke(); }
    } else if (mode === 'sleep') {
      ctx.fillStyle = neon(210, 75, 1);
      for (let i = 0; i < 3; i++) { const ph = (t * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - ph; ctx.font = `${10 + i * 3}px monospace`; ctx.textAlign = 'center'; ctx.fillText('z', x + 26 + ph * 14, headY - 12 - ph * 28); }
      ctx.globalAlpha = 1;
    }
  }

  function character(inp, bob, headY) {
    const cx = x, topY = ground - 36, hipY = ground - 14, sy = topY + 4;
    const h = mode === 'listen' ? 168 : mode === 'think' ? 262 : mode === 'sleep' ? 230 : mode === 'pet' ? 330 : mode === 'dance' ? 285 : 192;
    ctx.fillStyle = 'rgba(0,229,255,0.10)'; ctx.beginPath(); ctx.ellipse(cx, ground + 2, 22, 4, 0, 0, TAU); ctx.fill();
    glow(h, 5); ctx.lineWidth = 3; ctx.strokeStyle = neon(h, 60, 0.9);
    for (const s of [-1, 1]) {
      const ph = (mode === 'walk' || mode === 'dance') ? Math.sin(step + (s > 0 ? 0 : Math.PI)) : 0, lift = Math.max(0, ph) * 3, kick = mode === 'ball' && s > 0 ? kickAnim * 9 * kickDir : 0;
      ctx.beginPath(); ctx.moveTo(cx + s * 6, hipY); ctx.lineTo(cx + s * 6 + ph * 5 + kick, ground - lift); ctx.stroke();
    }
    ctx.lineWidth = 2; ctx.strokeStyle = neon(h, 62, 0.95); ctx.fillStyle = neon(h, 30, 0.12); rr(cx - 13, topY, 26, 22, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = neon(h, 70, 0.6 + 0.4 * Math.sin(t * 3) * (mode === 'sleep' ? 0.2 : 1)); ctx.beginPath(); ctx.arc(cx, topY + 11, 3 + mouth * 2, 0, TAU); ctx.fill();
    // brazos
    let L = [cx - 20, sy + 12 + Math.sin(t * 1.8) * 1.5], R = [cx + 20, sy + 12 + Math.sin(t * 1.8 + 1) * 1.5];
    if (mode === 'greet') R = [cx + 22, sy - 16 + Math.sin(t * 11) * 5];
    else if (mode === 'talk') { const g = mouth * 8; L = [cx - 22, sy + 4 - g + Math.sin(t * 3) * 2]; R = [cx + 22, sy + 4 - g * 0.8 + Math.sin(t * 3.4) * 2]; }
    else if (mode === 'walk') { const s = Math.sin(step); L = [cx - 16 + s * 8, sy + 12]; R = [cx + 16 - s * 8, sy + 12]; }
    else if (mode === 'ball') { L = [cx - 20 + Math.sin(t * 5) * 4, sy + 6]; R = [cx + 20 - Math.sin(t * 5) * 4, sy + 6]; }
    else if (mode === 'toys') R = [propPos[0] - 8, ground - 18];
    else if (mode === 'draw') { const dx = propPos[0] - (cx + 14), dy = propPos[1] - sy, d = Math.hypot(dx, dy) || 1, m = Math.min(24, d); R = [cx + 14 + (dx / d) * m, sy + (dy / d) * m]; L = [cx - 18, sy + 10]; }
    else if (mode === 'dance') { const s = Math.sin(modeT * 8); L = [cx - 20, sy - 8 + s * 10]; R = [cx + 20, sy - 8 - s * 10]; }
    else if (mode === 'pet') { L = [cx - 22, sy - 10 + Math.sin(t * 9) * 3]; R = [cx + 22, sy - 10 + Math.sin(t * 9 + 1) * 3]; }
    else if (mode === 'sleep') { L = [cx - 18, sy + 14]; R = [cx + 18, sy + 14]; }
    ctx.lineWidth = 2.5; ctx.strokeStyle = neon(h, 62, 0.95);
    for (const [sx, hp] of [[cx - 14, L], [cx + 14, R]]) {
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hp[0], hp[1]); ctx.stroke();
      ctx.fillStyle = neon(h, 70, 1); ctx.beginPath(); ctx.arc(hp[0], hp[1], 3, 0, TAU); ctx.fill();
    }
    if (mode === 'draw') { ctx.strokeStyle = neon([310, 48, 340][shape], 62, 1); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(R[0], R[1]); ctx.lineTo(propPos[0], propPos[1]); ctx.stroke(); }
    // cabeza
    const tilt = Math.sin(t * 0.8) * 0.03 + (mode === 'listen' ? 0.1 : 0) + (mode === 'sleep' ? 0.18 + Math.sin(t * 0.9) * 0.02 : 0) + (mode === 'think' ? Math.sin(t * 1.3) * 0.08 : 0) + (mode === 'dance' ? Math.sin(modeT * 8) * 0.12 : 0) + (mode === 'stars' ? -0.14 : 0);
    ctx.save(); ctx.translate(cx, headY); ctx.rotate(tilt);
    const sw = Math.sin(t * 2.4) * 2.5 + (mode === 'dance' ? Math.sin(modeT * 8) * 3 : 0);
    ctx.lineWidth = 2; ctx.strokeStyle = neon(h, 62, 1); ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(sw * 0.3, -27, sw, -31); ctx.stroke();
    const pulse = mode === 'listen' ? 0.6 + (inp.mic || 0) : mode === 'talk' ? 0.6 + mouth : 0.5 + 0.2 * Math.sin(t * 2);
    ctx.fillStyle = neon(h, 70, Math.min(1, pulse)); ctx.beginPath(); ctx.arc(sw, -33, 3 + pulse * 1.5, 0, TAU); ctx.fill();
    ctx.lineWidth = 2.2; ctx.strokeStyle = neon(h, 62, 1); ctx.fillStyle = neon(h, 25, 0.16); rr(-26, -22, 52, 44, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = neon(h, 65, 0.55 + 0.3 * Math.sin(t * 2)); for (const s of [-1, 1]) { rr(s * 27 - 2, -7, 4, 14, 2); ctx.fill(); }
    const wide = mode === 'listen' ? 1.25 : 1, happy = mode === 'greet' || mode === 'walk' || mode === 'pet' || mode === 'dance' || (mode === 'talk' && Math.sin(t * 0.9) > 0.55);
    for (const s of [-1, 1]) {
      const ex = s * 11 + lx, ey = -4 + ly;
      if (mode === 'sleep') { ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(ex - 5, ey + 2); ctx.lineTo(ex + 5, ey + 2); ctx.stroke(); }
      else if (happy) { ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(ex, ey + 4, 6, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); }
      else {
        const ry = Math.max(0.8, 8 * wide * (1 - blink * 0.92)); ctx.fillStyle = neon(h, 68, 1); ctx.beginPath(); ctx.ellipse(ex, ey, 6 * wide, ry, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(ex - 2, ey - ry * 0.35, Math.min(2, ry * 0.3), 0, TAU); ctx.fill();
      }
    }
    if (happy || mode === 'stars') { ctx.fillStyle = neon(330, 68, 0.38); for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 19, 7, 5.5, 3, 0, 0, TAU); ctx.fill(); } }
    if (mode === 'think' || mode === 'listen') { ctx.lineWidth = 1.8; ctx.strokeStyle = neon(h, 70, 0.9); for (const s of [-1, 1]) { const up = mode === 'think' && s > 0 ? 3 : 0; ctx.beginPath(); ctx.moveTo(s * 11 - 5 + lx, -15 + ly - up); ctx.lineTo(s * 11 + 5 + lx, -15 + ly - up - (mode === 'listen' ? 2 : 0)); ctx.stroke(); } }
    ctx.lineWidth = 2; ctx.strokeStyle = neon(h, 70, 1);
    if (mode === 'talk' || mouth > 0.08) { ctx.fillStyle = neon(h, 45, 0.5); ctx.beginPath(); ctx.ellipse(lx * 0.5, 12, 4 + mouth * 3, 1.2 + mouth * 6, 0, 0, TAU); ctx.fill(); ctx.stroke(); }
    else if (mode === 'sleep') { const r = 2.5 + Math.abs(Math.sin(t)) * 0.6; ctx.beginPath(); ctx.ellipse(0, 12, r, r, 0, 0, TAU); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(lx * 0.5, 8, 6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke(); }
    ctx.restore(); noGlow();
  }

  function bubble(headY) {
    if (capLife <= 0 || !caption) return;
    ctx.font = '11px Consolas, monospace';
    const w = Math.min(W - 8, ctx.measureText(caption).width + 14), bx = clamp(x - w / 2, 4, W - w - 4), by = Math.max(4, headY - 62);
    ctx.globalAlpha = Math.min(1, capLife / 0.5); ctx.fillStyle = 'rgba(2,20,32,0.88)'; ctx.strokeStyle = neon(187, 60, 0.8); ctx.lineWidth = 1; rr(bx, by, w, 18, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = neon(187, 75, 1); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(caption, bx + w / 2, by + 9); ctx.globalAlpha = 1;
  }
  function poke() { idleFor = 0; setMode('pet'); }
  return { tick, poke, get mode() { return mode; } };
}
