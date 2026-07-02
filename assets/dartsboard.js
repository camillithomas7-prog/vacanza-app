// Vacanza — Tabellone freccette PREMIUM (canvas 2D, zero dipendenze, carica all'istante).
// Look "torneo": sisal nero/crema, anelli rosso/verde, spider metallico, ghiera scura con numeri.
// API: window.Darts3D.mount(canvas) / .hit(number, mult, color?, pt?) / .clearTurn() / .removeLast()
//      .celebrate() / .unmount() / .onHit = (number, mult, pt) => {}   ← tocco diretto sul bersaglio
//   mult: 'S' singolo · 'D' doppio · 'T' triplo · 'B' bull50 · '25' · 'M' miss
(function () {
  'use strict';
  // palette premium
  const INK = '#191c23', CREAM = '#e7dcc3', RED = '#d92b3e', GREEN = '#0fa568';
  const WIRE = 'rgba(205,214,224,.55)', CYAN = '#21e6ff', GOLD = '#ffd24d';
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const seg = Math.PI * 2 / 20, start0 = -Math.PI / 2 - seg / 2;
  // raggi (frazione di R) — proporzioni reali da torneo, bande leggermente più larghe per il tocco
  const RG = { bi: 0.05, bo: 0.11, ti: 0.54, to: 0.63, di: 0.91, dO: 1.0, num: 1.155, bez: 1.30 };
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  let S = null; // { canvas, ctx, w, h, cx, cy, R, board, items[], planted[], raf, ro, onDown }

  function wedgePath(x, cx, cy, r0, r1, a0, a1) {
    x.beginPath(); x.arc(cx, cy, r1, a0, a1); x.arc(cx, cy, r0, a1, a0, true); x.closePath();
  }

  // ---- faccia del tabellone (statica, cacheata) ----
  function drawBoard(x, cx, cy, R) {
    // ghiera esterna scura con leggero gradiente
    const bez = x.createRadialGradient(cx, cy - R * 0.5, R * 0.2, cx, cy, R * RG.bez);
    bez.addColorStop(0, '#1c212c'); bez.addColorStop(0.72, '#141821'); bez.addColorStop(1, '#0b0e14');
    x.beginPath(); x.arc(cx, cy, R * RG.bez, 0, 7); x.fillStyle = bez; x.fill();
    // sottile anello accent (identità neon dell'app, molto discreto)
    x.beginPath(); x.arc(cx, cy, R * RG.bez - 1.5, 0, 7);
    x.strokeStyle = 'rgba(33,230,255,.22)'; x.lineWidth = 1.5; x.shadowColor = CYAN; x.shadowBlur = R * 0.05; x.stroke(); x.shadowBlur = 0;
    // riflesso in alto sulla ghiera
    x.save(); x.beginPath(); x.arc(cx, cy, R * RG.bez - 2, Math.PI * 1.15, Math.PI * 1.85);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = R * 0.02; x.stroke(); x.restore();

    // fondo faccia
    x.beginPath(); x.arc(cx, cy, R * RG.dO, 0, 7); x.fillStyle = '#0c0e12'; x.fill();

    // spicchi: 20 in alto è NERO con anelli ROSSI (standard torneo)
    for (let i = 0; i < 20; i++) {
      const a0 = start0 + i * seg, a1 = a0 + seg, black = i % 2 === 0;
      const single = black ? INK : CREAM, ring = black ? RED : GREEN;
      wedgePath(x, cx, cy, R * RG.bo, R * RG.ti, a0, a1); x.fillStyle = single; x.fill();   // singolo interno
      wedgePath(x, cx, cy, R * RG.ti, R * RG.to, a0, a1); x.fillStyle = ring; x.fill();     // triplo
      wedgePath(x, cx, cy, R * RG.to, R * RG.di, a0, a1); x.fillStyle = single; x.fill();   // singolo esterno
      wedgePath(x, cx, cy, R * RG.di, R * RG.dO, a0, a1); x.fillStyle = ring; x.fill();     // doppio
    }

    // bull: anello 25 verde + centro 50 rosso
    x.beginPath(); x.arc(cx, cy, R * RG.bo, 0, 7); x.fillStyle = GREEN; x.fill();
    x.beginPath(); x.arc(cx, cy, R * RG.bi, 0, 7); x.fillStyle = RED; x.fill();
    // riflesso speculare sul centro
    const spec = x.createRadialGradient(cx - R * 0.015, cy - R * 0.02, 0, cx, cy, R * RG.bi);
    spec.addColorStop(0, 'rgba(255,255,255,.4)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
    x.beginPath(); x.arc(cx, cy, R * RG.bi, 0, 7); x.fillStyle = spec; x.fill();

    // illuminazione della faccia: luce dall'alto + vignettatura sul bordo
    const light = x.createRadialGradient(cx - R * 0.18, cy - R * 0.3, R * 0.1, cx, cy, R * RG.dO);
    light.addColorStop(0, 'rgba(255,255,255,.10)'); light.addColorStop(0.55, 'rgba(255,255,255,.015)'); light.addColorStop(1, 'rgba(0,0,0,.30)');
    x.beginPath(); x.arc(cx, cy, R * RG.dO, 0, 7); x.fillStyle = light; x.fill();

    // spider metallico (filo): ombra scura sotto + filo chiaro sopra
    const rings = [RG.bi, RG.bo, RG.ti, RG.to, RG.di, RG.dO];
    for (const pass of [0, 1]) {
      x.strokeStyle = pass ? WIRE : 'rgba(0,0,0,.55)';
      x.lineWidth = Math.max(1, R * (pass ? 0.007 : 0.012));
      rings.forEach(f => { x.beginPath(); x.arc(cx, cy, R * f, 0, 7); x.stroke(); });
      for (let i = 0; i < 20; i++) {
        const a = start0 + i * seg;
        x.beginPath();
        x.moveTo(cx + Math.cos(a) * R * RG.bo, cy + Math.sin(a) * R * RG.bo);
        x.lineTo(cx + Math.cos(a) * R * RG.dO, cy + Math.sin(a) * R * RG.dO);
        x.stroke();
      }
    }

    // numeri sulla ghiera
    x.fillStyle = 'rgba(238,229,205,.92)';
    x.font = `700 ${Math.round(R * 0.115)}px Inter, -apple-system, Arial, sans-serif`;
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.shadowColor = 'rgba(0,0,0,.85)'; x.shadowBlur = 4;
    for (let i = 0; i < 20; i++) {
      const a = start0 + i * seg + seg / 2, rr = R * RG.num;
      x.fillText(ORDER[i], cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    x.shadowBlur = 0;
  }

  function buildStatic() {
    const o = document.createElement('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    o.width = Math.round(S.w * dpr); o.height = Math.round(S.h * dpr);
    const c = o.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBoard(c, S.cx, S.cy, S.R);
    S.board = o;
  }

  // ---- freccetta (punta in basso-sinistra verso l'origine) ----
  function drawDart(ctx, x, y, sc, ang, color, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.scale(sc, sc);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.lineCap = 'round';
    // ombra sotto la punta
    ctx.beginPath(); ctx.ellipse(2, 3, 7, 2.6, 0, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    // ago
    ctx.strokeStyle = '#d9dfe8'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8, -8); ctx.stroke();
    // barilotto metallico (bordo scuro + anima chiara)
    ctx.strokeStyle = '#2c3340'; ctx.lineWidth = 6.4;
    ctx.beginPath(); ctx.moveTo(8, -8); ctx.lineTo(17, -17); ctx.stroke();
    ctx.strokeStyle = '#aeb8c6'; ctx.lineWidth = 4.2;
    ctx.beginPath(); ctx.moveTo(8.5, -8.5); ctx.lineTo(16.5, -16.5); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(9, -10.2); ctx.lineTo(15.4, -16.6); ctx.stroke();
    // stelo
    ctx.strokeStyle = '#39404d'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(17, -17); ctx.lineTo(23, -23); ctx.stroke();
    // alette (colore del giocatore)
    ctx.fillStyle = color || GOLD;
    ctx.shadowColor = color || GOLD; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.moveTo(22, -22); ctx.lineTo(33, -24); ctx.lineTo(27.5, -27.5); ctx.lineTo(24, -33); ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(22, -22); ctx.lineTo(27.5, -27.5); ctx.stroke();
    ctx.restore();
  }

  function paintBase() {
    const c = S.ctx;
    c.clearRect(0, 0, S.w, S.h);
    c.drawImage(S.board, 0, 0, S.w, S.h);
    for (const d of S.planted) {
      const x = S.cx + Math.cos(d.fa) * d.fr * S.R, y = S.cy + Math.sin(d.fa) * d.fr * S.R;
      drawDart(c, x, y, S.R / 165, d.ang, d.color, d.alpha);
    }
  }
  function paintStatic() { if (S) paintBase(); }

  function frame() {
    if (!S) return;
    paintBase();
    for (const it of S.items) { it.update(); it.draw(S.ctx); }
    S.items = S.items.filter(it => it.alive);
    S.raf = S.items.length ? requestAnimationFrame(frame) : (paintBase(), null);
  }
  function ensureLoop() { if (S && !S.raf) S.raf = requestAnimationFrame(frame); }

  // punto d'arrivo per numero+anello (con leggero jitter così le frecce non si sovrappongono)
  function targetXY(number, mult) {
    if (mult === 'M') {
      const a = Math.random() * 7, r = S.R * (1.06 + Math.random() * 0.16);
      return { x: S.cx + Math.cos(a) * r, y: S.cy + Math.sin(a) * r };
    }
    const idx = ORDER.indexOf(number);
    let a = -Math.PI / 2 + (idx < 0 ? 0 : idx) * seg;
    let fr = mult === 'B' ? 0.012 : mult === '25' ? 0.08 :
             mult === 'T' ? (RG.ti + RG.to) / 2 : mult === 'D' ? (RG.di + RG.dO) / 2 : 0.76;
    if (mult === 'S' || mult === 'T' || mult === 'D') a += (Math.random() - 0.5) * seg * 0.5;
    else a = Math.random() * 7;
    fr += (Math.random() - 0.5) * (mult === 'S' ? 0.10 : 0.02);
    return { x: S.cx + Math.cos(a) * fr * S.R, y: S.cy + Math.sin(a) * fr * S.R };
  }

  // flash dello spicchio colpito
  function addFlash(number, mult) {
    if (mult === 'M') return;
    let r0, r1, a0, a1;
    if (mult === 'B') { r0 = 0; r1 = RG.bi; a0 = 0; a1 = 7; }
    else if (mult === '25') { r0 = RG.bi; r1 = RG.bo; a0 = 0; a1 = 7; }
    else {
      const idx = ORDER.indexOf(number); if (idx < 0) return;
      a0 = start0 + idx * seg; a1 = a0 + seg;
      r0 = mult === 'T' ? RG.ti : mult === 'D' ? RG.di : RG.bo;
      r1 = mult === 'T' ? RG.to : mult === 'D' ? RG.dO : RG.di;
    }
    let t = 0; const dur = 15;
    S.items.push({
      alive: true,
      update() { t++; if (t >= dur) this.alive = false; },
      draw(ctx) {
        const e = t / dur;
        ctx.save(); ctx.globalAlpha = (1 - e) * 0.55;
        wedgePath(ctx, S.cx, S.cy, S.R * r0, S.R * r1, a0, a1);
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 18; ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
      }
    });
    ensureLoop();
  }

  function addDart(number, mult, color, pt) {
    const tgt = pt || targetXY(number, mult);
    const sx = S.cx + (Math.random() - 0.5) * S.w * 0.3, sy = S.h * 1.08;
    const ang = -Math.PI / 4 + (Math.random() - 0.5) * 0.22;
    let t = 0; const dur = 15;
    S.items.push({
      alive: true,
      update() {
        t++;
        if (t >= dur) {
          this.alive = false;
          // pianta la freccia nel tabellone (resta fino a fine turno)
          const dx = tgt.x - S.cx, dy = tgt.y - S.cy;
          S.planted.push({ fa: Math.atan2(dy, dx), fr: Math.hypot(dx, dy) / S.R, ang, color, alpha: mult === 'M' ? 0.55 : 1 });
          addFlash(number, mult);
          addBurst(tgt.x, tgt.y, mult);
          if (mult !== 'M') addScore(tgt.x, tgt.y, number, mult);
        }
      },
      draw(ctx) {
        const e = easeOut(t / dur);
        const x = lerp(sx, tgt.x, e), y = lerp(sy, tgt.y, e) - Math.sin(e * Math.PI) * S.R * 0.16;
        // scia leggera
        if (e > 0.1) { const e2 = Math.max(0, e - 0.09); drawDart(ctx, lerp(sx, tgt.x, e2), lerp(sy, tgt.y, e2) - Math.sin(e2 * Math.PI) * S.R * 0.16, lerp(1.65, S.R / 165, e2), ang, color, 0.22); }
        drawDart(ctx, x, y, lerp(1.65, S.R / 165, e), ang, color, 1);
      }
    });
    ensureLoop();
  }

  function addBurst(x, y, mult) {
    const cols = mult === 'B' || mult === 'T' ? [GOLD, '#ff5a67', '#fff', '#ffae21'] : ['#ff5a67', '#27d17f', GOLD, CYAN, '#fff'];
    const big = mult === 'B' || mult === 'T';
    const n = big ? 40 : 20;
    let fr = 0;
    S.items.push({
      alive: true, update() { fr++; if (fr > 12) this.alive = false; },
      draw(ctx) {
        const e = fr / 12; ctx.save(); ctx.globalAlpha = (1 - e) * 0.75;
        ctx.strokeStyle = big ? GOLD : 'rgba(255,255,255,.9)'; ctx.lineWidth = 3;
        ctx.shadowBlur = 14; ctx.shadowColor = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(x, y, 5 + e * S.R * 0.4, 0, 7); ctx.stroke();
        ctx.restore(); ctx.shadowBlur = 0;
      }
    });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, sp = (big ? 2.6 : 1.8) + Math.random() * (big ? 5 : 3.4);
      let px = x, py = y, vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - 1, life = 1, col = cols[i % cols.length], rot = Math.random() * 7, sz = 3 + Math.random() * 3.4;
      S.items.push({
        alive: true,
        update() { px += vx; py += vy; vy += 0.2; vx *= 0.985; rot += 0.28; life -= 0.03; if (life <= 0) this.alive = false; },
        draw(ctx) { ctx.save(); ctx.globalAlpha = Math.max(0, life); ctx.translate(px, py); ctx.rotate(rot); ctx.fillStyle = col; ctx.shadowBlur = 6; ctx.shadowColor = col; ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore(); ctx.shadowBlur = 0; }
      });
    }
    ensureLoop();
  }

  function addScore(x, y, number, mult) {
    const pts = mult === 'B' ? 50 : mult === '25' ? 25 : mult === 'T' ? number * 3 : mult === 'D' ? number * 2 : number;
    const col = mult === 'B' || mult === 'T' ? GOLD : mult === 'D' ? '#ffae56' : '#fff';
    let t = 0; const dur = 42;
    S.items.push({
      alive: true, update() { t++; if (t >= dur) this.alive = false; },
      draw(ctx) {
        const e = t / dur;
        ctx.save(); ctx.globalAlpha = 1 - e * e;
        ctx.translate(x, y - 10 - easeOut(e) * S.R * 0.5);
        ctx.fillStyle = col; ctx.shadowBlur = 12; ctx.shadowColor = 'rgba(0,0,0,.7)';
        ctx.font = `800 ${Math.round(S.R * 0.24)}px 'Geist Mono', Inter, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+' + pts, 0, 0);
        ctx.restore(); ctx.shadowBlur = 0;
      }
    });
    ensureLoop();
  }

  // tocco sul tabellone → segmento colpito
  function hitTest(x, y) {
    const dx = x - S.cx, dy = y - S.cy, r = Math.hypot(dx, dy) / S.R;
    if (r > RG.bez) return null;
    const TAU = Math.PI * 2;
    let a = Math.atan2(dy, dx) - start0; a = ((a % TAU) + TAU) % TAU;
    const n = ORDER[Math.floor(a / seg) % 20];
    if (r <= 0.065) return { n: 50, mc: 'B' };
    if (r <= 0.13) return { n: 25, mc: '25' };
    if (r <= RG.ti) return { n, mc: 'S' };
    if (r <= RG.to) return { n, mc: 'T' };
    if (r <= RG.di) return { n, mc: 'S' };
    if (r <= RG.dO + 0.015) return { n, mc: 'D' };
    return { n: 0, mc: 'M' };
  }

  const API = {
    onHit: null,   // (number, mult, pt) => {} — assegnato dall'app quando il turno è attivo
    mount(canvas) {
      if (!canvas) return;
      if (S && S.canvas === canvas) { S.resize(); return; }
      if (S) this.unmount();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      S = { canvas, ctx, items: [], planted: [], raf: null };
      S.resize = () => {
        const dpr = Math.min(devicePixelRatio || 1, 2);
        const w = canvas.clientWidth || canvas.offsetWidth || 320, h = canvas.clientHeight || canvas.offsetHeight || 240;
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        S.w = w; S.h = h; S.cx = w / 2; S.cy = h / 2;
        S.R = Math.min(w, h) * 0.5 * 0.74;   // la ghiera coi numeri arriva a 1.3R
        buildStatic(); paintStatic();
        if (S.items.length) ensureLoop();
      };
      S.onDown = (ev) => {
        if (!S || !API.onHit) return;
        const hit = hitTest(ev.offsetX, ev.offsetY);
        if (!hit) return;
        try { API.onHit(hit.n, hit.mc, { x: ev.offsetX, y: ev.offsetY }); } catch (e) {}
      };
      canvas.addEventListener('pointerdown', S.onDown);
      try { S.ro = new ResizeObserver(S.resize); S.ro.observe(canvas); } catch (e) {}
      S.resize();
    },
    hit(number, mult, color, pt) { if (S) addDart(number, mult, color, pt); },
    clearTurn() { if (!S) return; S.planted = []; paintStatic(); },
    removeLast() { if (!S) return; S.planted.pop(); paintStatic(); },
    celebrate() {
      if (!S) return;
      for (let i = 0; i < 7; i++) {
        const x = S.cx + (Math.random() - 0.5) * S.w * 0.62;
        const y = S.cy + (Math.random() - 0.5) * S.h * 0.45;
        addBurst(x, y, 'T');
      }
    },
    unmount() {
      if (!S) return;
      if (S.raf) cancelAnimationFrame(S.raf);
      if (S.ro) S.ro.disconnect();
      if (S.onDown) S.canvas.removeEventListener('pointerdown', S.onDown);
      API.onHit = null;
      S = null;
    }
  };
  window.Darts3D = API;
})();
