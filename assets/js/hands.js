/* ==========================================================================
   <pfc-hand pose="pierre|feuille|ciseaux" mode="idle|shake|win|lose|draw|still" side="left|right">
   Main 3D en voxels (three.js, rendu toon + contour encre).
   Un seul renderer WebGL partagé, recopié dans le <canvas> 2D de chaque instance.
   Repli automatique sur un emoji si WebGL / three.js est indisponible.
   ========================================================================== */
(function () {
  if (customElements.get('pfc-hand')) return;

  const THREE_SOURCES = [
    'assets/vendor/three.min.js',
    'https://unpkg.com/three@0.149.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  ];
  const EMOJI = { pierre: '✊', feuille: '✋', ciseaux: '✌️' };
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let loading = null;
  let failed = false;
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (!loading) {
      loading = THREE_SOURCES.reduce(
        (p, src) => p.catch(() => loadScript(src).then(() => { if (!window.THREE) throw new Error('THREE absent'); })),
        Promise.reject()
      );
    }
    return loading;
  }

  // Articulations : doigts [proximale, distale, écart] × 4 (index → auriculaire), pouce [lacet, tangage]
  const CURL = [-1.55, -1.75, 0];
  const POSES = {
    pierre: { f: [CURL, [-1.6, -1.75, 0], [-1.6, -1.75, 0], [-1.5, -1.7, 0]], t: [-0.9, -0.35] },
    feuille: { f: [[0, 0, 0.12], [0, 0, 0.04], [0, 0, -0.04], [0, 0, -0.12]], t: [0.6, 0] },
    ciseaux: { f: [[0, 0, 0.2], [0, 0, -0.12], [-1.6, -1.75, 0], [-1.5, -1.7, 0]], t: [-0.9, -0.35] }
  };
  const flat = p => [...p.f.flat(), ...p.t];

  // Tampon de rendu partagé (assez grand pour une tuile TV 4K)
  const RW = 1600, RH = 1250;
  let R = null;
  const insts = new Set();

  function build() {
    const T = window.THREE;
    let renderer;
    try {
      renderer = new T.WebGLRenderer({ antialias: true, alpha: true });
    } catch (e) { return false; }
    renderer.setPixelRatio(1); renderer.setSize(RW, RH, false); renderer.setClearColor(0x000000, 0);
    const scene = new T.Scene();
    scene.add(new T.AmbientLight(0xffffff, 0.45));
    const dl = new T.DirectionalLight(0xffffff, 0.9); dl.position.set(-1.2, 4, 2.2); scene.add(dl);
    const grad = new T.DataTexture(new Uint8Array([178, 178, 178, 255, 222, 222, 222, 255, 255, 255, 255, 255]), 3, 1);
    if (T.RGBAFormat) grad.format = T.RGBAFormat;
    grad.minFilter = grad.magFilter = T.NearestFilter; grad.needsUpdate = true;
    const skin = new T.MeshToonMaterial({ color: 0xffffff, gradientMap: grad });
    const ink = new T.MeshBasicMaterial({ color: 0x121212, side: T.BackSide });
    const box = (w, h, d) => {
      const g = new T.Group(), t = 0.04;
      g.add(new T.Mesh(new T.BoxGeometry(w + t * 2, h + t * 2, d + t * 2), ink));
      g.add(new T.Mesh(new T.BoxGeometry(w, h, d), skin));
      return g;
    };
    const root = new T.Group(); scene.add(root);
    const pivot = new T.Group(); root.add(pivot);
    const body = new T.Group(); pivot.add(body); body.position.x = 1.3;
    const fore = box(0.62, 0.5, 0.8); fore.position.set(-0.84, -0.01, 0); body.add(fore);
    const palm = box(1.0, 0.42, 1.0); body.add(palm);
    const fingers = [], Z = [-0.37, -0.123, 0.123, 0.37], LEN = [0.82, 0.92, 0.86, 0.66];
    Z.forEach((z, i) => {
      const L = LEN[i], a = L * 0.55, b = L * 0.45;
      const k = new T.Group(); k.position.set(0.5, 0.04, z); body.add(k);
      const p = box(a, 0.3, 0.215); p.position.x = a / 2; k.add(p);
      const j = new T.Group(); j.position.x = a; k.add(j);
      const d = box(b, 0.28, 0.205); d.position.x = b / 2; j.add(d);
      fingers.push({ k, j });
    });
    const th = new T.Group(); th.position.set(0.02, -0.03, -0.48); body.add(th);
    const tb = box(0.62, 0.28, 0.26); tb.position.x = 0.31; th.add(tb);
    const cam = new T.PerspectiveCamera(28, 1, 0.1, 50);
    R = { T, renderer, scene, root, pivot, fingers, th, cam, skin };
    return true;
  }

  function apply(st, side) {
    const { root, pivot, fingers, th, skin } = R, j = st.j;
    fingers.forEach((f, i) => { f.k.rotation.z = j[i * 3]; f.j.rotation.z = j[i * 3 + 1]; f.k.rotation.y = j[i * 3 + 2]; });
    th.rotation.y = j[12]; th.rotation.z = j[13];
    root.rotation.y = side === 'right' ? Math.PI + 0.5 : -0.5;
    root.position.x = side === 'right' ? 0.2 : -0.2;
    pivot.position.set(-1.3 + st.px, st.py, 0); pivot.rotation.z = st.wz;
    root.scale.setScalar(st.sc);
    const c = 1 - st.tint * 0.3; skin.color.setRGB(c, c, c);
  }

  let last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    if (!R) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    insts.forEach(el => { if (el._vis && el._need(now)) el._draw(now, dt); });
  }

  function fallbackAll() {
    failed = true;
    insts.forEach(el => el._fallback());
  }

  class PfcHand extends HTMLElement {
    static get observedAttributes() { return ['pose', 'mode', 'side']; }
    constructor() {
      super();
      this._st = { j: flat(POSES.pierre), px: 0, py: 0, wz: 0, sc: 1, tint: 0 };
      this._t0 = performance.now(); this._seed = Math.random() * 6; this._dirty = true; this._vis = false; this._lastDraw = 0;
    }
    connectedCallback() {
      if (!this._cv) {
        this.setAttribute('aria-hidden', 'true');
        this._cv = document.createElement('canvas');
        this._cv.style.cssText = 'display:block;width:100%;height:100%';
        this.appendChild(this._cv); this._ctx = this._cv.getContext('2d');
        this._emo = document.createElement('span');
        this._emo.className = 'pfc-hand__emoji';
        this.appendChild(this._emo);
      }
      this._ro = new ResizeObserver(() => this._size()); this._ro.observe(this);
      this._io = new IntersectionObserver(e => { this._vis = e[0].isIntersecting; this._dirty = true; }); this._io.observe(this);
      insts.add(this);
      this._snap();
      if (failed) { this._fallback(); return; }
      loadThree()
        .then(() => {
          if (!R) { if (!build()) return fallbackAll(); requestAnimationFrame(loop); }
          this._dirty = true;
        })
        .catch(fallbackAll);
    }
    disconnectedCallback() { insts.delete(this); this._ro && this._ro.disconnect(); this._io && this._io.disconnect(); }
    attributeChangedCallback() {
      this._t0 = performance.now(); this._dirty = true;
      if (this.mode === 'still') this._snap();
      if (failed) this._fallback();
    }
    get mode() { return this.getAttribute('mode') || 'idle'; }
    get pose() { return POSES[this.getAttribute('pose')] ? this.getAttribute('pose') : 'pierre'; }
    _fallback() {
      if (!this._emo) return;
      this.classList.add('pfc-hand--fallback');
      this._emo.textContent = this.mode === 'shake' ? '✊' : EMOJI[this.pose];
      this._emo.dataset.mode = this.mode;
    }
    _snap() { this._st.j = flat(POSES[this.pose]); }
    _size() {
      const d = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.min(RW, Math.round(this.clientWidth * d)));
      const h = Math.max(1, Math.min(RH, Math.round(this.clientHeight * d)));
      if (this._cv.width !== w || this._cv.height !== h) { this._cv.width = w; this._cv.height = h; this._dirty = true; }
    }
    _need(now) {
      if (this.mode === 'still') return this._dirty;
      if (reduceMotion && now - this._t0 > 1200) return this._dirty;
      return now - this._lastDraw > 30;
    }
    _target(now) {
      const t = (now - this._t0) / 1000, T = reduceMotion ? 0 : now / 1000, m = this.mode;
      let pose = POSES[this.pose], wz = 0, px = 0, py = 0, sc = 1, tint = 0, hard = false;
      if (m === 'idle') { py = 0.05 * Math.sin(T * 2.2 + this._seed); wz = 0.05 * Math.sin(T * 1.4 + this._seed); }
      else if (m === 'shake') { pose = POSES.pierre; const v = (1 - Math.cos(t * Math.PI * 2 / 0.42)) / 2; wz = 0.42 * v; py = 0.12 * v; hard = true; }
      else if (m === 'win') { const k = Math.min(1, t / 0.45), p = Math.sin(k * Math.PI); px = 0.45 * p; wz = -0.08 * p; sc = 1.05; py = t > 0.6 ? 0.04 * Math.sin(T * 2.4) : 0; }
      else if (m === 'lose') { wz = -0.28; py = -0.24; tint = 1; sc = 0.94; }
      else if (m === 'draw') { py = t < 0.5 ? 0.12 * Math.sin(t / 0.5 * Math.PI) : 0.03 * Math.sin(T * 2); }
      return { j: flat(pose), wz, px, py, sc, tint, hard };
    }
    _draw(now, dt) {
      const st = this._st;
      if (this.mode === 'still') { this._snap(); Object.assign(st, { px: 0, py: 0, wz: 0, sc: 1, tint: 0 }); }
      else {
        const g = this._target(now), k = 1 - Math.exp(-dt * 14), k2 = 1 - Math.exp(-dt * 7);
        st.j = st.j.map((v, i) => v + (g.j[i] - v) * k);
        if (g.hard) { st.wz = g.wz; st.py = g.py; } else { st.wz += (g.wz - st.wz) * k2; st.py += (g.py - st.py) * k2; }
        st.px += (g.px - st.px) * (g.px > st.px ? k * 1.6 : k); st.sc += (g.sc - st.sc) * k2; st.tint += (g.tint - st.tint) * k2;
      }
      const { renderer, scene, cam } = R, w = this._cv.width, h = this._cv.height, side = this.getAttribute('side') || 'left';
      if (w < 2 || h < 2) return;
      apply(st, side);
      const asp = w / h, dist = (this.mode === 'still' ? 3.9 : 4.9) * Math.max(1, 1.2 / asp);
      cam.aspect = asp; cam.position.set(0, 0.5 * dist, dist); cam.lookAt(0, -0.2, 0); cam.updateProjectionMatrix();
      renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
      renderer.clear(); renderer.render(scene, cam);
      this._ctx.clearRect(0, 0, w, h);
      this._ctx.drawImage(renderer.domElement, 0, RH - h, w, h, 0, 0, w, h);
      this._dirty = false; this._lastDraw = now;
    }
  }
  customElements.define('pfc-hand', PfcHand);
})();
