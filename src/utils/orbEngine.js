// Orbe futurista de NOVA (canvas 2D puro): esfera 3D con malla, plasma central, espectro circular, anillos HUD y partículas orbitales.
const TAU = Math.PI * 2;
const HUES = { idle: 192, listening: 168, thinking: 262, speaking: 205, muted: 350 };
export function createOrb(ctx, size, { reduce = false } = {}) {
  const C = size / 2, R = size * 0.2, k = size / 200, N = 96;
  const bars = new Float32Array(N);
  const parts = Array.from({ length: 28 }, () => ({ a: Math.random() * TAU, r: Math.random(), tilt: Math.random() * Math.PI, sp: 0.3 + Math.random() * 0.7, s: 0.8 + Math.random() * 1.4 }));
  let t = 0, level = 0, hue = 192, spin = 1;
  function frame(dt, state = 'idle', lv = 0) {
    t += dt * (reduce ? 0.25 : 1);
    const ease = (r) => Math.min(1, dt * r);
    level += (lv - level) * ease(12);
    hue += ((HUES[state] ?? 192) - hue) * ease(3);
    const think = state === 'thinking' ? 1 : 0, dim = state === 'muted' ? 0.45 : 1;
    spin += ((think ? 3 : 1) - spin) * ease(2);
    const col = (l, a) => `hsla(${hue.toFixed(1)},100%,${l}%,${(a * dim).toFixed(3)})`;
    const col2 = (l, a) => `hsla(${((hue + 75) % 360).toFixed(1)},100%,${l}%,${(a * dim).toFixed(3)})`;
    const colG = (l, a, f) => `hsla(${((hue + f * 80) % 360).toFixed(1)},100%,${l}%,${(a * dim).toFixed(3)})`;
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    // 1) halo
    let g = ctx.createRadialGradient(C, C, R * 0.3, C, C, R * 2.6);
    g.addColorStop(0, col(55, 0.38 + level * 0.5)); g.addColorStop(0.45, col2(50, 0.1 + level * 0.14)); g.addColorStop(0.7, col(45, 0.05)); g.addColorStop(1, col(40, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    // anillo de pulso exterior: se expande con la voz
    { const pr = R * (2.05 + level * 0.55); ctx.lineWidth = 1.2 * Math.max(0.6, k); ctx.strokeStyle = colG(62, 0.15 + level * 0.55, 0.5); ctx.beginPath(); ctx.arc(C, C, pr, 0, TAU); ctx.stroke(); }
    // 2) anillos HUD segmentados que giran en sentidos opuestos
    ctx.lineCap = 'butt';
    for (let j = 0; j < 3; j++) {
      const rr = R * (1.85 + j * 0.15), dir = j % 2 ? -1 : 1, off = t * spin * (0.35 + j * 0.22) * dir, segs = 3 + j;
      ctx.lineWidth = (j === 0 ? 2.2 : 1.3) * Math.max(0.6, k); ctx.strokeStyle = col(60, 0.6 - j * 0.12);
      for (let s = 0; s < segs; s++) { const a0 = off + s * (TAU / segs); ctx.beginPath(); ctx.arc(C, C, rr, a0, a0 + (TAU / segs) * (0.55 - j * 0.07)); ctx.stroke(); }
    }
    // 3) marcas de regla
    ctx.lineWidth = 1;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU - t * 0.05 * spin, long = i % 6 === 0, r0 = R * 2.3, r1 = r0 + (long ? 5 : 2.5) * k;
      ctx.strokeStyle = col(65, long ? 0.45 : 0.16); ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); ctx.lineTo(C + Math.cos(a) * r1, C + Math.sin(a) * r1); ctx.stroke();
    }
    // 4) espectro circular (reacciona al volumen)
    ctx.lineWidth = Math.max(1.2, 1.8 * k); ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU + t * 0.1 * spin;
      const w = 0.5 + 0.5 * Math.sin(i * 0.9 + t * (3 + think * 5)) * Math.cos(i * 0.37 - t * 1.9);
      bars[i] += ((level * 0.95 + 0.1 + think * 0.12) * w - bars[i]) * ease(14);
      const r0 = R * 1.15, len = 2 * k + bars[i] * R * 0.8;
      ctx.strokeStyle = colG(64, 0.92, i / N);
      ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * r0, C + Math.sin(a) * r0); ctx.lineTo(C + Math.cos(a) * (r0 + len), C + Math.sin(a) * (r0 + len)); ctx.stroke();
    }
    // 5) esfera: relleno + malla 3D (meridianos que giran y paralelos)
    g = ctx.createRadialGradient(C - R * 0.3, C - R * 0.35, R * 0.1, C, C, R);
    g.addColorStop(0, col(75, 0.55 + level * 0.3)); g.addColorStop(0.55, col(45, 0.22)); g.addColorStop(1, col(35, 0.05));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, R, 0, TAU); ctx.fill();
    ctx.lineWidth = 1;
    for (let m = 0; m < 6; m++) {
      const a = t * 0.5 * spin + (m * Math.PI) / 6;
      ctx.strokeStyle = col(70, 0.18 + 0.2 * Math.abs(Math.sin(a))); ctx.beginPath(); ctx.ellipse(C, C, Math.max(0.5, Math.abs(Math.cos(a)) * R), R, 0, 0, TAU); ctx.stroke();
    }
    for (let m = -2; m <= 2; m++) {
      const dy = m * R * 0.36, w = Math.sqrt(Math.max(0, R * R - dy * dy));
      ctx.strokeStyle = col(70, 0.2); ctx.beginPath(); ctx.ellipse(C, C + dy, Math.max(0.5, w), Math.max(0.5, w * 0.18), 0, 0, TAU); ctx.stroke();
    }
    ctx.shadowColor = `hsl(${hue.toFixed(1)},100%,55%)`; ctx.shadowBlur = 8 + level * 18;
    ctx.lineWidth = 1.6; ctx.strokeStyle = col(70, 0.9); ctx.beginPath(); ctx.arc(C, C, R, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
    // 6) plasma fluido interior
    for (let m = 0; m < 2; m++) {
      const rb = R * (0.45 + m * 0.12), amp = 0.1 + level * 0.35; ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const a = (i / 90) * TAU, n = Math.sin(a * 3 + t * (1.4 + m * 0.6) + m) * 0.5 + Math.sin(a * 5 - t * (1.9 + m * 0.3)) * 0.3, r = rb * (1 + amp * n);
        if (i) ctx.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); else ctx.moveTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fillStyle = m ? col2(60, 0.18 + level * 0.2) : col(80, 0.28 + level * 0.3); ctx.fill(); ctx.strokeStyle = col(85, 0.7); ctx.lineWidth = 1.4; ctx.stroke();
    }
    g = ctx.createRadialGradient(C, C, 0, C, C, R * 0.38); g.addColorStop(0, col(95, 0.95)); g.addColorStop(1, col(60, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, R * (0.38 + level * 0.12), 0, TAU); ctx.fill();
    // 7) partículas en órbita (delante más brillantes que detrás)
    for (const p of parts) {
      p.a += dt * p.sp * spin * (think ? 2.2 : 1);
      const rr = R * (1.3 + p.r * 0.55), ex = Math.cos(p.a) * rr, ey = Math.sin(p.a) * rr * 0.42, ct = Math.cos(p.tilt), st = Math.sin(p.tilt), front = Math.sin(p.a) > 0;
      ctx.fillStyle = col(75, front ? 0.9 : 0.35); ctx.beginPath(); ctx.arc(C + ex * ct - ey * st, C + ex * st + ey * ct, p.s * k * (front ? 1 : 0.7), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return { frame };
}
