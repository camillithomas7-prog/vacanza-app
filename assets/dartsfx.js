// Vacanza — Effetti freccette: suoni (Web Audio, nessun file), annunci giganti, festa vittoria, vibrazione.
// API: window.DartsFX.ensure()/hit()/bull()/callout(text,kind)/win(name)/toggleMute()  · .muted
(function () {
  'use strict';
  const FX = {
    muted: localStorage.getItem('darts_muted') === '1',
    ctx: null,
    ensure() {
      if (this.muted) return null;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { this.ctx = null; }
      return this.ctx;
    },
    tone(freq, t0, dur, type = 'sine', vol = 0.18) {
      const c = this.ctx; if (!c) return;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq;
      const now = c.currentTime + t0;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(vol, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      o.connect(g); g.connect(c.destination);
      o.start(now); o.stop(now + dur + 0.03);
    },
    noise(t0, dur, vol = 0.28) {
      const c = this.ctx; if (!c) return;
      const n = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100;
      const g = c.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(c.destination);
      s.start(c.currentTime + t0);
    },
    fanfare(freqs, step) { if (!this.ctx) return; freqs.forEach((f, i) => this.tone(f, i * step, step * 1.7, 'triangle', 0.17)); },
    vibe(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} },

    // ---- visuale ----
    flash(text, cls) {
      const el = document.createElement('div');
      el.className = 'dfx-callout' + (cls ? ' c' + cls : '');
      el.textContent = text;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1250);
    },
    flashScreen() {
      const el = document.createElement('div'); el.className = 'dfx-flash';
      document.body.appendChild(el); setTimeout(() => el.remove(), 560);
    },

    // ---- eventi di gioco ----
    hit(kind) {
      if (this.muted) return; this.ensure();
      this.noise(0, 0.07, 0.24);                      // impatto sordo sul sisal
      this.tone(96, 0, 0.09, 'sine', 0.14);           // corpo del "thunk"
      this.tone(2400, 0.005, 0.03, 'square', 0.05);   // tick metallico della punta
      if (kind === 'T') { this.tone(1318, 0.05, 0.12, 'triangle', 0.12); this.tone(1760, 0.11, 0.14, 'triangle', 0.10); this.vibe([0, 12, 20, 12]); }
      else if (kind === 'D') { this.tone(1174, 0.05, 0.12, 'triangle', 0.10); this.vibe(14); }
      else this.vibe(8);
    },
    bull() {
      this.ensure();
      if (!this.muted) { this.tone(880, 0, 0.12, 'triangle', 0.2); this.tone(1320, 0.05, 0.2, 'triangle', 0.18); this.vibe(22); }
      this.flash('BULLSEYE!', 'bull');
    },
    callout(text, kind) {
      this.ensure();
      if (!this.muted) {
        if (kind === '180') { this.fanfare([523, 659, 784, 1047], 0.12); this.vibe([0, 40, 30, 70]); }
        else if (kind === 'ton') { this.fanfare([392, 523, 659], 0.1); this.vibe(25); }
        else if (kind === 'bust') { this.tone(320, 0, 0.18, 'sawtooth', 0.16); this.tone(170, 0.12, 0.3, 'sawtooth', 0.16); this.vibe([0, 60, 40, 60]); }
        else if (kind === 'good') { this.tone(523, 0, 0.1, 'triangle', 0.11); this.vibe(12); }
      }
      if (text) this.flash(text, kind);
    },
    win(name) {
      this.ensure();
      if (!this.muted) {
        this.fanfare([392, 523, 659, 784, 1047, 1319], 0.13);
        this.tone(1568, 0.82, 0.55, 'triangle', 0.15);
        this.vibe([0, 90, 50, 90, 50, 200]);
      }
      this.flashScreen();
      this.flash('🏆 ' + (name || '') + '!', 'win');
    },
    toggleMute() {
      this.muted = !this.muted;
      localStorage.setItem('darts_muted', this.muted ? '1' : '0');
      if (!this.muted) this.ensure();
      return this.muted;
    },
  };
  window.DartsFX = FX;
})();
