// Vacanza — Tabellone freccette 3D neon (Three.js + bloom).
// API globale: window.Darts3D.mount(canvas) / .hit(number, mult) / .unmount()
//   mult: 'S' singolo · 'D' doppio · 'T' triplo · 'B' bull50 · '25' · 'M' miss
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MAGENTA = '#d31f7e', PURPLE = '#3c1f9e', CYAN = '#21e6ff', DEEP = '#1b1150', PINK = '#ff4fb0';
const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const RAD = 2.6 * 0.78, segA = Math.PI * 2 / 20, startA = -Math.PI / 2 - segA / 2;

let R = null; // refs runtime

function boardTexture() {
  const S = 1400, c = S / 2, g = document.createElement('canvas'); g.width = g.height = S;
  const x = g.getContext('2d');
  x.fillStyle = '#080a18'; x.fillRect(0, 0, S, S);
  const Rr = c * 0.78;
  const rDouble = Rr, rOutS = Rr * 0.86, rTriple = Rr * 0.62, rInS = Rr * 0.55, rBull = Rr * 0.13, rBullIn = Rr * 0.06;
  const seg = Math.PI * 2 / 20, start = -Math.PI / 2 - seg / 2;
  const wedge = (r0, r1, a0, a1, fill, glow) => {
    x.beginPath(); x.arc(c, c, r1, a0, a1); x.arc(c, c, r0, a1, a0, true); x.closePath();
    x.shadowBlur = glow || 0; x.shadowColor = glow ? CYAN : 'transparent';
    x.fillStyle = fill; x.fill(); x.shadowBlur = 0;
  };
  for (let i = 0; i < 20; i++) {
    const a0 = start + i * seg, a1 = a0 + seg, alt = i % 2 === 0;
    wedge(rTriple, rOutS, a0, a1, alt ? MAGENTA : DEEP);
    wedge(rBull, rInS, a0, a1, alt ? MAGENTA : DEEP);
    wedge(rInS, rTriple, a0, a1, alt ? PURPLE : CYAN, 12);
    wedge(rOutS, rDouble, a0, a1, alt ? CYAN : PURPLE, 12);
  }
  x.lineWidth = 6; x.strokeStyle = CYAN; x.shadowColor = CYAN;
  [rDouble, rOutS, rTriple, rInS, rBull].forEach(r => { x.shadowBlur = 16; x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke(); });
  x.lineWidth = 3; x.shadowBlur = 14;
  for (let i = 0; i < 20; i++) { const a = start + i * seg; x.beginPath(); x.moveTo(c + Math.cos(a) * rBull, c + Math.sin(a) * rBull); x.lineTo(c + Math.cos(a) * rDouble, c + Math.sin(a) * rDouble); x.stroke(); }
  x.shadowBlur = 0;
  wedge(rBullIn, rBull, 0, Math.PI * 2, '#13d36a', 20);
  x.beginPath(); x.arc(c, c, rBullIn, 0, 7); x.fillStyle = PINK; x.shadowBlur = 24; x.shadowColor = PINK; x.fill(); x.shadowBlur = 0;
  x.fillStyle = '#f2feff'; x.font = `800 ${S * 0.062}px Inter, Arial`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.shadowColor = CYAN;
  for (let i = 0; i < 20; i++) { const a = start + i * seg + seg / 2, rr = Rr * 1.16; x.shadowBlur = 22; x.fillText(ORDER[i], c + Math.cos(a) * rr, c + Math.sin(a) * rr); }
  x.shadowBlur = 0;
  const tex = new THREE.CanvasTexture(g); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}

function makeDart() {
  const g = new THREE.Group();
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0xe8e8ee, metalness: .95, roughness: .15 }));
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.15;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.7, 14), new THREE.MeshStandardMaterial({ color: 0xffc24d, emissive: new THREE.Color(0xff9a1f), emissiveIntensity: .5, metalness: .7, roughness: .3 }));
  body.rotation.x = Math.PI / 2; body.position.z = 0.62;
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 4), new THREE.MeshStandardMaterial({ color: 0x21e6ff, emissive: new THREE.Color(0x21e6ff), emissiveIntensity: 1.1 }));
  fl.rotation.x = Math.PI / 2; fl.rotation.z = Math.PI / 4; fl.position.z = 1.05;
  g.add(tip, body, fl); return g;
}

function targetPos(number, mult) {
  if (mult === 'M') return new THREE.Vector3((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 0.06);
  const idx = ORDER.indexOf(number); const a = startA + (idx < 0 ? 0 : idx) * segA + segA / 2;
  const r = mult === 'B' ? 0 : mult === '25' ? RAD * 0.13 : mult === 'T' ? RAD * 0.6 : mult === 'D' ? RAD * 0.92 : RAD * 0.45;
  return new THREE.Vector3(Math.cos(a) * r, -Math.sin(a) * r, 0.08);
}

function burst(pos, color) {
  if (!R) return;
  const N = 80, p = new Float32Array(N * 3), v = [];
  for (let i = 0; i < N; i++) { p[i * 3] = pos.x; p[i * 3 + 1] = pos.y; p[i * 3 + 2] = pos.z; const a = Math.random() * 7, sp = 0.03 + Math.random() * 0.09; v.push([Math.cos(a) * sp, Math.sin(a) * sp, (Math.random() - 0.3) * 0.05]); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.16, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
  R.board.add(pts);
  let life = 1;
  const tick = () => {
    if (!R) return;
    life -= 0.022; if (life <= 0) { R.board.remove(pts); geo.dispose(); return; }
    const a = geo.attributes.position.array;
    for (let i = 0; i < N; i++) { a[i * 3] += v[i][0]; a[i * 3 + 1] += v[i][1]; a[i * 3 + 2] += v[i][2]; v[i][1] -= 0.0012; }
    geo.attributes.position.needsUpdate = true; pts.material.opacity = life; requestAnimationFrame(tick);
  };
  tick();
}

const Darts3D = {
  mount(canvas) {
    if (!canvas) return;
    if (R && R.canvas === canvas) { R.resize(); return; }
    if (R) this.unmount();
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); }
    catch (e) { console.warn('WebGL non disponibile', e); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100); camera.position.set(0, 0, 8.6);
    scene.add(new THREE.AmbientLight(0x506080, 1.5));
    const sp = new THREE.SpotLight(0xffffff, 40, 40, 0.6, 0.6); sp.position.set(0, 6, 7); scene.add(sp);
    const board = new THREE.Group(); scene.add(board);
    board.add(new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ map: boardTexture(), transparent: true })));
    board.add(new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.12, 20, 80), new THREE.MeshStandardMaterial({ color: 0x0a0f2a, emissive: new THREE.Color(CYAN), emissiveIntensity: 0.7, metalness: .6, roughness: .3 })));
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.4, 0.6, 0.78);
    composer.addPass(bloom); composer.addPass(new OutputPass());
    let t = 0, alive = true;
    const loop = () => { if (!alive) return; t += 0.016; board.rotation.y = 0.14 + Math.sin(t * 0.5) * 0.05; board.rotation.x = -0.14 + Math.cos(t * 0.4) * 0.035; composer.render(); requestAnimationFrame(loop); };
    const resize = () => {
      const w = canvas.clientWidth || canvas.offsetWidth || 320, h = canvas.clientHeight || canvas.offsetHeight || 320;
      renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    R = { canvas, renderer, scene, camera, board, composer, resize, stop: () => { alive = false; } };
    const ro = new ResizeObserver(resize); ro.observe(canvas); R.ro = ro;
    resize(); loop();
  },
  hit(number, mult) {
    if (!R) return;
    const tgt = targetPos(number, mult), d = makeDart();
    d.position.set(tgt.x * 0.35, tgt.y * 0.35 + 1.6, 5); R.board.add(d);
    const from = d.position.clone(); let s = 0;
    const fly = () => {
      if (!R) return;
      s += 0.07; const e = 1 - Math.pow(1 - s, 3); d.position.lerpVectors(from, tgt, e);
      if (s < 1) requestAnimationFrame(fly);
      else if (mult !== 'M') { burst(tgt, 0xff2d9b); burst(tgt, 0x21e6ff); }
    };
    fly();
  },
  unmount() {
    if (!R) return;
    R.stop(); if (R.ro) R.ro.disconnect();
    try { R.renderer.dispose(); R.composer.dispose && R.composer.dispose(); } catch (e) {}
    R = null;
  }
};
window.Darts3D = Darts3D;
