/* ==========================================================================
   PIERRE · FEUILLE · CISEAUX — logique de jeu & rendu
   Écrans : setup (réglages) → play (pick → thinking → reveal) → end
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- Données ---------- */
  const C = ['pierre', 'feuille', 'ciseaux'];
  const L = { pierre: 'Pierre', feuille: 'Feuille', ciseaux: 'Ciseaux' };
  const KEY = { pierre: '1', feuille: '2', ciseaux: '3' };
  const BEATS = { pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' };
  const VERB = { pierre: 'écrase', feuille: 'enveloppe', ciseaux: 'coupe' };
  const COUNTER = { pierre: 'feuille', feuille: 'ciseaux', ciseaux: 'pierre' };
  const LEVELS = [
    { v: 'easy', label: 'Distraite', meta: 'Facile', desc: 'Joue vite et se trompe souvent.' },
    { v: 'normal', label: 'Équilibrée', meta: 'Normale', desc: 'Joue au hasard, sans stratégie.' },
    { v: 'hard', label: 'Prédictive', meta: 'Difficile', desc: 'Analyse vos habitudes pour vous contrer.' }
  ];
  const FORMATS = [
    { v: 3, label: 'Premier à 3', meta: 'Bo3', short: 'Bo3' },
    { v: 5, label: 'Premier à 5', meta: 'Bo5', short: 'Bo5' },
    { v: 0, label: 'Libre', meta: '∞', short: 'Libre' }
  ];
  const THINK_MS = 850;
  const AUTO_END_MS = 1600;

  const outcome = (a, b) => (a === b ? 'draw' : BEATS[a] === b ? 'win' : 'lose');

  /* ---------- IA ----------
     Facile    : 40 % du temps, joue le coup qui PERD contre votre dernier coup.
     Normale   : hasard pur.
     Difficile : chaîne de Markov sur vos transitions (sinon fréquence globale),
                 avec 15 % d'aléatoire pour ne pas être prévisible. */
  function aiPick(level, moves) {
    const r = () => C[Math.floor(Math.random() * 3)];
    const last = moves[moves.length - 1];
    if (level === 'easy') return last && Math.random() < 0.4 ? BEATS[last] : r();
    if (level !== 'hard' || moves.length < 2 || Math.random() < 0.15) return r();
    const t = { pierre: 0, feuille: 0, ciseaux: 0 };
    for (let i = 0; i < moves.length - 1; i++) if (moves[i] === last) t[moves[i + 1]]++;
    let p = null, m = 0;
    for (const k of C) if (t[k] > m) { m = t[k]; p = k; }
    if (!p) {
      const f = { pierre: 0, feuille: 0, ciseaux: 0 };
      moves.forEach(x => f[x]++);
      p = C.reduce((a, b) => (f[a] >= f[b] ? a : b));
    }
    return COUNTER[p];
  }

  /* Score, séries et coup favori, calculés depuis l'historique (plus récent en premier) */
  function tally(h) {
    let sm = 0, sa = 0;
    h.forEach(x => { if (x.r === 'win') sm++; else if (x.r === 'lose') sa++; });
    let streak = 0;
    for (const x of h) { if (x.r === 'win') streak++; else if (x.r === 'lose') break; }
    let max = 0, cur = 0;
    [...h].reverse().forEach(x => { if (x.r === 'win') { cur++; max = Math.max(max, cur); } else if (x.r === 'lose') cur = 0; });
    const f = { pierre: 0, feuille: 0, ciseaux: 0 };
    h.forEach(x => f[x.me]++);
    const fav = h.length ? L[C.reduce((a, b) => (f[a] >= f[b] ? a : b))] : '—';
    return { sm, sa, streak, max, fav };
  }

  /* ---------- Préférences persistées ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('pfc_' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('pfc_' + k, JSON.stringify(v)); } catch (e) { /* stockage indisponible */ } }
  };

  /* ---------- État ---------- */
  const S = {
    screen: 'setup',
    phase: 'pick',
    target: [3, 5, 0].includes(store.get('target', 5)) ? store.get('target', 5) : 5,
    level: LEVELS.some(l => l.v === store.get('level', 'normal')) ? store.get('level', 'normal') : 'normal',
    sound: store.get('sound', true) !== false,
    me: null,
    ai: null,
    round: 1,
    history: [],
    sheet: false
  };
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const app = $('app');
  // Doit rester synchronisé avec les media queries de app.css
  const mqCompact = window.matchMedia('(max-width: 759.98px) and (orientation: portrait), (max-width: 759.98px) and (min-height: 541px)');
  const mqAside = window.matchMedia('(min-width: 1100px) and (min-height: 541px)');

  const sfx = n => { if (S.sound && window.PFCSound) window.PFCSound.play(n); };
  const buzz = p => { if (S.sound && navigator.vibrate && mqCompact.matches) { try { navigator.vibrate(p); } catch (e) { /* */ } } };

  /* Cartes d'options (format / adversaire) */
  function buildOptions(container, items, isSel, onPick, compactText) {
    container.innerHTML = '';
    items.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'al-option opt';
      b.setAttribute('role', 'radio');
      b.dataset.v = it.v;
      b.innerHTML = `<span class="opt__label">${it.label}</span><span class="opt__short">${compactText(it)}</span><span class="al-option__meta">${it.meta}</span>`;
      b.addEventListener('click', () => { onPick(it.v); });
      container.appendChild(b);
    });
    const sync = () => container.querySelectorAll('.opt').forEach(b => {
      const on = isSel(b.dataset.v);
      b.classList.toggle('al-option--selected', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    return sync;
  }
  const syncFormats = buildOptions($('formats'), FORMATS, v => String(S.target) === v,
    v => { sfx('select'); S.target = Number(v); store.set('target', S.target); render(); }, it => it.short);
  const syncLevels = buildOptions($('levels'), LEVELS, v => S.level === v,
    v => { sfx('select'); S.level = v; store.set('level', v); render(); }, it => it.meta);

  /* Boutons de coups */
  const choiceBtns = C.map(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'al-option choice';
    b.dataset.choice = c;
    b.setAttribute('aria-label', `${L[c]} (touche ${KEY[c]})`);
    b.innerHTML = `<span class="choice__body"><pfc-hand class="choice__hand" pose="${c}" mode="still" side="left"></pfc-hand><span class="choice__label">${L[c]}</span></span><span class="al-option__meta choice__key">${KEY[c]}</span>`;
    b.addEventListener('click', () => pick(c));
    $('choices').appendChild(b);
    return b;
  });

  /* ---------- Actions ---------- */
  function pick(c) {
    if (S.screen !== 'play' || S.phase !== 'pick') return;
    const ai = aiPick(S.level, [...S.history].reverse().map(h => h.me));
    sfx('tick'); later(() => sfx('tick'), 420);
    S.phase = 'thinking'; S.me = c; S.sheet = false;
    render();
    later(() => {
      const h = { n: S.round, me: c, ai, r: outcome(c, ai) };
      S.history = [h, ...S.history];
      S.phase = 'reveal'; S.ai = ai;
      sfx(h.r);
      buzz(h.r === 'win' ? [30, 40, 30] : h.r === 'lose' ? 120 : 40);
      render();
      if (isOver()) later(toEnd, AUTO_END_MS);
    }, THINK_MS);
  }

  function isOver() {
    const { sm, sa } = tally(S.history);
    return !!S.target && (sm >= S.target || sa >= S.target);
  }

  function next() {
    if (S.screen !== 'play' || S.phase !== 'reveal') return;
    if (isOver()) return toEnd();
    sfx('move');
    S.phase = 'pick'; S.me = null; S.ai = null; S.round += 1;
    render();
  }

  function toEnd() {
    if (S.screen === 'end') return;
    clearTimers();
    const { sm, sa } = tally(S.history);
    S.screen = 'end'; S.sheet = false;
    render();
    sfx(sm > sa ? 'victory' : 'defeat');
    if (sm > sa) confetti.burst();
  }

  function start() {
    clearTimers();
    sfx('select');
    Object.assign(S, { screen: 'play', phase: 'pick', me: null, ai: null, round: 1, history: [], sheet: false });
    confetti.stop();
    render();
  }

  function toSetup() {
    clearTimers();
    confetti.stop();
    Object.assign(S, { screen: 'setup', sheet: false, phase: 'pick', me: null, ai: null });
    render();
  }

  function toggleSound() {
    S.sound = !S.sound;
    store.set('sound', S.sound);
    if (S.sound && window.PFCSound) window.PFCSound.play('select');
    render();
  }

  function setSheet(open) {
    if (S.screen !== 'play' || mqAside.matches) { S.sheet = false; return; }
    if (open) sfx('move');
    S.sheet = open;
    render();
    if (open) requestAnimationFrame(() => { const b = $('history').querySelector('.js-close-history'); b && b.focus({ preventScroll: true }); });
  }

  /* ---------- Rendu ---------- */
  const setText = (id, t) => { const el = $(id); if (el.textContent !== String(t)) el.textContent = t; };
  const setAttr = (el, k, v) => { if (el.getAttribute(k) !== v) el.setAttribute(k, v); };
  const BADGE = {
    win: ['success', 'Gagné · +1 pour vous', '+1 vous', 'Gagné.'],
    lose: ['critical', 'Perdu · +1 pour l’IA', '+1 IA', 'Perdu.'],
    draw: ['neutral', 'Égalité · aucun point', 'Aucun point', 'Égalité.']
  };
  const RL = { win: 'Gagné', lose: 'Perdu', draw: 'Égalité' };
  const TONE = { win: 'success', lose: 'critical', draw: 'neutral' };

  function bumpIfChanged(id, v) {
    const el = $(id);
    if (el.textContent !== String(v)) {
      const grew = Number(v) > Number(el.textContent);
      el.textContent = v;
      if (grew) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    }
  }

  function render() {
    const t = S.target;
    const { sm, sa, streak, max, fav } = tally(S.history);
    const reveal = S.phase === 'reveal', thinking = S.phase === 'thinking';
    const res = reveal && S.history[0] ? S.history[0].r : null;
    const lvl = LEVELS.find(l => l.v === S.level);
    const over = isOver();

    app.dataset.screen = S.screen;
    app.dataset.phase = S.phase;
    app.dataset.result = res || '';
    app.classList.toggle('is-sheet', S.sheet);
    app.classList.toggle('is-free', !t);
    document.documentElement.classList.toggle('noir', S.screen === 'end');

    // Son
    $$('.js-sound-switch').forEach(i => { i.checked = S.sound; });
    $$('.js-sound-icon use').forEach(u => setAttr(u, 'href', S.sound ? '#i-volume-2' : '#i-volume-x'));
    $$('.js-sound-btn').forEach(b => { b.setAttribute('aria-pressed', S.sound ? 'true' : 'false'); });

    // Réglages
    syncFormats(); syncLevels();
    setText('level-desc', lvl.desc);

    // En-tête de jeu
    const fmtLong = t ? `Premier à ${t}` : 'Mode libre';
    const fmtShort = t ? `Bo${t}` : 'Libre';
    $('round-label').innerHTML = `Manche ${S.round} · <span class="only-wide">${fmtLong}</span><span class="only-compact">${fmtShort}</span>`;
    $('ai-label').innerHTML = `IA · <span class="only-wide">${lvl.label}</span><span class="only-compact">${lvl.meta}</span>`;

    // Score + pastilles de progression
    bumpIfChanged('score-me', sm); bumpIfChanged('score-ai', sa);
    const pips = n => Array.from({ length: t }, (_, i) => `<span class="pip${i < n ? ' pip--on' : ''}"></span>`).join('');
    $('pips-me').innerHTML = pips(sm);
    $('pips-ai').innerHTML = pips(sa);
    setText('streak-mini', streak);

    // Tuiles des mains
    const tile = who => {
      const mv = who === 'me' ? S.me : S.ai;
      let mode = 'idle', pose = 'pierre', caption = who === 'me' ? 'Votre coup' : 'En attente', state = '';
      if (thinking) { mode = 'shake'; caption = who === 'me' ? L[S.me] : 'Réfléchit…'; }
      if (reveal && mv) {
        pose = mv; caption = L[mv];
        const w = (who === 'me' && res === 'win') || (who === 'ai' && res === 'lose');
        const l = (who === 'me' && res === 'lose') || (who === 'ai' && res === 'win');
        mode = w ? 'win' : l ? 'lose' : 'draw';
        state = w ? 'win' : l ? 'lose' : 'draw';
      }
      return { mode, pose, caption, state };
    };
    [['me', 'hand-me', 'cap-me', 'tile-me'], ['ai', 'hand-ai', 'cap-ai', 'tile-ai']].forEach(([who, h, cap, box]) => {
      const v = tile(who);
      setAttr($(h), 'pose', v.pose);
      setAttr($(h), 'mode', v.mode);
      setText(cap, v.caption);
      $(box).dataset.state = v.state;
    });

    // Message
    let title = 'Faites votre choix.';
    let sub = mqCompact.matches ? 'Touchez un coup pour jouer.' : `Manche ${S.round} · touches 1, 2 ou 3`;
    if (mqCompact.matches && !thinking && !reveal) title = 'À vous.';
    if (thinking) { title = 'L’IA réfléchit…'; sub = `Vous jouez ${L[S.me]}`; }
    if (res === 'win') title = `${L[S.me]} ${VERB[S.me]} ${L[S.ai].toLowerCase()}.`;
    if (res === 'lose') title = `${L[S.ai]} ${VERB[S.ai]} ${L[S.me].toLowerCase()}.`;
    if (res === 'draw') title = `${L[S.me]} contre ${L[S.ai].toLowerCase()}.`;
    if (reveal) sub = '';
    setText('msg-title', title);
    setText('msg-sub', sub);
    const b = BADGE[res] || ['neutral', '', '', ''];
    $('msg-badge').className = `al-badge al-badge--${b[0]} message__badge`;
    setText('msg-badge', b[1]);

    // Feuille de résultat (mobile)
    setText('sheet-label', `Manche ${S.round}`);
    $('sheet-badge').className = `al-badge al-badge--${b[0]}`;
    setText('sheet-badge', b[2]);
    setText('sheet-word', b[3]);
    setText('sheet-line', reveal ? title : '');
    $$('.js-next-label').forEach(el => { el.textContent = over ? 'Voir le résultat' : 'Manche suivante'; });

    // Boutons de coups
    choiceBtns.forEach(btn => {
      const c = btn.dataset.choice;
      const sel = S.me === c;
      btn.classList.toggle('al-option--selected', sel);
      btn.classList.toggle('al-option--disabled', S.phase !== 'pick' && !sel);
      btn.disabled = S.phase !== 'pick' && !sel;
      btn.setAttribute('aria-pressed', sel ? 'true' : 'false');
    });

    // Historique (10 dernières manches)
    const rows = S.history.slice(0, 10);
    $('history-list').innerHTML = rows.length
      ? rows.map(h => `<div class="hrow"><span class="hrow__n">#${h.n}</span><span class="hrow__me">${L[h.me]}</span><span class="hrow__vs">vs</span><span class="hrow__ai">${L[h.ai]}</span><span class="hrow__sp"></span><span class="al-badge al-badge--${TONE[h.r]}">${RL[h.r]}</span></div>`).join('')
      : '<p class="history__empty">Vos manches s’afficheront ici.</p>';
    const n = S.history.length;
    setText('history-count', `${n} manche${n > 1 ? 's' : ''}`);
    setText('stat-streak', streak); setText('stat-max', max); setText('stat-fav', fav);

    // Fin de match
    const won = sm > sa;
    setText('end-label', `Match terminé · ${fmtLong}`);
    setText('end-title', won ? 'Victoire' : 'L’IA gagne');
    setText('end-sub', `${sm}–${sa} en ${n} manche${n > 1 ? 's' : ''}. ${won ? 'Bien joué.' : 'Prenez votre revanche.'}`);
    setText('end-score', `${sm}–${sa}`);
    setText('end-rounds', n);
    setText('end-max', max);
    setText('end-fav', fav);
    $('strip').innerHTML = [...S.history].reverse().map(h => {
      const letter = h.r === 'win' ? 'G' : h.r === 'lose' ? 'P' : 'N';
      return `<span class="strip__t strip__t--${h.r}" title="Manche ${h.n} : ${L[h.me]} vs ${L[h.ai]} (${RL[h.r]})">${letter}</span>`;
    }).join('');

    // Couleur de la barre du navigateur
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', S.screen === 'end' ? '#0a0a0a' : '#ffffff');

    // Masque les écrans inactifs aux technologies d'assistance
    ['setup', 'play', 'end'].forEach(s => {
      const el = $('screen-' + s);
      if (s === S.screen) el.removeAttribute('inert'); else el.setAttribute('inert', '');
    });

    autoFocus();
  }

  /* ---------- Confettis (victoire) ---------- */
  const confetti = (() => {
    const cv = $('confetti'), ctx = cv.getContext('2d');
    let parts = [], raf = null;
    const colors = ['#ffffff', '#f2551d', '#ff9a70', '#b3b3b3'];
    const size = () => {
      const d = Math.min(2, window.devicePixelRatio || 1);
      cv.width = cv.clientWidth * d; cv.height = cv.clientHeight * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    function loop() {
      const w = cv.clientWidth, h = cv.clientHeight;
      ctx.clearRect(0, 0, w, h);
      let alive = 0;
      parts.forEach(p => {
        p.vy += 0.18 * p.s; p.vx *= 0.995; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y < h + 20) {
          alive++;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });
      raf = alive ? requestAnimationFrame(loop) : null;
    }
    return {
      burst() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        size();
        const w = cv.clientWidth, h = cv.clientHeight, s = Math.max(1, Math.min(w, h) / 600);
        parts = Array.from({ length: 140 }, () => ({
          x: w * (0.15 + Math.random() * 0.7), y: h * 0.35 + (Math.random() - 0.5) * 80,
          vx: (Math.random() - 0.5) * 12 * s, vy: (-Math.random() * 11 - 4) * s,
          w: (Math.random() * 8 + 5) * s, h: (Math.random() * 5 + 3) * s,
          rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3, s,
          c: colors[Math.floor(Math.random() * colors.length)]
        }));
        if (!raf) loop();
      },
      stop() { parts = []; if (raf) cancelAnimationFrame(raf); raf = null; ctx.clearRect(0, 0, cv.width, cv.height); }
    };
  })();

  /* ---------- Navigation clavier / télécommande TV ---------- */
  let keyboardNav = false;
  window.addEventListener('pointerdown', () => { keyboardNav = false; app.classList.remove('kbd'); }, true);

  function scope() {
    if (S.sheet) return $('history');
    return $('screen-' + S.screen);
  }
  function focusables() {
    return Array.from(scope().querySelectorAll('button:not([disabled]), input:not([disabled])'))
      .filter(el => el.offsetParent !== null && el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  }

  /* Navigation spatiale : choisit l'élément le plus proche dans la direction de la flèche */
  function moveFocus(dir) {
    const els = focusables();
    if (!els.length) return;
    const cur = document.activeElement;
    if (!els.includes(cur)) { preferredTarget(els).focus(); return; }
    const rect = el => (el.closest('label') || el).getBoundingClientRect();
    const a = rect(cur);
    const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bestScore = Infinity;
    els.forEach(el => {
      if (el === cur) return;
      const b = rect(el);
      const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const dx = bx - ax, dy = by - ay;
      const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
      const cross = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      if (main <= 1 || cross > main * 2) return;
      const score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    });
    if (best) best.focus();
  }

  function preferredTarget(els) {
    els = els || focusables();
    const pref =
      S.sheet ? $('history').querySelector('.js-close-history') :
      S.screen === 'setup' ? $('btn-start') :
      S.screen === 'end' ? $('screen-end').querySelector('.js-start') :
      S.phase === 'reveal' ? els.find(e => e.classList.contains('js-next')) :
      S.phase === 'pick' ? (choiceBtns.find(b => b.dataset.choice === lastChoice) || choiceBtns[0]) : null;
    return (pref && els.includes(pref)) ? pref : els[0];
  }

  let lastChoice = 'pierre';
  function autoFocus() {
    if (!keyboardNav) return;
    requestAnimationFrame(() => {
      const els = focusables();
      if (els.includes(document.activeElement)) return;
      const t = preferredTarget(els);
      t && t.focus({ preventScroll: true });
    });
  }

  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const onControl = e.target instanceof Element && e.target.closest('button, input, label, select, a');
    const arrows = { arrowleft: 'left', arrowright: 'right', arrowup: 'up', arrowdown: 'down' };

    if (arrows[k]) {
      e.preventDefault();
      keyboardNav = true; app.classList.add('kbd');
      moveFocus(arrows[k]);
      return;
    }
    if (k === 'tab') { keyboardNav = true; app.classList.add('kbd'); return; }

    let hit = true;
    if (k === 'm') toggleSound();
    else if (k === 'escape' || k === 'backspace' || k === 'goback') {
      if (S.sheet) setSheet(false);
      else hit = false;
    }
    else if (k === 'enter' && e.target.matches && e.target.matches('input[type="checkbox"]')) e.target.click();
    else if ((k === 'enter' || k === ' ') && onControl) hit = false; // laisse le bouton focalisé agir
    else if (S.screen === 'setup') { if (k === 'enter') start(); else hit = false; }
    else if (S.screen === 'end') { if (k === 'enter' || k === ' ' || k === 'r') start(); else hit = false; }
    else if (k === '1' || k === 'p') pick('pierre');
    else if (k === '2' || k === 'f') pick('feuille');
    else if (k === '3' || k === 'c') pick('ciseaux');
    else if (k === ' ' || k === 'enter') next();
    else if (k === 'r') start();
    else if (k === 'h') setSheet(!S.sheet);
    else hit = false;
    if (hit) e.preventDefault();
  });

  /* ---------- Écouteurs ---------- */
  choiceBtns.forEach(b => b.addEventListener('focus', () => { lastChoice = b.dataset.choice; }));
  $$('.js-start').forEach(b => b.addEventListener('click', start));
  $$('.js-restart').forEach(b => b.addEventListener('click', start));
  $$('.js-to-setup').forEach(b => b.addEventListener('click', toSetup));
  $$('.js-next').forEach(b => b.addEventListener('click', next));
  $$('.js-sound-btn').forEach(b => b.addEventListener('click', toggleSound));
  $$('.js-sound-switch').forEach(i => i.addEventListener('change', () => { if (i.checked !== S.sound) toggleSound(); }));
  $$('.js-open-history').forEach(b => b.addEventListener('click', () => setSheet(true)));
  $$('.js-close-history').forEach(b => b.addEventListener('click', () => setSheet(false)));

  // Glisser vers le bas pour fermer l'historique (mobile)
  (() => {
    const sheet = $('history');
    let y0 = null;
    sheet.addEventListener('touchstart', e => { if (sheet.querySelector('.history__list').scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener('touchmove', e => {
      if (y0 === null || !S.sheet) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    sheet.addEventListener('touchend', e => {
      if (y0 === null) return;
      const dy = e.changedTouches[0].clientY - y0;
      sheet.style.transform = '';
      y0 = null;
      if (dy > 80) setSheet(false);
    });
  })();

  // Changement de mise en page (rotation, redimensionnement)
  const onLayout = () => { if (mqAside.matches && S.sheet) S.sheet = false; render(); };
  [mqCompact, mqAside].forEach(mq => (mq.addEventListener ? mq.addEventListener('change', onLayout) : mq.addListener(onLayout)));

  render();
})();
