'use strict';
/* ════════════════════════════════════════════════════════════════════
   KÉTHARMAD — felület
   ════════════════════════════════════════════════════════════════════ */

/* ── lapmegjelenítés (a szabálykönyv dizájnja) ────────────────────── */
const FCODE = { NER: 'NER', OSZ: 'ÖSZ', TIS: 'TSZ', RAD: 'RAD', SAJ: 'HÍR', KOR: 'KOR', JEL: 'JEL' };
const RES_ICON = { 'Forint': 'F', 'Média': 'M', 'Utca': 'U', 'Forint / Média': 'FM', 'Utca / Média': 'UM' };
{ const idx = {}, tot = {}; CARDS.forEach(c => { idx[c.f] = (idx[c.f] || 0) + 1; c.no = idx[c.f]; }); CARDS.forEach(c => { tot[c.f] = (tot[c.f] || 0) + 1; }); CARDS.forEach(c => c.tot = tot[c.f]); }
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function pipHTML(ch) {
  if (ch === 'T') return '<span class="pip T">↷</span>';
  if ('FMUA'.includes(ch)) return `<span class="pip ${ch}">${ch === 'A' ? '★' : ch}</span>`;
  return `<span class="pip G">${ch}</span>`;
}
function costHTML(c) {
  if (!c) return '';
  const m = c.match(/^(\d+)?([FMU]*)$/);
  if (!m) return '';
  let out = '';
  if (m[1]) out += pipHTML(m[1]);
  for (const ch of m[2]) out += pipHTML(ch);
  return out;
}
const costObjHTML = o => (o.g ? pipHTML(String(o.g)) : '') + o.s.map(pipHTML).join('') || pipHTML('0');
const costStr = o => (o.g ? String(o.g) : '') + o.s.join('');
function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\{([FMUT1-9])\}/g, (_, c) => pipHTML(c)).split('\n').map(p => `<p>${p}</p>`).join(''); }
function cardFace(name, mini) {
  const c = DEF[name];
  const len = c.n.length;
  const nameCls = len > 22 ? 'xlong' : (len > 15 ? 'long' : '');
  const textLen = c.x.length + c.q.length * 0.85;
  const dense = textLen > 300 ? 'xdense' : (textLen > 215 ? 'dense' : '');
  let art;
  const customSvg = (typeof CARD_ART !== 'undefined' && CARD_ART[c.n]) ? CARD_ART[c.n] : null;
  if (typeof cardIllustration === 'function' && CARD_IMAGES[c.n]) {
    art = cardIllustration(c.n);
    if (c.t === 'Esemény') art += `<span class="c-art-year">${c.year}</span>`;
  } else if (customSvg) {
    art = customSvg;
  } else if (c.t === 'Esemény') art = `<span class="c-year">${c.year}</span><span class="msym side">${c.i}</span>`;
  else if (c.t === 'Szereplő' || c.t === 'Jelző') art = `<span class="msym ghost">${c.i}</span><span class="medal"><span class="msym">${c.i}</span></span>`;
  else art = `<span class="msym">${c.i}</span>`;
  if (c.t === 'Bázis' && RES_ICON[c.s]) art += `<span class="c-respip">${[...RES_ICON[c.s]].map(pipHTML).join('')}</span>`;
  const legend = c.L ? '<span class="c-legend">◆ KÖZSZEREPLŐ</span>' : '';
  const tag = c.tag ? `<span class="c-tag ${c.tag}">${c.tag}</span>` : '';
  const stats = (c.p !== null && c.p !== undefined) ? `<span class="c-stats">${c.p}<i>/</i>${c.h}</span>` : '';
  return `<article class="card f-${c.f} t-${c.t}${mini ? ' mini' : ''}"><div class="frame">
    <header class="c-top"><h4 class="c-name ${nameCls}">${esc(c.n)}</h4><div class="c-cost">${costHTML(c.c)}</div></header>
    <div class="c-art">${legend}${tag}${art}</div>
    <div class="c-type"><b>${c.t}</b> — ${esc(c.s)}</div>
    <div class="c-text ${dense}">${rich(c.x)}<p class="c-flav">${esc(c.q)}</p></div>
    <footer class="c-foot"><span>${FCODE[c.f]} · ${String(c.no).padStart(2, '0')}/${c.tot}</span>${stats}</footer>
  </div></article>`;
}

/* ── állapot ──────────────────────────────────────────────────────── */
const UI = {
  S: null, gen: null, req: null, resolve: null, sel: {}, fx: [], seen: new Set(), seenHand: new Set(),
  speed: 1, askReact: true, cfg: null, running: false, gameId: 0,
};
try { const s = JSON.parse(localStorage.getItem('kh-game-prefs') || '{}'); if (s.speed) UI.speed = s.speed; if (s.askReact === false) UI.askReact = false; if (s.cfg) UI.savedCfg = s.cfg; } catch (e) { }
function savePrefs() { try { localStorage.setItem('kh-game-prefs', JSON.stringify({ speed: UI.speed, askReact: UI.askReact, cfg: UI.cfg })); } catch (e) { } }
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const me = () => UI.S ? UI.S.players.findIndex(p => p.human) : -1;
const FDESC = {
  NER: ['Kormánypárt', 'Pénz, média, intézmények. Erős, olcsó lapok — cserébe Botrányt termelnek. Két Intézménnyel Orbán Viktor az egész csapatot erősíti.', ['Orbán Viktor', 'Mészáros Lőrinc', 'Közmédia']],
  OSZ: ['Régi ellenzék', 'Hat párt, egy cél. Három különböző párttal bekapcsol az Összefogás és a Közös jelölt. A fő fegyver a Leleplezés.', ['Gyurcsány Ferenc', 'Márki-Zay Péter', 'Hadházy Ákos']],
  TIS: ['Új kihívó', 'Kicsiből indul, körről körre nő. Mozgalom és Szimpátia jelzők, olcsó Disszidensek, Felháborodás az ellenfél botrányaiból.', ['Magyar Péter', 'Tisza-szigetes önkéntes', 'Országjárás']],
  RAD: ['Jobbik és Mi Hazánk', 'Gyors, kemény, utcai. Radikális támadók, Lendület, közvetlen sebzés — ha elfogy a tempó, Kerítés és Határzár.', ['Toroczkai László', 'Sneider Tamás', 'Utcai demonstráció']],
};

/* ════════ BEÁLLÍTÓ KÉPERNYŐ ════════ */
function defaultCfg() {
  return UI.savedCfg || { me: 'TIS', opps: [{ faction: 'NER', ai: 'normal' }], variant: 'normal', spectate: false };
}
function renderSetup() {
  document.body.innerHTML = `<div id="setup"></div>`;
  UI.cfg = UI.cfg || defaultCfg();
  if (UI.cfg.variant !== 'short') UI.cfg.variant = 'normal';
  drawSetup();
}
function drawSetup() {
  const c = UI.cfg;
  const used = new Set([c.spectate ? null : c.me, ...c.opps.map(o => o.faction)].filter(Boolean));
  const facBtn = f => `<button class="fac f-${f}" data-fac="${f}" aria-pressed="${!c.spectate && c.me === f}">
      <span class="check msym">check</span>
      <div class="fac-top"><h3>${FACTION_NAME[f]}</h3><span>${FDESC[f][0]}</span></div>
      <div class="fac-cards">${FDESC[f][2].map(n => cardFace(n)).join('')}</div>
      <p>${FDESC[f][1]}</p></button>`;
  const oppRow = (o, i) => `<div class="opp-row">
      <span class="lbl">${c.spectate ? (i + 1) + '. gép' : (i + 1) + '. ellenfél'}</span>
      <div class="seg">${FACTIONS.map(f => `<button class="fbtn f-${f}" data-of="${i}" data-v="${f}" aria-pressed="${o.faction === f}" ${used.has(f) && o.faction !== f ? 'disabled' : ''}>${FACTION_NAME[f]}</button>`).join('')}</div>
      <div class="seg">${Object.keys(AI_LEVELS).map(l => `<button data-ol="${i}" data-v="${l}" aria-pressed="${o.ai === l}">${AI_LEVELS[l]}</button>`).join('')}</div>
      ${c.opps.length > (c.spectate ? 2 : 1) ? `<button class="icon-btn" data-rm="${i}" title="Eltávolítás"><span class="msym">close</span></button>` : ''}
    </div>`;
  $('#setup').innerHTML = `
    <div class="s-hero">
      <h1 class="s-title">Két <span class="stamp"><b>2/3</b></span> harmad</h1>
      <p class="s-sub">Négy politikai erő, tizenhat év, egyetlen győztes. Böngészős változat gépi ellenfelekkel. A teljes szabálykönyv: <a href="../Kétharmad.html" target="_blank">Kétharmad.html</a>.</p>
    </div>
    ${c.spectate ? '' : `<div class="s-h">Válassz frakciót</div><div class="facs">${FACTIONS.map(facBtn).join('')}</div>`}
    <div class="s-grid">
      <div>
        <div class="s-h">${c.spectate ? 'Gépi játékosok' : 'Ellenfelek'} (${c.opps.length})</div>
        ${c.opps.map(oppRow).join('')}
        ${c.opps.length < (c.spectate ? 4 : 3) ? `<button class="add-opp" data-add="1">+ ${c.spectate ? 'gépi játékos' : 'ellenfél'} hozzáadása</button>` : ''}
        <label class="spect"><input type="checkbox" id="spect" ${c.spectate ? 'checked' : ''}> Néző mód — csak gépek játszanak</label>
      </div>
      <div class="vari">
        <div class="s-h">Változat</div>
        ${[['normal', 'Normál játék', '20 Támogatottság (két játékosnál a második 25-tel kezd). Az utolsó talpon maradt nyer. Kb. 40–60 perc.'],
      ['short', 'Gyors játék', '15 Támogatottság (két játékosnál a második 20-szal kezd). Kb. 30 perc.']]
      .map(([v, t, d]) => `<label><input type="radio" name="var" value="${v}" ${c.variant === v ? 'checked' : ''}><div><b>${t}</b><span>${d}</span></div></label>`).join('')}
      </div>
    </div>
    <button class="go" id="go">Kampány indítása</button>`;
}
document.addEventListener('click', e => {
  if (!$('#setup')) return;
  const c = UI.cfg;
  const t = e.target.closest('button,input');
  if (!t) return;
  const taken = () => new Set([c.spectate ? null : c.me, ...c.opps.map(o => o.faction)].filter(Boolean));
  if (t.dataset.fac) {
    const f = t.dataset.fac;
    const clash = c.opps.find(o => o.faction === f);
    if (clash) clash.faction = c.me;
    c.me = f;
  } else if (t.dataset.of != null) c.opps[+t.dataset.of].faction = t.dataset.v;
  else if (t.dataset.ol != null) c.opps[+t.dataset.ol].ai = t.dataset.v;
  else if (t.dataset.rm != null) c.opps.splice(+t.dataset.rm, 1);
  else if (t.dataset.add) { const free = FACTIONS.filter(f => !taken().has(f)); c.opps.push({ faction: free[0], ai: 'normal' }); }
  else if (t.id === 'spect') {
    c.spectate = t.checked;
    if (c.spectate && c.opps.length < 2) { const free = FACTIONS.filter(f => !taken().has(f) && f !== c.me); c.opps.push({ faction: c.me && !c.opps.some(o => o.faction === c.me) ? c.me : free[0], ai: 'normal' }); }
    if (!c.spectate) { while (c.opps.length > 3) c.opps.pop(); if (c.opps.some(o => o.faction === c.me)) c.me = FACTIONS.find(f => !c.opps.some(o => o.faction === f)); }
  } else if (t.name === 'var') c.variant = t.value;
  else if (t.id === 'go') { savePrefs(); startGame(); return; }
  else return;
  drawSetup();
});

/* ════════ JÁTÉK INDÍTÁSA ════════ */
function startGame() {
  const c = UI.cfg;
  const players = [];
  if (!c.spectate) players.push({ name: 'Te', faction: c.me, ai: null });
  c.opps.forEach(o => players.push({ name: FACTION_NAME[o.faction], faction: o.faction, ai: o.ai }));
  const S = newGame({ players, variant: c.variant });
  UI.S = S; UI.gen = gameLoop(S); UI.req = null; UI.sel = {}; UI.fx = []; UI.seen = new Set(); UI.seenHand = new Set();
  UI.gameId++;
  document.body.innerHTML = `<div id="game"></div><div id="zoom"></div><div id="spot"></div><div id="modal"></div><div id="menu"></div>`;
  S.play.forEach(id => UI.seen.add(id));
  render();
  runLoop(UI.gameId);
}
async function runLoop(gid) {
  const S = UI.S;
  let r = UI.gen.next();
  while (!r.done) {
    if (gid !== UI.gameId) return;
    await flushEvents();
    if (gid !== UI.gameId) return;
    const req = r.value;
    const p = S.players[req.pid];
    let ans;
    if (p.ai) {
      UI.req = null; UI.thinking = req.pid;
      render();
      await sleep(30);
      ans = aiDecide(S, req);
      const d = aiDelay(req, ans);
      if (d) await sleep(d * UI.speed);
      UI.thinking = null;
    } else {
      if (req.q === 'react' && !UI.askReact) ans = { type: 'pass' };
      else ans = await askHuman(req);
    }
    if (gid !== UI.gameId) return;
    r = UI.gen.next(ans);
    render();
  }
  await flushEvents();
  render();
  showGameOver();
}
function aiDelay(req, ans) {
  switch (req.q) {
    case 'main': return ans && ans.type === 'next' ? 350 : 650;
    case 'react': return ans && ans.type !== 'pass' ? 500 : 0;
    case 'attack': return 700;
    case 'block': return 700;
    case 'pick': return 250;
  }
  return 200;
}
function askHuman(req) {
  UI.req = req; UI.sel = { pick: new Set(), att: {}, blk: {}, cur: null, tgt: null };
  if (req.q === 'attack') UI.sel.tgt = opps(UI.S, req.pid)[0];
  render();
  return new Promise(res => { UI.resolve = res; });
}
function answer(a) {
  const res = UI.resolve;
  UI.resolve = null; UI.req = null; closeMenu(); closeModal();
  if (res) res(a);
}

/* ── események: kiemelés, lebegő számok ───────────────────────────── */
async function flushEvents() {
  const S = UI.S;
  const evs = S.events.splice(0);
  const mine = me();
  for (const e of evs) {
    if (e.type === 'play' && e.pid !== mine) await spotlight(cardFace(e.name), `${S.players[e.pid].name}`, e.recruit ? 'toboroz' : 'kijátssza', 1300);
    else if (e.type === 'ability' && e.pid !== mine) await spotlight(cardFace(e.name), S.players[e.pid].name, 'képességet használ', 900);
    else if (e.type === 'era') { render(); await spotlight(cardFace(e.name), `${S.round}. forduló`, 'Új Esemény', 1700); }
    else if (e.type === 'cycle' && e.pid !== mine) UI.fx.push({ kind: 'toast', txt: `${S.players[e.pid].name}: Csere (Bázis el, új lap)` });
    else if (e.type === 'out') { render(); await spotlight(`<div class="banner" style="color:var(--${S.players[e.pid].faction.toLowerCase()})">${esc(S.players[e.pid].name)}<br>kiesett</div>`, '', '', 1600); }
    else if (e.type === 'steal') await spotlight(cardFace(S.cards[e.id].name), 'G-nap!', `átáll: ${S.players[e.to].name}`, 1600);
    else if (e.type === 'dice') UI.fx.push({ kind: 'toast', txt: `🎲 Márki-Zay dobása: ${e.n}` });
    else if (e.type === 'sup') UI.fx.push({ kind: 'sup', pid: e.pid, n: e.n });
    else if (e.type === 'scan') UI.fx.push({ kind: 'scan', pid: e.pid, n: e.n });
    else if (e.type === 'dmg') UI.fx.push({ kind: 'dmg', id: e.id, n: e.n });
    else if (e.type === 'pdmg') UI.fx.push({ kind: 'shake', pid: e.pid });
  }
}
function spotlight(inner, who, what, ms) {
  return new Promise(res => {
    const sp = $('#spot');
    if (!sp) return res();
    sp.innerHTML = `<div class="sp-in">${inner}${who || what ? `<div class="cap"><small>${esc(what)}</small>${esc(who)}</div>` : ''}</div>`;
    requestAnimationFrame(() => sp.classList.add('on'));
    let done = false;
    const fin = () => { if (done) return; done = true; sp.classList.remove('on'); sp.onclick = null; setTimeout(res, 160); };
    sp.onclick = fin;
    setTimeout(fin, ms * UI.speed);
  });
}
function applyFx() {
  const fx = UI.fx.splice(0);
  const merged = {};
  for (const f of fx) {
    if (f.kind === 'sup' || f.kind === 'scan') { const k = f.kind + f.pid; merged[k] = merged[k] || { ...f, n: 0 }; merged[k].n += f.n; }
    else if (f.kind === 'dmg') { const k = 'd' + f.id; merged[k] = merged[k] || { ...f, n: 0 }; merged[k].n += f.n; }
    else merged[Math.random()] = f;
  }
  for (const f of Object.values(merged)) {
    let el, txt, cls;
    if (f.kind === 'sup' && f.n) { el = document.querySelector(`[data-sup="${f.pid}"]`); txt = (f.n > 0 ? '+' : '') + f.n; cls = f.n > 0 ? 'pos' : 'neg'; }
    else if (f.kind === 'scan' && f.n) { el = document.querySelector(`[data-scan="${f.pid}"]`); txt = (f.n > 0 ? '+' : '') + f.n + ' B'; cls = 'scan'; }
    else if (f.kind === 'dmg') { el = document.querySelector(`.pc[data-cid="${f.id}"]`); txt = '−' + f.n; cls = 'dmg'; }
    else if (f.kind === 'shake') { const s = document.querySelector(`.seat[data-seat="${f.pid}"]`); if (s) { s.classList.remove('shake'); void s.offsetWidth; s.classList.add('shake'); } continue; }
    else if (f.kind === 'toast') { toast(f.txt); continue; }
    if (!el) continue;
    const s = document.createElement('span');
    s.className = 'float ' + cls; s.textContent = txt;
    el.appendChild(s);
    setTimeout(() => s.remove(), 1400);
  }
}
function toast(txt) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = txt;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}

/* ════════ RAJZOLÁS ════════ */
const PHASES = [['wake', 'Ébredés'], ['draw', 'Húzás'], ['main', 'Akció'], ['combat', 'Kampány'], ['close', 'Zárás']];
const PHASE_OF = { start: 'wake', end: 'main' };
function render() {
  const S = UI.S, g = $('#game');
  if (!S || !g) return;
  const board = g.querySelector('.board'), logb = g.querySelector('.logbox');
  const bs = board ? board.scrollTop : 0;
  const atBottom = !logb || logb.scrollHeight - logb.scrollTop - logb.clientHeight < 40;
  UI.ix = buildIx();
  const mine = me();
  const others = S.players.filter(p => p.id !== (mine >= 0 ? mine : 0));
  const bottom = S.players[mine >= 0 ? mine : 0];
  g.innerHTML = topbarHTML() + `<main class="board">
      <div class="opps n${others.length}">${others.map(p => seatHTML(p, false, others.length)).join('')}</div>
      ${arenaHTML()}
      <div class="me">${seatHTML(bottom, true, others.length)}</div>
      ${handHTML(bottom)}
    </main>` + sideHTML();
  const nb = g.querySelector('.board'); if (nb) nb.scrollTop = bs;
  const nl = g.querySelector('.logbox'); if (nl && atBottom) nl.scrollTop = nl.scrollHeight;
  S.play.forEach(id => UI.seen.add(id));
  if (mine >= 0) S.players[mine].hand.forEach(id => UI.seenHand.add(id));
  applyFx();
  renderModalForReq();
}
function topbarHTML() {
  const S = UI.S;
  const tl = S.era
    ? `<div class="tl now" data-zoom-name="${esc(S.era)}" title="${esc(S.era)}">${S.round}. forduló · ${esc(S.era)}</div><div class="tl" title="Esemény-pakli">${S.eventDeck.length} Esemény a pakliban</div>`
    : '';
  const sp = { 1.7: 'Lassú', 1: 'Normál', 0.35: 'Gyors' }[UI.speed] || 'Normál';
  return `<header class="topbar">
    <div class="brand"><span class="stamp"><b>2/3</b></span>Kétharmad</div>
    <div class="timeline">${tl}</div>
    <div class="tb-btns">
      <button data-btn="speed" title="Gépi játékosok tempója"><span class="msym">speed</span>${sp}</button>
      <button data-btn="react" title="Kérdezzen-e a játék, ha Reakciót játszhatsz az ellenfél körében"><span class="msym">${UI.askReact ? 'notifications_active' : 'notifications_off'}</span>Reakciók</button>
      <button data-btn="help"><span class="msym">menu_book</span>Szabályok</button>
      <button data-btn="new"><span class="msym">restart_alt</span>Új játék</button>
    </div></header>`;
}
function seatHTML(p, isMe, nOpp) {
  const S = UI.S, ix = UI.ix;
  const turn = S.turn === p.id && !S.over;
  const th = threshold(S, p.id);
  const sc = Array.from({ length: Math.min(p.scandal, 14) }, (_, i) => `<i class="${i + 1 === th ? 'th' : ''}"></i>`).join('');
  const hand = isMe && p.human ? '' : `<span title="Kézben">${`<span class="hand-backs">${Array.from({ length: Math.min(p.hand.length, 8) }, () => '<span class="back"></span>').join('')}</span>`}&nbsp;${p.hand.length}</span>`;
  const tgtSeat = ix.seatTgt.has(p.id) ? ` tgt${ix.seatSel === p.id ? ' sel' : ''}` : '';
  const head = `<div class="s-head">
      <div class="s-name">${esc(p.name === 'Te' ? 'Te · ' + FACTION_NAME[p.faction] : p.name)}<small>${p.ai ? `<span class="lvl ${p.ai}">${AI_LEVELS[p.ai]}</span>` : 'Játékos'}${turn ? ' · soron' : ''}</small></div>
      <div class="sup${p.support <= 5 ? ' low' : ''}" data-sup="${p.id}" title="Támogatottság"><b>${Math.max(p.support, 0)}</b><span>Támog.</span></div>
      <div class="scan${p.scandal >= th ? ' hot' : ''}" data-scan="${p.id}" title="Botrány (küszöb: ${th})">${sc}<em>${p.scandal} Botrány</em></div>
      ${p.pool.length ? `<div class="pool"><small>Erőforrás</small>${p.pool.map(pipHTML).join('')}</div>` : ''}
      <div class="counts">${hand}<span title="Pakli"><span class="msym">layers</span>${p.deck.length}</span><span title="Süllyesztő"><span class="msym">delete_sweep</span>${p.discard.length}</span></div>
    </div>`;
  const W = isMe ? 96 : (nOpp >= 3 ? 64 : nOpp === 2 ? 74 : 84);
  const ch = chars(S, p.id).map(id => pcHTML(id, W)).join('');
  const ins = insts(S, p.id).map(id => pcHTML(id, Math.round(W * 0.82))).join('');
  const bs = basesOf(S, p.id).map(baseHTML).join('');
  const zone = `<div class="zone-row"><div class="zone">${ch || '<span style="color:var(--muted);font-size:13px;padding:10px 0">Nincs szereplő</span>'}</div>${ins ? `<span class="zl">Intézmény</span><div class="zone">${ins}</div>` : ''}</div>`;
  const bases = `<div class="bases">${bs}</div>`;
  return `<section class="seat f-${p.faction}${turn ? ' turn' : ''}${p.out ? ' out' : ''}${tgtSeat}" data-seat="${p.id}">
    ${isMe ? head + zone + bases : head + bases + zone}</section>`;
}
function pcHTML(id, w) {
  const S = UI.S, c = S.cards[id], d = DEF[c.name], ix = UI.ix;
  const isC = d.t === 'Szereplő' || d.t === 'Jelző';
  const cls = ['pc'];
  if (c.tapped) cls.push('tapped');
  if (!UI.seen.has(id)) cls.push('enter');
  if (c.att) cls.push('att');
  if (c.blk) cls.push('blk');
  if (ix.play[id]) cls.push('can');
  if (ix.tgt.has(id)) cls.push('tgt');
  if (ix.sel.has(id)) cls.push('sel');
  if (ix.dim && !ix.tgt.has(id) && !ix.play[id] && !ix.sel.has(id)) cls.push('dim');
  let ov = '';
  if (isC) {
    const p = power(S, id), h = tough(S, id);
    ov += `<span class="st"><span class="${p > d.p ? 'up' : p < d.p ? 'dn' : ''}">${p}</span><i>/</i><span class="${h > d.h ? 'up' : h < d.h ? 'dn' : ''}">${h}</span></span>`;
    const kws = allKW(S, id).filter(k => ['Propaganda', 'Lendület', 'Mentelmi jog', 'Oknyomozó', 'Radikális', 'Kerítés'].includes(k));
    let chips = kws.map(k => `<span class="chip k-${k.split(' ')[0]}">${k}</span>`).join('');
    if (c.name === 'Vona Gábor' && c.mode === 'B') chips += '<span class="chip">Néppárt</span>';
    if (S.cards[id].owner !== c.ctrl && c.owner != null && !c.token && DEF[c.name].f !== 'SAJ') chips += '<span class="chip">Átállt</span>';
    ov += `<span class="chips">${chips}</span>`;
    if (c.symp) ov += `<span class="symp">${Array.from({ length: Math.min(c.symp, 5) }, () => '<i></i>').join('')}</span>`;
    if (c.dmg) ov += `<span class="dmgm">${c.dmg}</span>`;
    if (c.fresh && !hasKW(S, id, 'Lendület')) ov += '<span class="msym fresh" title="Friss: ebben a körben nem támadhat">hourglass_top</span>';
  }
  if (c.tapped) ov += '<span class="tapmark">↷</span>';
  if (ix.attTgt[id] != null) ov += `<span class="tgtname">→ ${esc(S.players[ix.attTgt[id]].name)}</span>`;
  if (ix.blkOf[id]) ov += `<span class="blkname">⛨ ${esc(S.cards[ix.blkOf[id]].name.split(' ')[0])}</span>`;
  return `<div class="${cls.join(' ')}" data-cid="${id}" style="--w:${w}px">${cardFace(c.name, true)}<div class="ov">${ov}</div></div>`;
}
function baseHTML(id) {
  const S = UI.S, c = S.cards[id], d = DEF[c.name], ix = UI.ix;
  const letters = [...new Set((manaOptions(S, id) || []).flat())];
  const cls = ['base', 'f-' + d.f];
  if (c.tapped) cls.push('tapped');
  if (!UI.seen.has(id)) cls.push('enter');
  if (ix.play[id]) cls.push('can');
  return `<div class="${cls.join(' ')}" data-cid="${id}" title="${esc(c.name)}"><span class="msym">${d.i}</span><span class="bp">${letters.map(pipHTML).join('')}</span></div>`;
}
function handHTML(p) {
  const S = UI.S, ix = UI.ix;
  if (!p.human) return `<div class="hand" style="min-height:40px"></div>`;
  const n = p.hand.length;
  const w = n > 9 ? 104 : 118;
  return `<div class="hand">${p.hand.map((id, i) => {
    const cls = ['hc'];
    if (ix.hand[id]) cls.push('can');
    if (ix.sel.has(id)) cls.push('sel');
    if (!UI.seenHand.has(id)) cls.push('drawn');
    const rot = (i - (n - 1) / 2) * (n > 7 ? 2.2 : 3);
    const d = DEF[S.cards[id].name];
    let adj = '';
    if (ix.cyc[id] && !ix.hand[id]) cls.push('can');
    if (d.t !== 'Bázis') {
      const cc = costOf(S, p.id, d.n, 'play'), pc = parseCostUI(d.c);
      if (cc.g !== pc.g) adj = `<span class="cost-adj">${cc.g < pc.g ? 'Olcsóbb' : 'Drágább'}: ${costStr(cc) || '0'}</span>`;
    }
    return `<div class="${cls.join(' ')}" data-cid="${id}" data-hand="1" style="width:${w}px;transform:rotate(${rot}deg) translateY(${Math.abs(rot) * 1.6}px)">${adj}${cardFace(d.n)}</div>`;
  }).join('')}</div>`;
}
function parseCostUI(c) { const m = /^(\d+)?([FMU]*)$/.exec(c || ''); return { g: m && m[1] ? +m[1] : 0, s: m ? [...(m[2] || '')] : [] }; }
function sideHTML() {
  const S = UI.S, ix = UI.ix, mine = me();
  const era = S.era ? `<div class="era-wrap"><div class="pc" data-zoom-name="${esc(S.era)}" style="--w:112px">${cardFace(S.era, false)}</div>
     <div class="era-txt"><b>${esc(S.era)}</b>${rich(DEF[S.era].x)}<div class="rnd">${S.round}. forduló · a következő forduló elejéig tart</div></div></div>` : '<div class="era-txt">A játék hamarosan kezdődik…</div>';
  const feed = S.feed.map((id, i) => {
    const n = S.cards[id].name;
    const can = ix.feed[i];
    const cc = mine >= 0 ? costOf(S, mine, n, 'recruit') : parseCostUI(DEF[n].c);
    return `<div><div class="pc${can ? ' can' : ''}" data-cid="${id}" data-feed="${i}">${cardFace(n, false)}</div><div class="fc-cost">${costObjHTML(cc)}</div></div>`;
  }).join('');
  const logs = S.log.slice(-260).map(l => `<p class="${l.c}">${esc(l.t)}</p>`).join('');
  return `<aside class="side">
    <div class="side-sec"><h4><span>Esemény</span><span>${S.round ? S.round + '. forduló' : ''}</span></h4>${era}</div>
    <div class="side-sec"><h4><span>Hírfolyam</span><span>${S.feedDeck.length} a pakliban</span></h4><div class="feed">${feed}</div></div>
    <div class="side-sec" style="border-bottom:0;padding-bottom:0"><h4>Napló</h4></div>
    <div class="logbox">${logs}</div></aside>`;
}

/* ── interakciós térkép ───────────────────────────────────────────── */
function buildIx() {
  const S = UI.S, req = UI.req;
  const ix = { hand: {}, cyc: {}, play: {}, feed: {}, tgt: new Set(), sel: new Set(), seatTgt: new Set(), seatSel: null, attTgt: {}, blkOf: {}, dim: false, acts: [] };
  if (!req) return ix;
  const pid = req.pid;
  if (req.q === 'main' || req.q === 'react') {
    const acts = req.q === 'react' ? req.acts : legal(S, pid, req.ctx);
    ix.acts = acts;
    for (const a of acts) {
      if (a.type === 'play' || a.type === 'base') ix.hand[a.cid] = a;
      else if (a.type === 'cycle') ix.cyc[a.cid] = a;
      else if (a.type === 'recruit') ix.feed[a.idx] = a;
      else if (a.type === 'ability') (ix.play[a.cid] = ix.play[a.cid] || []).push(a);
    }
    for (const id of inPlay(S, pid)) if (manualTapOK(S, pid, id)) (ix.play[id] = ix.play[id] || []).push({ type: 'tap', cid: id });
  } else if (req.q === 'pick') {
    for (const o of req.options) {
      if (o.card && S.cards[o.card].zone === 'play') ix.tgt.add(o.card);
      if (o.player != null) ix.seatTgt.add(o.player);
    }
    for (const id of UI.sel.pick || []) { ix.sel.add(id); if (String(id).startsWith('p')) ix.seatSel = +String(id).slice(1); }
    ix.dim = ix.tgt.size > 0;
  } else if (req.q === 'attack') {
    for (const a of req.elig) ix.tgt.add(a);
    for (const a in UI.sel.att) { ix.sel.add(a); ix.attTgt[a] = UI.sel.att[a]; }
    if (opps(S, pid).length > 1) { opps(S, pid).forEach(o => ix.seatTgt.add(o)); ix.seatSel = UI.sel.tgt; }
  } else if (req.q === 'block') {
    for (const b of req.blockers) ix.tgt.add(b);
    if (UI.sel.cur) { for (const a of req.attackers) ix.tgt.add(a); ix.sel.add(UI.sel.cur); }
    for (const b in UI.sel.blk) { ix.sel.add(b); ix.blkOf[b] = UI.sel.blk[b]; }
  }
  return ix;
}

/* ── középső sáv: utasítás + gombok ───────────────────────────────── */
function arenaHTML() {
  const S = UI.S, req = UI.req;
  const cur = S.players[S.turn];
  const phases = `<div class="phases" style="--fc:var(--${cur.faction.toLowerCase()})">${PHASES.map(([k, l]) => `<span class="ph${(PHASE_OF[S.phase] || S.phase) === k ? ' on' : ''}">${l}</span>`).join('')}</div>`;
  let body = '', btns = '';
  if (S.over) {
    body = `<b>Vége a játéknak</b><small>${S.winner != null ? esc(S.players[S.winner].name) + ' nyert.' : ''}</small>`;
    btns = `<button class="btn pri" data-btn="over">Eredmény</button>`;
  } else if (!req) {
    const who = UI.thinking != null ? S.players[UI.thinking] : cur;
    body = `<div class="thinking" style="--fc:var(--${who.faction.toLowerCase()})"><i></i><i></i><i></i>&nbsp;<span>${esc(who.name)} ${who.human ? 'következik' : 'gondolkodik…'}</span></div>`;
  } else if (req.q === 'main') {
    const ex = UI.ix.acts.some(a => a.type === 'expose');
    const exBtn = `<button class="btn" data-btn="expose" ${ex ? '' : 'disabled'} title="Legfeljebb 2 Botrányt veszel el egy ellenféltől; mindegyik −1 Támogatottság">Leleplezés ${costObjHTML(exposeCost(S, req.pid))}</button>`;
    if (req.ctx === 'main') {
      body = `<b>Akció</b><small>Kattints a kiemelt lapokra: Bázis, kijátszás, Toborzás (Hírfolyam), képességek. Kézben lévő Bázisra kattintva Csere is választható. A Bázisokra kattintva kézzel is meríthetsz.</small>`;
      const noAtk = S.era === 'Járvány' || !eligibleAttackers(S, req.pid).length;
      btns = `${exBtn}<button class="btn pri" data-btn="next">${noAtk ? 'Kör vége' : 'Kampány'} ▶</button>`;
    } else {
      body = `<b>Akció (a Kampány után)</b><small>Folytathatod: Bázis, lapok, Toborzás, Leleplezés, Csere, képességek — csak újabb Kampány nem lehet.</small>`;
      btns = `${exBtn}<button class="btn pri" data-btn="next">Kör vége ▶</button>`;
    }
  } else if (req.q === 'react') {
    if (req.ctx === 'stack') {
      const top = S.stack[S.stack.length - 1];
      body = `<b>Reagálsz?</b><small>${top ? esc(S.players[top.pid].name) + ' kijátszotta: ' + esc(S.cards[top.cid].name) + '. ' : ''}Kijátszhatsz egy kiemelt Reakciót, vagy passzolsz.</small>`;
    } else body = `<b>Kampány — reakciók</b><small>Sebzés előtt kijátszhatsz Reakciót vagy használhatsz képességet.</small>`;
    btns = `<button class="btn pri" data-btn="pass">Passz</button>`;
  } else if (req.q === 'attack') {
    const n = Object.keys(UI.sel.att).length;
    const os = opps(S, req.pid);
    const tax = os.filter(o => has(S, o, 'Határzár')).map(o => S.players[o].name);
    body = `<b>Kampány: támadás</b><small>Kattints a támadni kívánt szereplőidre.${os.length > 1 ? ' A célpontot a gombokkal vagy az ellenfél paneljére kattintva választod.' : ''}${tax.length ? ` Határzár (${esc(tax.join(', '))}): támadónként 1 erőforrás.` : ''}</small>`;
    if (os.length > 1) btns += os.map(o => `<button class="btn sm${UI.sel.tgt === o ? ' pri' : ''}" data-btn="tgt" data-v="${o}">→ ${esc(S.players[o].name)}</button>`).join('');
    btns += `<button class="btn sm" data-btn="allatt">Mind</button><button class="btn" data-btn="noatt">Nem támadok</button><button class="btn red" data-btn="doatt" ${n ? '' : 'disabled'}>Támadás (${n}) ▶</button>`;
  } else if (req.q === 'block') {
    const props = req.attackers.filter(a => hasKW(S, a, 'Propaganda') && Object.values(UI.sel.blk).filter(x => x === a).length === 1).map(a => S.cards[a].name);
    const nb = a => Object.values(UI.sel.blk).filter(x => x === a).length;
    const unb = req.attackers.filter(a => nb(a) === 0 || (nb(a) === 1 && hasKW(S, a, 'Propaganda'))).reduce((s, a) => s + Math.max(0, power(S, a)), 0);
    body = `<b>Feltartás</b><small>${UI.sel.cur ? 'Most kattints arra a támadóra, akit feltart.' : 'Kattints egy szereplődre, majd a támadóra, akit feltart.'} Feltartatlan sebzés: <b style="font-size:15px;color:var(--bad)">${unb}</b>.${props.length ? ` <span style="color:var(--bad)">${esc(props.join(', '))}: Propaganda — legalább két feltartó kell!</span>` : ''}</small>`;
    btns = `<button class="btn" data-btn="noblk">Nem tartok fel</button><button class="btn pri" data-btn="doblk">Kész ▶</button>`;
  } else if (req.q === 'pick' && !pickUsesModal(req)) {
    body = `<b>Válassz</b><small>${esc(req.prompt)}</small>`;
    const labelOnly = req.options.filter(o => !o.card && o.player == null);
    btns += labelOnly.map(o => `<button class="btn" data-btn="opt" data-v="${esc(o.id)}">${esc(o.label)}</button>`).join('');
    if (req.max > 1 || req.min === 0) btns += `<button class="btn pri" data-btn="pickok">${UI.sel.pick.size ? 'Kész' : (req.min === 0 ? 'Kihagyom' : 'Kész')}</button>`;
    if (req.cancel) btns += `<button class="btn" data-btn="cancel">Mégse</button>`;
  } else if (req.q === 'pick') {
    body = `<b>Válassz</b><small>${esc(req.prompt)}</small>`;
  }
  return `<div class="arena${req ? ' act' : ''}">${phases}<div class="prompt">${body}</div><div class="pbtns">${btns}</div></div>`;
}

/* ── választás modálban ───────────────────────────────────────────── */
function pickUsesModal(req) {
  if (req.show) return true;
  if (req.options.some(o => o.card && UI.S.cards[o.card].zone !== 'play')) return true;
  if (req.options.length && req.options.every(o => !o.card && o.player == null)) return req.options.length > 3 || !!req.title;
  return false;
}
function renderModalForReq() {
  const req = UI.req, m = $('#modal');
  if (!m) return;
  if (!req || req.q !== 'pick' || !pickUsesModal(req)) { if (m.dataset.kind === 'pick') closeModal(); return; }
  const S = UI.S;
  const optCards = new Map(req.options.filter(o => o.card).map(o => [o.card, o]));
  const show = req.show || req.options.filter(o => o.card).map(o => o.card);
  const cards = show.map(id => {
    const o = optCards.get(id);
    const cls = ['mc'];
    if (o) cls.push('opt');
    if (o && UI.sel.pick.has(o.id)) cls.push('sel');
    if (!o && req.max > 0) cls.push('no');
    return `<div class="${cls.join(' ')}" ${o ? `data-mopt="${esc(o.id)}"` : ''} data-zoom-name="${esc(S.cards[id].name)}">${cardFace(S.cards[id].name)}</div>`;
  }).join('');
  const labels = req.options.filter(o => !o.card);
  let btns = '';
  if (req.max === 0) btns = `<button class="btn pri" data-mbtn="ok">Rendben</button>`;
  else {
    if (req.cancel) btns += `<button class="btn" data-mbtn="cancel">Mégse</button>`;
    if (req.max > 1 || req.min === 0) btns += `<button class="btn pri" data-mbtn="ok" ${UI.sel.pick.size < req.min ? 'disabled' : ''}>${UI.sel.pick.size ? `Kész (${UI.sel.pick.size})` : (req.min === 0 ? 'Kihagyom' : 'Kész')}</button>`;
  }
  m.dataset.kind = 'pick';
  m.innerHTML = `<div class="mbox"><h3>${esc(req.title || 'Döntés')}</h3><p class="mp">${esc(req.prompt)}${req.max > 1 ? ` (${req.min === req.max ? req.min : req.min + '–' + req.max} lap)` : ''}</p>
    ${cards ? `<div class="mcards">${cards}</div>` : ''}
    ${labels.length ? `<div class="mopts">${labels.map(o => `<button class="btn${UI.sel.pick.has(o.id) ? ' pri' : ''}" data-mopt="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>` : ''}
    <div class="mbtns">${btns}</div></div>`;
  m.classList.add('on');
}
function closeModal() { const m = $('#modal'); if (m) { m.classList.remove('on'); m.innerHTML = ''; m.dataset.kind = ''; } }
function togglePick(id) {
  const req = UI.req;
  const opt = req.options.find(o => String(o.id) === String(id));
  if (!opt) return;
  const real = opt.id;
  if (req.max === 1 && req.min <= 1) { answer([real]); return; }
  if (UI.sel.pick.has(real)) UI.sel.pick.delete(real);
  else if (UI.sel.pick.size < req.max) UI.sel.pick.add(real);
  render();
}

/* ── felugró menü ─────────────────────────────────────────────────── */
function openMenu(el, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => `<button data-mi="${i}" ${it.disabled ? 'disabled' : ''}>${it.html}</button>`).join('');
  m._items = items;
  const r = el.getBoundingClientRect();
  m.classList.add('on');
  const mw = m.offsetWidth, mh = m.offsetHeight;
  let x = r.left + r.width / 2 - mw / 2, y = r.top - mh - 8;
  if (y < 8) y = r.bottom + 8;
  x = Math.max(8, Math.min(window.innerWidth - mw - 8, x));
  m.style.left = x + 'px'; m.style.top = y + 'px';
}
function closeMenu() { const m = $('#menu'); if (m) { m.classList.remove('on'); m._items = null; } }
function cardMenu(el, id) {
  const S = UI.S, list = UI.ix.play[id], c = S.cards[id];
  const items = [];
  for (const a of list) {
    if (a.type === 'tap') {
      const opts = manaOptions(S, id);
      const dirty = MANA[c.name] && MANA[c.name].dirty;
      opts.forEach((o, k) => items.push({ html: `<span class="pip T">↷</span> Erőforrás: ${o.map(pipHTML).join('')}${dirty ? ' <span style="color:var(--bad)">+1 Botrány</span>' : ''}`, fn: () => answer({ type: 'tap', cid: id, opt: k }) }));
    } else {
      const ab = ABIL[c.name][a.ab];
      items.push({ html: `<span class="pip T">↷</span>${ab.cost ? costObjHTML(ab.cost) : ''} ${esc(ab.label)}${ab.sac ? ' (feláldozás)' : ''}`, fn: () => answer(a) });
    }
  }
  if (items.length === 1 && list[0].type === 'tap' && DEF[c.name].t === 'Bázis') { items[0].fn(); return; }
  openMenu(el, items);
}

/* ════════ KATTINTÁSOK ════════ */
document.addEventListener('click', e => {
  if (!$('#game')) return;
  const mi = e.target.closest('#menu [data-mi]');
  if (mi) { const it = $('#menu')._items[+mi.dataset.mi]; closeMenu(); if (it && it.fn) it.fn(); return; }
  if (!e.target.closest('#menu')) closeMenu();
  const btn = e.target.closest('[data-btn]');
  if (btn) return onBtn(btn.dataset.btn, btn.dataset.v, btn);
  const mo = e.target.closest('[data-mopt]');
  if (mo && UI.req && UI.req.q === 'pick') return togglePick(mo.dataset.mopt);
  const mb = e.target.closest('[data-mbtn]');
  if (mb && UI.req && UI.req.q === 'pick') {
    if (mb.dataset.mbtn === 'cancel') return answer(null);
    return answer([...UI.sel.pick]);
  }
  const seat = e.target.closest('.seat');
  const cardEl = e.target.closest('[data-cid]');
  const req = UI.req;
  if (!req) return;
  const S = UI.S;
  if (cardEl) {
    const id = cardEl.dataset.cid;
    if (req.q === 'main' || req.q === 'react') {
      if (cardEl.dataset.feed != null) { const a = UI.ix.feed[+cardEl.dataset.feed]; if (a) answer(a); return; }
      if (cardEl.dataset.hand && UI.ix.cyc[id]) {
        const items = [];
        if (UI.ix.hand[id]) items.push({ html: 'Bázis lerakása', fn: () => answer(UI.ix.hand[id]) });
        items.push({ html: `Csere ${costObjHTML(CYCLE_COST)} — eldobod, és húzol egy lapot`, fn: () => answer(UI.ix.cyc[id]) });
        return openMenu(cardEl, items);
      }
      if (cardEl.dataset.hand && UI.ix.hand[id]) return answer(UI.ix.hand[id]);
      if (UI.ix.play[id]) return cardMenu(cardEl, id);
      return;
    }
    if (req.q === 'pick') {
      const o = req.options.find(o => o.card === id);
      if (o) return togglePick(o.id);
      return;
    }
    if (req.q === 'attack') {
      if (req.elig.includes(id)) { if (UI.sel.att[id] != null) delete UI.sel.att[id]; else UI.sel.att[id] = UI.sel.tgt; render(); }
      return;
    }
    if (req.q === 'block') {
      if (req.blockers.includes(id)) {
        if (UI.sel.blk[id]) { delete UI.sel.blk[id]; UI.sel.cur = null; }
        else UI.sel.cur = UI.sel.cur === id ? null : id;
        render(); return;
      }
      if (req.attackers.includes(id) && UI.sel.cur) { UI.sel.blk[UI.sel.cur] = id; UI.sel.cur = null; render(); }
      return;
    }
  }
  if (seat) {
    const pid = +seat.dataset.seat;
    if (req.q === 'pick') { const o = req.options.find(o => o.player === pid); if (o) togglePick(o.id); return; }
    if (req.q === 'attack' && opps(S, req.pid).includes(pid)) { UI.sel.tgt = pid; render(); }
  }
});
function onBtn(b, v) {
  const S = UI.S, req = UI.req;
  switch (b) {
    case 'speed': UI.speed = UI.speed === 1 ? 0.35 : UI.speed === 0.35 ? 1.7 : 1; savePrefs(); render(); return;
    case 'react': UI.askReact = !UI.askReact; savePrefs(); toast(UI.askReact ? 'A játék rákérdez a Reakciókra az ellenfél körében.' : 'Reakció-kérdések kikapcsolva (az ellenfél körében automatikus passz).'); render(); return;
    case 'help': return showHelp();
    case 'new': if (S.over || confirm('Biztosan új játékot kezdesz? A mostani játszma elvész.')) { UI.gameId++; UI.resolve = null; renderSetup(); } return;
    case 'over': return showGameOver();
  }
  if (!req) return;
  switch (b) {
    case 'next': return answer({ type: 'next' });
    case 'pass': return answer({ type: 'pass' });
    case 'expose': return answer({ type: 'expose' });
    case 'tgt': UI.sel.tgt = +v; for (const a in UI.sel.att) UI.sel.att[a] = +v; render(); return;
    case 'allatt': for (const a of req.elig) UI.sel.att[a] = UI.sel.att[a] != null ? UI.sel.att[a] : UI.sel.tgt; render(); return;
    case 'noatt': return answer([]);
    case 'doatt': return answer(Object.entries(UI.sel.att).map(([a, t]) => ({ a, t })));
    case 'noblk': return answer([]);
    case 'doblk': return answer(Object.entries(UI.sel.blk).map(([b2, a]) => ({ b: b2, a })));
    case 'opt': return togglePick(v);
    case 'pickok': return answer([...UI.sel.pick]);
    case 'cancel': return answer(null);
  }
}
document.addEventListener('keydown', e => {
  if (!$('#game') || !UI.req) return;
  if (e.key === 'Enter' && !e.target.closest('input')) { const b = document.querySelector('.arena .btn.pri:not(:disabled)') || document.querySelector('#modal .btn.pri:not(:disabled)'); if (b) { e.preventDefault(); b.click(); } }
  if (e.key === 'Escape') { closeMenu(); if (UI.req.q === 'block') { UI.sel.cur = null; render(); } }
});

/* ── nagyító ──────────────────────────────────────────────────────── */
document.addEventListener('mouseover', e => {
  const z = $('#zoom');
  if (!z) return;
  const el = e.target.closest('[data-cid],[data-zoom-name]');
  if (!el || el.closest('#spot') || el.closest('.mcards')) { z.classList.remove('on'); return; }
  const S = UI.S;
  let name, info = '';
  if (el.dataset.cid && S && S.cards[el.dataset.cid]) {
    const id = el.dataset.cid, c = S.cards[id];
    name = c.name;
    const d = DEF[name];
    if (c.zone === 'play') {
      const rows = [];
      if (d.t === 'Szereplő' || d.t === 'Jelző') {
        rows.push(`Most: <b>${power(S, id)}/${tough(S, id)}</b>${c.dmg ? ` · sebzés: <b>${c.dmg}</b>` : ''}${c.symp ? ` · Szimpátia: <b>${c.symp}</b>` : ''}`);
        const k = allKW(S, id); if (k.length) rows.push('Kulcsszavak: ' + k.join(', '));
        if (c.fresh && !hasKW(S, id, 'Lendület')) rows.push('Friss: ebben a körben nem támadhat, ↷ képességét sem használhatja.');
      }
      if (c.ctrl != null) rows.push(`Irányítja: ${esc(S.players[c.ctrl].name)}`);
      if (c.tapped) rows.push('Kimerítve.');
      info = rows.map(r => `<div>${r}</div>`).join('');
    } else if (c.zone === 'hand' && d.t !== 'Bázis' && me() >= 0) info = `<div>Költség most: ${costObjHTML(costOf(S, me(), name, 'play'))}</div>`;
  } else name = el.dataset.zoomName;
  if (!name || !DEF[name]) { z.classList.remove('on'); return; }
  if (z.dataset.name !== name + info) { z.innerHTML = cardFace(name) + (info ? `<div class="zinfo">${info}</div>` : ''); z.dataset.name = name + info; }
  const r = el.getBoundingClientRect();
  const W = 270, H = z.offsetHeight || 400;
  if (el.dataset.hand && r.top - H - 40 > 8) {
    z.style.left = Math.max(8, Math.min(window.innerWidth - W - 8, r.left + r.width / 2 - W / 2)) + 'px';
    z.style.top = (r.top - H - 40) + 'px';
    z.classList.add('on');
    return;
  }
  let x = r.right + 14;
  if (x + W > window.innerWidth - 8) x = r.left - W - 14;
  if (x < 8) x = 8;
  let y = r.top + r.height / 2 - H / 2;
  y = Math.max(8, Math.min(window.innerHeight - H - 8, y));
  z.style.left = x + 'px'; z.style.top = y + 'px';
  z.classList.add('on');
});

/* ── súgó, eredmény ───────────────────────────────────────────────── */
function showHelp() {
  const m = $('#modal');
  const KW = [
    ['Csere', 'Minden Bázison: fizess 1 tetszőleges erőforrást, dobd el a Bázist a kezedből, és húzz egy lapot.'],
    ['Lendület', 'A játékba lépése körében is támadhat, és használhatja ↷ képességét.'],
    ['Mentelmi jog', 'Ellenfeleid Akciói és képességei nem célozhatják. A Kegyelmi ügy Esemény alatt nem hat.'],
    ['Propaganda', 'Csak legalább két szereplő tarthatja fel együtt.'],
    ['Oknyomozó', 'Ha sebzést okoz egy szereplőnek, az a Süllyesztőbe kerül.'],
    ['Kerítés', 'Nem támadhat (de feltarthat).'],
    ['Radikális', 'Ha egyedül támad, +1/+0-t kap.'],
    ['Botrány N', 'Amikor játékba lép, kapsz N Botrányt.'],
    ['Leleplezés', 'Botrányt veszel el egy ellenféltől; minden elvett Botrány után 1 Támogatottságot veszít.'],
    ['Kétharmad', 'Feltétel: legalább két Intézményed van (a Hírfolyam-intézmények is számítanak).'],
    ['Összefogás', 'Feltétel: legalább három különböző pártú szereplőd van. A Független is párt, Schiffer nem számít.'],
    ['Disszidens', '1-gyel olcsóbb, ha bármely ellenfelednek van Intézménye.'],
    ['Mozgalom', 'Valahányszor Bázist teszel le, ez a szereplő kap egy Szimpátia jelzőt (legfeljebb 3-ig).'],
    ['Szakadás', 'Amikor a Süllyesztőbe kerül, létrejön egy 1/1-es Szakadár jelző.'],
    ['◆ Közszereplő', 'Csak jelölés: valós személy. Nincs szabályhatása.'],
  ];
  m.dataset.kind = 'help';
  m.innerHTML = `<div class="mbox help" style="max-width:820px"><h3>Gyorsreferencia</h3>
    <p class="mp">A teljes szabálykönyv: <a href="../Kétharmad.html" target="_blank" style="color:var(--gold)">Kétharmad.html</a></p>
    <h4>A köröd</h4><ol>
      <li><b>Ébredés</b> — visszafordítod a lapjaidat; ha a kezdő jön, új forduló: felfordul egy Esemény, és a bal szélső Hírfolyam-lap cserélődik.</li>
      <li><b>Húzás</b> — húzol egy lapot (a kezdő az első körében nem); 6+ Botránynál −1 Támogatottság. Üres pakli: −2 Támogatottság.</li>
      <li><b>Akció</b> — bármilyen sorrendben: 1 Bázis, tetszőleges lapok és képességek, 1 Toborzás, 1 Leleplezés, Csere, és legfeljebb egy <b>Kampány</b> (támadás, feltartás, Reakciók, sebzés).</li>
      <li><b>Zárás</b> — kör végi hatások, a sebzés törlődik; kézlimit 7.</li></ol>
    <p>A <b>kör</b> egy játékos sorra kerülése, a <b>forduló</b> az, amíg mindenki sorra kerül. Az Események egy fordulóig tartanak. Kezdés: 7 lap, mulligan (újrahúzás, majd annyi lap alulra, ahányszor húztál); két játékosnál a második 25 Támogatottsággal kezd.</p>
    <h4>Fizetés</h4><p>A játék automatikusan meríti ki a Bázisaidat (a botrányt okozó forrásokat, pl. Mészárost, csak rákérdezés után). Kézzel is meríthetsz: kattints a Bázisra vagy a forrásként használható lapra; a kapott erőforrás a kör végéig megmarad.</p>
    <h4>Győzelem</h4><p>Nincs körlimit: az utolsó talpon maradt játékos nyer. Ha egyszerre esne ki mindenki, az nyer, akinek a köre van. Többjátékosnál a kiütésért +5 Támogatottság jár (Szavazóátvétel).</p>
    <h4>Kulcsszavak</h4><table>${KW.map(k => `<tr><td>${k[0]}</td><td>${k[1]}</td></tr>`).join('')}</table>
    <h4>Kezelés</h4><p>Lapra mutatva nagyítás. Arany keret: most kijátszható / használható. Feltartásnál előbb a saját szereplődre, aztán a támadóra kattints. Enter: elsődleges gomb.</p>
    <div class="mbtns"><button class="btn pri" data-close="1">Bezárás</button></div></div>`;
  m.classList.add('on');
  m.onclick = e => { if (e.target === m || e.target.closest('[data-close]')) { closeModal(); m.onclick = null; renderModalForReq(); } };
}
function showGameOver() {
  const S = UI.S, m = $('#modal');
  if (!S || !S.over) return;
  const w = S.winner != null ? S.players[S.winner] : null;
  const mine = me();
  const rows = S.players.slice().sort((a, b) => (b.out ? -999 : b.support - b.scandal) - (a.out ? -999 : a.support - a.scandal)).map(p => `<tr class="${w && p.id === w.id ? 'win' : ''}">
      <td>${esc(p.name)}${p.human ? '' : ` <span class="lvl ${p.ai}">${AI_LEVELS[p.ai]}</span>`}</td><td>${FACTION_NAME[p.faction]}</td>
      <td class="n">${p.out ? '—' : p.support}</td><td class="n">${p.out ? '—' : p.scandal}</td><td class="n">${p.out ? 'kiesett' : p.support - p.scandal}</td></tr>`).join('');
  const title = w ? (mine >= 0 ? (w.id === mine ? 'Megszerezted a kétharmadot!' : `${w.name} nyert`) : `${w.name} nyert`) : 'Döntetlen';
  m.dataset.kind = 'over';
  m.innerHTML = `<div class="mbox" style="max-width:640px"><h3 style="color:${w ? `var(--${w.faction.toLowerCase()})` : 'inherit'}">${esc(title)}</h3>
    <p class="mp">${S.endReason === 'ko' ? 'Az utolsó talpon maradt játékos nyert.' : 'A játszma elhúzódott; a Támogatottság − Botrány döntött.'} ${S.round}. forduló.</p>
    <table class="score-t"><tr><th>Játékos</th><th>Frakció</th><th>Támog.</th><th>Botrány</th><th>Pont</th></tr>${rows}</table>
    <div class="mbtns"><button class="btn" data-go="close">Tábla megtekintése</button><button class="btn" data-go="setup">Új beállítás</button><button class="btn pri" data-go="again">Visszavágó</button></div></div>`;
  m.classList.add('on');
  m.onclick = e => {
    const g = e.target.closest('[data-go]');
    if (!g) return;
    m.onclick = null; closeModal();
    if (g.dataset.go === 'setup') { UI.gameId++; renderSetup(); }
    else if (g.dataset.go === 'again') startGame();
  };
}

renderSetup();
