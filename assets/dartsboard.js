// Vacanza — Tabellone freccette NEON leggero (canvas 2D, zero dipendenze, carica all'istante).
// API: window.Darts3D.mount(canvas) / .hit(number, mult) / .unmount()
//   mult: 'S' singolo · 'D' doppio · 'T' triplo · 'B' bull50 · '25' · 'M' miss
(function () {
  'use strict';
  const MAGENTA = '#d31f7e', PURPLE = '#3c1f9e', CYAN = '#21e6ff', DEEP = '#1b1150', PINK = '#ff4fb0';
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const seg = Math.PI * 2 / 20, start0 = -Math.PI / 2 - seg / 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  let S = null; // { canvas, ctx, w, h, cx, cy, R, board, items[], raf, ro }

  // ---- disegna la faccia neon del tabellone ----
  function drawBoard(x, cx, cy, R) {
    const rDouble = R, rOutS = R * 0.86, rTriple = R * 0.62, rInS = R * 0.55, rBull = R * 0.13, rBullIn = R * 0.06;
    const wedge = (r0, r1, a0, a1, fill, glow) => {
      x.beginPath(); x.arc(cx, cy, r1, a0, a1); x.arc(cx, cy, r0, a1, a0, true); x.closePath();
      x.shadowBlur = glow || 0; x.shadowColor = glow ? CYAN : 'transparent'; x.fillStyle = fill; x.fill(); x.shadowBlur = 0;
    };
    for (let i = 0; i < 20; i++) {
      const a0 = start0 + i * seg, a1 = a0 + seg, alt = i % 2 === 0;
      wedge(rTriple, rOutS, a0, a1, alt ? MAGENTA : DEEP);
      wedge(rBull, rInS, a0, a1, alt ? MAGENTA : DEEP);
      wedge(rInS, rTriple, a0, a1, alt ? PURPLE : CYAN, R * 0.03);
      wedge(rOutS, rDouble, a0, a1, alt ? CYAN : PURPLE, R * 0.03);
    }
    x.lineWidth = Math.max(2, R * 0.012); x.strokeStyle = CYAN; x.shadowColor = CYAN;
    [rDouble, rOutS, rTriple, rInS, rBull].forEach(r => { x.shadowBlur = R * 0.05; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke(); });
    x.lineWidth = Math.max(1, R * 0.006); x.shadowBlur = R * 0.04;
    for (let i = 0; i < 20; i++) { const a = start0 + i * seg; x.beginPath(); x.moveTo(cx + Math.cos(a) * rBull, cy + Math.sin(a) * rBull); x.lineTo(cx + Math.cos(a) * rDouble, cy + Math.sin(a) * rDouble); x.stroke(); }
    x.shadowBlur = 0;
    wedge(rBullIn, rBull, 0, Math.PI * 2, '#13d36a', R * 0.05);
    x.beginPath(); x.arc(cx, cy, rBullIn, 0, 7); x.fillStyle = PINK; x.shadowBlur = R * 0.06; x.shadowColor = PINK; x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#f2feff'; x.font = `800 ${R * 0.13}px Inter, Arial, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = CYAN;
    for (let i = 0; i < 20; i++) { const a = start0 + i * seg + seg / 2, rr = R * 1.17; x.shadowBlur = R * 0.07; x.fillText(ORDER[i], cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    x.shadowBlur = 0;
  }

  function buildStatic() {
    const o = document.createElement('canvas'); o.width = S.w; o.height = S.h;
    drawBoard(o.getContext('2d'), S.cx, S.cy, S.R);
    S.board = o;
  }
  function paintStatic() { if (!S) return; S.ctx.clearRect(0, 0, S.w, S.h); S.ctx.drawImage(S.board, 0, 0); }

  function frame() {
    if (!S) return;
    S.ctx.clearRect(0, 0, S.w, S.h); S.ctx.drawImage(S.board, 0, 0);
    for (const it of S.items) { it.update(); it.draw(S.ctx); }
    S.items = S.items.filter(it => it.alive);
    S.raf = S.items.length ? requestAnimationFrame(frame) : null;
  }
  function ensureLoop() { if (S && !S.raf) S.raf = requestAnimationFrame(frame); }

  function targetXY(number, mult) {
    if (mult === 'M') return { x: S.cx + (Math.random() - 0.5) * S.R * 1.6, y: S.cy + (Math.random() - 0.5) * S.R * 1.6 };
    const idx = ORDER.indexOf(number); const a = -Math.PI / 2 + (idx < 0 ? 0 : idx) * seg;
    const r = mult === 'B' ? 0 : mult === '25' ? S.R * 0.13 : mult === 'T' ? S.R * 0.62 : mult === 'D' ? S.R * 0.94 : S.R * 0.45;
    return { x: S.cx + Math.cos(a) * r, y: S.cy + Math.sin(a) * r };
  }

  function drawDart(ctx, x, y, sc, ang) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.rotate(ang);
    ctx.shadowBlur = 12; ctx.shadowColor = '#ffae21'; ctx.strokeStyle = '#ffd24d'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-26, 26); ctx.lineTo(2, -2); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#eef3ff';
    ctx.beginPath(); ctx.moveTo(2, -2); ctx.lineTo(-5, 3); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#21e6ff'; ctx.shadowBlur = 10; ctx.shadowColor = '#21e6ff';
    ctx.beginPath(); ctx.moveTo(-26, 26); ctx.lineTo(-34, 18); ctx.lineTo(-18, 34); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  }

  function addDart(number, mult) {
    const tgt = targetXY(number, mult), sx = S.cx, sy = S.h * 1.05;
    let t = 0; const dur = 16;
    S.items.push({
      alive: true,
      update() { t++; if (t >= dur) { this.alive = false; addBurst(tgt.x, tgt.y, mult); if (mult !== 'M') addScore(tgt.x, tgt.y, number, mult); } },
      draw(ctx) { const e = easeOut(t / dur), x = lerp(sx, tgt.x, e), y = lerp(sy, tgt.y, e); drawDart(ctx, x, y, lerp(1.7, 0.55, e), -Math.PI / 4); }
    });
    ensureLoop();
  }

  function addBurst(x, y, mult) {
    const cols = ['#ff2d9b', '#21e6ff', '#ffd84d', '#ff4fb0', '#7b5bff', '#13d36a'];
    const big = mult === 'B' || mult === 'T';
    const n = big ? 46 : 26;
    // anello flash
    let fr = 0; S.items.push({ alive: true, update() { fr++; if (fr > 12) this.alive = false; }, draw(ctx) { const e = fr / 12; ctx.save(); ctx.globalAlpha = (1 - e) * 0.8; ctx.strokeStyle = big ? '#ffd84d' : CYAN; ctx.lineWidth = 4; ctx.shadowBlur = 16; ctx.shadowColor = ctx.strokeStyle; ctx.beginPath(); ctx.arc(x, y, 6 + e * S.R * 0.5, 0, 7); ctx.stroke(); ctx.restore(); ctx.shadowBlur = 0; } });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, sp = (big ? 3 : 2) + Math.random() * (big ? 6 : 4);
      let px = x, py = y, vx = Math.cos(a) * sp, vy = Math.sin(a) * sp, life = 1, col = cols[i % cols.length], rot = Math.random() * 7, sz = 4 + Math.random() * 4;
      S.items.push({ alive: true, update() { px += vx; py += vy; vy += 0.22; vx *= 0.985; rot += 0.3; life -= 0.025; if (life <= 0) this.alive = false; }, draw(ctx) { ctx.save(); ctx.globalAlpha = Math.max(0, life); ctx.translate(px, py); ctx.rotate(rot); ctx.fillStyle = col; ctx.shadowBlur = 8; ctx.shadowColor = col; ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore(); ctx.shadowBlur = 0; } });
    }
    ensureLoop();
  }

  function addScore(x, y, number, mult) {
    const pts = mult === 'B' ? 50 : mult === '25' ? 25 : mult === 'T' ? number * 3 : mult === 'D' ? number * 2 : number;
    let t = 0; const dur = 40;
    S.items.push({
      alive: true,
      update() { t++; if (t >= dur) this.alive = false; },
      draw(ctx) { const e = t / dur; ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(x, y - 8 - e * S.R * 0.6); ctx.fillStyle = '#fff'; ctx.shadowBlur = 14; ctx.shadowColor = MAGENTA; ctx.font = `900 ${S.R * 0.28}px Inter, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+' + pts, 0, 0); ctx.restore(); ctx.shadowBlur = 0; }
    });
    ensureLoop();
  }

  const API = {
    mount(canvas) {
      if (!canvas) return;
      if (S && S.canvas === canvas) { S.resize(); return; }
      if (S) this.unmount();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      S = { canvas, ctx, items: [], raf: null };
      S.resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = canvas.clientWidth || canvas.offsetWidth || 320, h = canvas.clientHeight || canvas.offsetHeight || 240;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        S.w = w; S.h = h; S.cx = w / 2; S.cy = h / 2;
        S.R = Math.min(w, h) * 0.5 * 0.80;   // lascia spazio ai numeri
        buildStatic(); paintStatic();
        if (S.items.length) ensureLoop();
      };
      try { S.ro = new ResizeObserver(S.resize); S.ro.observe(canvas); } catch (e) {}
      S.resize();
    },
    hit(number, mult) { if (S) addDart(number, mult); },
    celebrate() {
      if (!S) return;
      for (let i = 0; i < 7; i++) {
        const x = S.cx + (Math.random() - 0.5) * S.w * 0.62;
        const y = S.cy + (Math.random() - 0.5) * S.h * 0.45;
        addBurst(x, y, 'T');
      }
    },
    unmount() { if (!S) return; if (S.raf) cancelAnimationFrame(S.raf); if (S.ro) S.ro.disconnect(); S = null; }
  };
  window.Darts3D = API;
})();
