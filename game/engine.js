'use strict';
/* ════════════════════════════════════════════════════════════════════
   KÉTHARMAD — szabálymotor
   A motor generátorokra épül: minden döntésnél `yield {q:...}` kérést ad
   ki, amire a vezérlő (ember-UI vagy gépi játékos) válaszol. Így ugyanaz
   a kód fut a valódi játékban és a gépi játékos szimulációiban.
   ════════════════════════════════════════════════════════════════════ */

const DEF = {};
for (const c of CARDS) DEF[c.n] = c;

const FACTIONS = ['NER', 'OSZ', 'TIS', 'RAD'];
const FACTION_NAME = { NER: 'NER', OSZ: 'Összefogás', TIS: 'Tisza', RAD: 'Radikálisok', SAJ: 'Hírfolyam' };

const KWS = {
  'Orbán Viktor': ['Mentelmi jog'], 'Rogán Antal': ['Propaganda'], 'Novák Katalin': ['Mentelmi jog'],
  'Lázár János': ['Lendület'], 'Magyar Péter': ['Disszidens', 'Mozgalom'], 'Orbán Anita': ['Disszidens'],
  'Vitézy Dávid': ['Disszidens'], 'Ruszin-Szendi Romulusz': ['Disszidens'], 'Kiábrándult szavazó': ['Disszidens'],
  'Tisza-szigetes önkéntes': ['Mozgalom'], 'Hadházy Ákos': ['Oknyomozó'], 'Pethő András': ['Oknyomozó'],
  'Toroczkai László': ['Szakadás'], 'Volner János': ['Szakadás'], 'Sneider Tamás': ['Radikális', 'Lendület'],
  'Dúró Dóra': ['Lendület'], 'Nemzeti radikális aktivista': ['Radikális'], 'Határvadász': ['Kerítés'],
  'Kerítés': ['Kerítés'], 'Bayer Zsolt': ['Propaganda'],
};
const SCANDAL_ETB = { 'Tiborcz István': 1, 'KESMA': 1, 'Gyurcsány Ferenc': 2, 'Dúró Dóra': 1 };
const PARTIES = ['Fidesz', 'DK', 'Párbeszéd', 'Független', 'Momentum', 'LMP', 'MSZP', 'Együtt', 'Tisza', 'Jobbik', 'Mi Hazánk'];
const MANA = {
  'Mészáros Lőrinc': { opts: [['F', 'F']], dirty: 1 },
  'Matolcsy György': { opts: [['A', 'A']], dirty: 1 },
  'Kapitány István': { opts: [['F'], ['M']], dirty: 0 },
  'Hír TV': { opts: [['M']], dirty: 0 },
  'TV2': { opts: [['M', 'M']], dirty: 1 },
};

/* ── apró segédek ───────────────────────────────────────────────────── */
const isCharD = d => d.t === 'Szereplő' || d.t === 'Jelző';
const isActionD = d => d.t === 'Lépés' || d.t === 'Reakció';
function parseCost(c) {
  const m = /^(\d+)?([FMU]*)$/.exec(c || '');
  return { g: m && m[1] ? +m[1] : 0, s: m ? [...(m[2] || '')] : [] };
}
function printedCost(name) { const c = parseCost(DEF[name].c); return c.g + c.s.length; }
function partyOf(name) {
  if (name === 'Schiffer András') return null;
  const d = DEF[name];
  if (!d || d.f === 'SAJ' || d.t === 'Jelző') return null;
  for (const part of d.s.split('·').map(x => x.trim())) if (PARTIES.includes(part)) return part;
  return null;
}
function rnd(S) {
  let t = S.seed = (S.seed + 0x6D2B79F5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function shuffle(S, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd(S) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const P = (S, pid) => S.players[pid];
const CD = (S, id) => S.cards[id];
const DD = (S, id) => DEF[S.cards[id].name];
function opps(S, pid) { return S.players.filter(p => !p.out && p.id !== pid).map(p => p.id); }
function aliveIds(S) { return S.players.filter(p => !p.out).map(p => p.id); }
function inPlay(S, pid, f) {
  return S.play.filter(id => { const c = S.cards[id]; return (pid == null || c.ctrl === pid) && (!f || f(c, DEF[c.name])); });
}
const chars = (S, pid) => inPlay(S, pid, (c, d) => isCharD(d));
const insts = (S, pid) => inPlay(S, pid, (c, d) => d.t === 'Intézmény');
const basesOf = (S, pid) => inPlay(S, pid, (c, d) => d.t === 'Bázis');
function instActive(S, id) { const c = S.cards[id]; return c.zone === 'play' && c.supp === null; }
function has(S, pid, name) { return inPlay(S, pid, c => c.name === name).some(id => instActive(S, id)); }
function hasChar(S, pid, name) { return inPlay(S, pid, c => c.name === name).length > 0; }
function parties(S, pid) {
  const set = new Set();
  for (const id of chars(S, pid)) { const p = partyOf(S.cards[id].name); if (p) set.add(p); }
  return set.size;
}
function threshold(S, pid) { return opps(S, pid).some(o => has(S, o, 'Átlátszó')) ? 4 : 6; }
function oppScandal(S, pid) { return opps(S, pid).reduce((a, o) => a + P(S, o).scandal, 0); }

function log(S, txt, cls) { if (!S.sim) S.log.push({ t: txt, c: cls || '', n: S.turnNo }); }
function ev(S, e) { if (!S.sim) S.events.push(e); }
function nm(S, pid) { return P(S, pid).name; }

/* ── kulcsszavak, statisztikák ──────────────────────────────────────── */
function hasKW(S, id, kw) {
  const c = S.cards[id];
  if (kw === 'Mentelmi jog' && S.era === 'Kegyelmi ügy') return false;
  if ((KWS[c.name] || []).includes(kw)) return true;
  if (c.kw.includes(kw)) return true;
  if (c.temp.some(t => t.kw && t.kw.includes(kw))) return true;
  if (c.name === 'Magyar Péter' && c.symp >= 3 && (kw === 'Propaganda' || kw === 'Lendület')) return true;
  if (c.name === 'Schiffer András' && kw === 'Mentelmi jog' && c.zone === 'play' && chars(S, c.ctrl).length === 1) return true;
  if (c.name === 'Vona Gábor' && c.mode === 'A' && (kw === 'Radikális' || kw === 'Lendület')) return true;
  return false;
}
function allKW(S, id) {
  return ['Lendület', 'Propaganda', 'Mentelmi jog', 'Oknyomozó', 'Kerítés', 'Radikális', 'Disszidens', 'Mozgalom', 'Szakadás'].filter(k => hasKW(S, id, k));
}
function statMods(S, id, noTemp) {
  const c = S.cards[id], d = DEF[c.name];
  let p = 0, h = 0;
  p += c.symp; h += c.symp;
  if (c.zone !== 'play') return { p, h };
  const ctrl = c.ctrl;
  if (c.name !== 'Orbán Viktor' && hasChar(S, ctrl, 'Orbán Viktor') && insts(S, ctrl).length >= 2) { p++; h++; }
  if (c.name === 'Márki-Zay Péter' && parties(S, ctrl) >= 3) { p += 2; h += 2; }
  if (c.name === 'Schiffer András' && chars(S, ctrl).length === 1) { p++; h++; }
  if (c.name === 'Ruszin-Szendi Romulusz' && !c.att) h += 2;
  if (c.name === 'Vona Gábor' && c.mode === 'B') h += 2;
  if (has(S, ctrl, 'Közös lista') && parties(S, ctrl) >= 3) { p++; h++; }
  if (c.att && hasKW(S, id, 'Radikális') && S.combat && S.combat.att.filter(x => S.cards[x.a].ctrl === ctrl && S.cards[x.a].att).length === 1) p += 1;
  if (S.era === 'Fülkeforradalom' || S.era === 'Választási hajrá') p++;
  if (S.era === 'Kerítés a déli határon' && c.blk) h++;
  if (!noTemp) for (const t of c.temp) { p += t.p || 0; h += t.h || 0; }
  return { p, h };
}
function power(S, id, noTemp) { const d = DD(S, id); return (d.p || 0) + statMods(S, id, noTemp).p; }
function tough(S, id, noTemp) { const d = DD(S, id); return (d.h || 0) + statMods(S, id, noTemp).h; }
function canTapChar(S, id) { const c = S.cards[id]; return !c.fresh || hasKW(S, id, 'Lendület'); }
function targetable(S, actor, id) {
  const c = S.cards[id];
  if (c.zone !== 'play') return false;
  if (c.ctrl !== actor && isCharD(DEF[c.name]) && hasKW(S, id, 'Mentelmi jog')) return false;
  return true;
}

/* ── költségek ─────────────────────────────────────────────────────── */
function costOf(S, pid, name, mode) {
  const d = DEF[name], pc = parseCost(d.c);
  let g = pc.g; const s = pc.s.slice();
  if (d.t !== 'Bázis') {
    if (S.era === 'Alaptörvény' && d.t === 'Intézmény') g--;
    if (S.era === 'Háború és infláció') g++;
    if ((KWS[name] || []).includes('Disszidens')) {
      if (opps(S, pid).some(o => insts(S, o).length)) g--;
      if (S.era === 'Új kihívó') g -= 2;
    }
    if (mode === 'recruit' && S.era === 'Index-ügy') g--;
    if (isActionD(d) && has(S, pid, 'Index')) g--;
  }
  g = Math.max(0, g);
  if (mode === 'recruit' && g + s.length < 1) g = 1;
  return { g, s };
}
function exposeCost(S, pid) {
  let g = 1;
  if (S.era === 'Illiberális fordulat') g++;
  if (S.era === 'Választási hajrá') g--;
  if (has(S, pid, 'Telex')) g--;
  return { g: Math.max(0, g), s: ['M'] };
}

/* ── erőforrások és fizetés ─────────────────────────────────────────── */
function manaOptions(S, id) {
  const c = S.cards[id], d = DEF[c.name];
  if (d.t === 'Bázis') {
    let opts;
    switch (c.name) {
      case 'Uniós forrás': opts = [['F'], ['M']]; break;
      case 'Békemenet': opts = [['U'], ['F']]; break;
      case 'Vidéki fórum': opts = [['U'], ['M']]; break;
      case 'Közös jelölt körzete': opts = parties(S, c.ctrl) >= 3 ? [['A']] : [['U']]; break;
      default: opts = [[{ 'Forint': 'F', 'Média': 'M', 'Utca': 'U' }[d.s]]];
    }
    const kesma = has(S, c.ctrl, 'KESMA'), rab = S.era === 'Rabszolgatörvény';
    return opts.map(o => (o.length === 1 && o[0] === 'M' && kesma) ? ['M', 'M'] : (o.length === 1 && o[0] === 'U' && rab) ? ['U', 'U'] : o);
  }
  const m = MANA[c.name];
  if (!m) return null;
  if (d.t === 'Intézmény' && c.supp !== null) return null;
  return m.opts;
}
function sourcesOf(S, pid, dirtyOK) {
  const out = [];
  for (const id of S.play) {
    const c = S.cards[id];
    if (c.ctrl !== pid || c.tapped) continue;
    const opts = manaOptions(S, id);
    if (!opts) continue;
    const d = DEF[c.name];
    if (isCharD(d) && !canTapChar(S, id)) continue;
    const dirty = (MANA[c.name] && MANA[c.name].dirty) || 0;
    if (dirty && !dirtyOK) continue;
    out.push({ id, opts, dirty, kind: d.t === 'Bázis' ? (opts.length > 1 || opts[0][0] === 'A' ? 1 : 0) : (isCharD(d) ? 3 : 2) });
  }
  return out;
}
function fits(units, cost) {
  const cnt = { F: 0, M: 0, U: 0, A: 0 };
  for (const u of units) cnt[u]++;
  const need = { F: 0, M: 0, U: 0 };
  for (const x of cost.s) need[x]++;
  let a = cnt.A;
  for (const k of ['F', 'M', 'U']) {
    const use = Math.min(cnt[k], need[k]);
    cnt[k] -= use; need[k] -= use;
    if (need[k] > a) return false;
    a -= need[k];
  }
  return cnt.F + cnt.M + cnt.U + a >= cost.g;
}
function bestCombo(pool, srcs, cost) {
  const idx = new Array(srcs.length).fill(0);
  for (let guard = 0; guard < 4096; guard++) {
    const units = pool.slice();
    srcs.forEach((s, i) => units.push(...s.opts[idx[i]]));
    if (fits(units, cost)) return idx.slice();
    let i = 0;
    while (i < srcs.length) { idx[i]++; if (idx[i] < srcs[i].opts.length) break; idx[i] = 0; i++; }
    if (i === srcs.length) return null;
  }
  return null;
}
function planPay(S, pid, cost, dirtyOK) {
  const pool = P(S, pid).pool;
  if (cost.g === 0 && !cost.s.length) return { taps: [], dirty: false };
  const srcs = sourcesOf(S, pid, dirtyOK);
  if (!bestCombo(pool, srcs, cost)) return null;
  const order = srcs.slice().sort((a, b) => (b.dirty * 10 + b.kind) - (a.dirty * 10 + a.kind));
  let sel = srcs.slice();
  for (const s of order) { const t = sel.filter(x => x !== s); if (bestCombo(pool, t, cost)) sel = t; }
  const combo = bestCombo(pool, sel, cost);
  return { taps: sel.map((s, i) => ({ id: s.id, opt: combo[i] })), dirty: sel.some(s => s.dirty) };
}
function canPay(S, pid, cost) { return !!planPay(S, pid, cost, true); }
function tapForMana(S, pid, id, opt) {
  const c = S.cards[id];
  const opts = manaOptions(S, id);
  if (!opts || c.tapped) return;
  c.tapped = true;
  P(S, pid).pool.push(...opts[Math.min(opt || 0, opts.length - 1)]);
  const m = MANA[c.name];
  if (m && m.dirty) { log(S, `${c.name} kimerítve — +${m.dirty} Botrány.`, 'bad'); gainScandal(S, pid, m.dirty); }
}
function consume(S, pid, cost) {
  const pool = P(S, pid).pool;
  const take = u => { const i = pool.indexOf(u); if (i >= 0) { pool.splice(i, 1); return true; } return false; };
  const rest = [];
  for (const x of cost.s) if (!take(x)) rest.push(x);
  for (const x of rest) take('A');
  for (let i = 0; i < cost.g; i++) {
    const cnt = { F: 0, M: 0, U: 0 };
    pool.forEach(u => { if (u !== 'A') cnt[u]++; });
    const best = ['F', 'M', 'U'].sort((a, b) => cnt[b] - cnt[a])[0];
    if (!(cnt[best] && take(best))) take('A');
  }
}
function* pay(S, pid, cost, confirm = true) {
  let plan = planPay(S, pid, cost, false);
  if (!plan) {
    plan = planPay(S, pid, cost, true);
    if (!plan) return false;
    if (confirm && !P(S, pid).ai) {
      const dirt = plan.taps.filter(t => MANA[S.cards[t.id].name] && MANA[S.cards[t.id].name].dirty).map(t => S.cards[t.id].name).join(', ');
      const r = yield* pick(S, pid, `A fizetéshez ezt is ki kell meríteni: ${dirt} (+Botrány). Folytatod?`, [{ id: 'y', label: 'Igen, fizetek' }, { id: 'n', label: 'Mégse' }]);
      if (!r || r[0] !== 'y') return false;
    }
  }
  for (const t of plan.taps) tapForMana(S, pid, t.id, t.opt);
  consume(S, pid, cost);
  return true;
}

/* ── alapműveletek ─────────────────────────────────────────────────── */
function hatarzar(S, pid) { return opps(S, pid).some(o => has(S, o, 'Határzár')); }
function gainSupport(S, pid, n) {
  if (n <= 0 || P(S, pid).out) return;
  if (hatarzar(S, pid)) { log(S, `Határzár: ${nm(S, pid)} nem kaphat Támogatottságot.`); return; }
  P(S, pid).support += n; ev(S, { type: 'sup', pid, n });
}
function loseSupport(S, pid, n, damage) {
  const p = P(S, pid);
  if (p.out || n <= 0) return;
  if (damage && p.support - n <= 0) {
    const k = inPlay(S, pid, c => c.name === 'Karácsony Gergely')[0];
    if (k) { p.support = 1; log(S, `41 szavazat! ${nm(S, pid)} Támogatottsága 1-en marad, Karácsony Gergely a Süllyesztőbe kerül.`, 'good'); leave(S, k); return; }
  }
  p.support -= n;
  ev(S, { type: 'sup', pid, n: -n });
}
function gainScandal(S, pid, n) {
  if (n <= 0 || P(S, pid).out) return;
  P(S, pid).scandal += n;
  ev(S, { type: 'scan', pid, n });
  for (const o of opps(S, pid)) {
    const q = P(S, o);
    if (has(S, o, '444') && !q.flags.used444) { q.flags.used444 = true; gainSupport(S, o, 1); log(S, `444: ${q.name} +1 Támogatottság.`); }
  }
}
function removeScandal(S, pid, n) {
  if (opps(S, pid).some(o => has(S, o, 'Szavazatszámláló delegáltak'))) { log(S, `Szavazatszámláló delegáltak: ${nm(S, pid)} nem távolíthat el Botrányt.`); return 0; }
  if (hatarzar(S, pid)) { log(S, `Határzár: ${nm(S, pid)} nem távolíthat el Botrányt.`); return 0; }
  const k = Math.min(n, P(S, pid).scandal);
  P(S, pid).scandal -= k;
  if (k) { log(S, `${nm(S, pid)} eltávolít ${k} Botrányt.`); ev(S, { type: 'scan', pid, n: -k }); }
  return k;
}
function draw(S, pid, n) {
  const p = P(S, pid);
  for (let i = 0; i < n; i++) {
    if (p.out) return;
    if (!p.deck.length) { log(S, `${p.name} paklija üres: −2 Támogatottság.`, 'bad'); loseSupport(S, pid, 2, false); continue; }
    const id = p.deck.pop();
    S.cards[id].zone = 'hand';
    p.hand.push(id);
  }
}
function discardFromHand(S, pid, id) {
  const p = P(S, pid);
  const i = p.hand.indexOf(id);
  if (i < 0) return;
  p.hand.splice(i, 1);
  toGrave(S, id);
  log(S, `${p.name} eldobja: ${S.cards[id].name}.`);
}
function toGrave(S, id) {
  const c = S.cards[id];
  if (c.token) { c.zone = 'gone'; return; }
  if (DEF[c.name].f === 'SAJ') { feedBottom(S, id); return; }
  c.zone = 'discard'; c.ctrl = c.owner;
  P(S, c.owner).discard.push(id);
}
function feedBottom(S, id) { const c = S.cards[id]; c.zone = 'feedDeck'; c.ctrl = null; S.feedDeck.unshift(id); }
function bounce(S, id) {
  const c = S.cards[id], i = S.play.indexOf(id);
  if (i < 0) return;
  S.play.splice(i, 1);
  resetCard(c);
  ev(S, { type: 'leave', id, name: c.name });
  if (DEF[c.name].f === 'SAJ') { feedBottom(S, id); return; }
  const o = P(S, c.owner);
  if (o.out) { c.zone = 'gone'; return; }
  c.zone = 'hand'; c.ctrl = c.owner; o.hand.push(id);
}
function resetCard(c) {
  c.tapped = false; c.fresh = false; c.dmg = 0; c.symp = 0; c.temp = []; c.att = false; c.blk = false;
  c.mode = null; c.supp = null; c.kw = []; c.oknyo = false;
}
function leave(S, id) {
  const c = S.cards[id], d = DEF[c.name];
  const i = S.play.indexOf(id);
  if (i < 0) return;
  S.play.splice(i, 1);
  const ctrl = c.ctrl;
  resetCard(c);
  ev(S, { type: 'leave', id, name: c.name });
  toGrave(S, id);
  if (S.combat) for (const x of S.combat.att) x.b = x.b.filter(b => b !== id);
  if (isCharD(d) && !c.token && ctrl != null && !P(S, ctrl).out) {
    if (c.name === 'Vitézy Dávid') { log(S, 'Vitézy Dávid — Újrakezdés: két lap húzása.'); draw(S, ctrl, 2); }
    for (const li of inPlay(S, ctrl, x => x.name === 'Közös lista')) if (instActive(S, li)) { log(S, 'Közös lista — Széthúzás: +1 Botrány.', 'bad'); gainScandal(S, ctrl, 1); }
    if ((KWS[c.name] || []).includes('Szakadás')) { log(S, `${c.name} — Szakadás: létrejön egy Szakadár.`); makeToken(S, ctrl, 'Szakadár', false); }
  }
}
function newCard(S, name, owner) {
  const id = 'c' + (S.nextId++);
  S.cards[id] = { id, name, owner, ctrl: owner, zone: 'deck', tapped: false, fresh: false, dmg: 0, symp: 0, temp: [], token: false, att: false, blk: false, mode: null, supp: null, kw: [], oknyo: false };
  return id;
}
function makeToken(S, pid, name, lendulet) {
  if (inPlay(S, null, c => c.name === name).length >= 4) { log(S, `Nincs több ${name} jelző a dobozban.`); return null; }
  const id = newCard(S, name, pid);
  const c = S.cards[id];
  c.token = true; c.zone = 'play'; c.fresh = true; c.ctrl = pid;
  if (lendulet) c.kw = ['Lendület'];
  S.play.push(id);
  ev(S, { type: 'enter', id, pid });
  return id;
}
function addSymp(S, id, n) {
  const c = S.cards[id];
  if (!c || c.zone !== 'play') return;
  c.symp += n;
  log(S, `${c.name} +${n} Szimpátia.`, 'good');
  ev(S, { type: 'symp', id, n });
}
function addTemp(S, id, t) { const c = S.cards[id]; if (c && c.zone === 'play') c.temp.push(t); }
function dealDamage(S, id, n, okn) {
  const c = S.cards[id];
  if (!c || c.zone !== 'play' || n <= 0) return;
  c.dmg += n;
  if (okn) c.oknyo = true;
  ev(S, { type: 'dmg', id, n });
}
function leleplez(S, actor, target, max) {
  const t = P(S, target);
  const n = Math.min(max, t.scandal);
  t.scandal -= n;
  log(S, `Leleplezés: ${nm(S, actor)} elvesz ${n} Botrányt ${t.name} játékostól (−${n} Támogatottság).`, n ? 'hit' : '');
  ev(S, { type: 'expose', actor, target, n });
  if (n) { ev(S, { type: 'scan', pid: target, n: -n }); loseSupport(S, target, n, false); }
}
function eliminate(S, pid) {
  const p = P(S, pid);
  if (p.out) return;
  p.out = true;
  p.support = Math.min(p.support, 0);
  log(S, `${p.name} kiesett!`, 'big');
  ev(S, { type: 'out', pid });
  for (const id of inPlay(S, pid)) { const i = S.play.indexOf(id); S.play.splice(i, 1); resetCard(S.cards[id]); S.cards[id].zone = 'gone'; }
  if (S.combat) S.combat.att = S.combat.att.filter(x => S.cards[x.a].zone === 'play');
  if (S.players.length >= 3 && S.phase !== 'setup' && S.turn !== pid && !P(S, S.turn).out) {
    log(S, `Szavazóátvétel: ${nm(S, S.turn)} +5 Támogatottság.`, 'good');
    gainSupport(S, S.turn, 5);
  }
  const al = aliveIds(S);
  if (al.length <= 1) { S.over = true; S.winner = al.length ? al[0] : null; S.endReason = 'ko'; }
}
function checkState(S) {
  for (let guard = 0; guard < 60; guard++) {
    let again = false;
    for (const id of S.play.slice()) {
      const c = S.cards[id];
      if (c.zone !== 'play' || !isCharD(DEF[c.name])) continue;
      const t = tough(S, id);
      if (t <= 0 || c.dmg >= t || (c.oknyo && c.dmg > 0)) {
        log(S, `${c.name} a Süllyesztőbe kerül.`, 'bad');
        leave(S, id); again = true;
      }
    }
    const dead = S.players.filter(p => !p.out && p.support <= 0);
    if (dead.length && dead.length === aliveIds(S).length) {
      const w = dead.some(p => p.id === S.turn) ? S.turn : dead[0].id;
      for (const p of dead) if (p.id !== w) eliminate(S, p.id);
      if (!S.over) { S.over = true; S.winner = w; S.endReason = 'ko'; log(S, `Egyszerre esne ki mindenki: ${nm(S, w)} nyer, mert az ő köre van.`, 'big'); }
      return;
    }
    for (const p of dead) { eliminate(S, p.id); again = true; }
    if (!again || S.over) return;
  }
}

/* ── választások (pick) ────────────────────────────────────────────── */
// options: [{id, label?, card?, player?, ai}]
function* pick(S, pid, prompt, options, o = {}) {
  const min = o.min != null ? o.min : 1, max = o.max != null ? o.max : 1;
  if (!options.length && !o.force) return [];
  if (!o.force && !o.cancel && options.length === 1 && min === 1 && max === 1 && !o.show) return [options[0].id];
  const r = yield { q: 'pick', pid, prompt, options, min: Math.min(min, options.length), max: Math.min(max, options.length), cancel: !!o.cancel, show: o.show || null, title: o.title || null };
  if (r == null) return o.cancel ? null : [];
  return r;
}
const pOpt = (S, o, ai) => ({ id: 'p' + o, player: o, label: P(S, o).name, ai: ai || 0 });
const cOpt = (S, id, ai) => ({ id, card: id, label: S.cards[id].name, ai: ai || 0 });
function charValue(S, id) {
  const c = S.cards[id], n = c.name;
  let v = Math.max(0, power(S, id, true)) * 1.2 + Math.max(0, tough(S, id, true)) * 0.6;
  const kws = allKW(S, id);
  if (kws.includes('Propaganda')) v += 1;
  if (kws.includes('Oknyomozó')) v += 1.2;
  if (kws.includes('Mentelmi jog')) v += 0.6;
  if (kws.includes('Lendület')) v += 0.3;
  if (ABIL[n] || MANA[n]) v += 1.4;
  if (['Orbán Viktor', 'Kövér László', 'Karácsony Gergely', 'Magyar Péter'].includes(n)) v += 1.5;
  if (c.token) v -= 0.3;
  return v;
}
function instValue(S, id) {
  const n = S.cards[id].name;
  const special = { 'Közmédia': 5, 'Szavazatszámláló delegáltak': 3, 'KESMA': 3, 'Határzár': 3.5, 'Közös lista': 3, 'Fővárosi Közgyűlés': 4, 'Átlátszó': 3.5, 'Megafon': 3.5, 'Index': 3 };
  return (special[n] || 2.5) * (instActive(S, id) ? 1 : 0.6);
}
function handValue(S, pid, id) {
  const n = S.cards[id].name, d = DEF[n];
  if (d.t === 'Bázis') {
    const nb = basesOf(S, pid).length + P(S, pid).hand.filter(h => DEF[S.cards[h].name].t === 'Bázis').length;
    return nb < 6 ? 6 - nb * 0.5 : 1;
  }
  if (isCharD(d)) return (d.p || 0) + (d.h || 0) * 0.6 + printedCost(n) * 0.4 + (d.L ? 1 : 0);
  return printedCost(n) * 1.1 + 1.5;
}
function* chooseOpp(S, pid, prompt, wf) {
  const os = opps(S, pid);
  if (!os.length) return null;
  const r = yield* pick(S, pid, prompt, os.map(o => pOpt(S, o, wf ? wf(o) : P(S, o).support)));
  return r && r.length ? r[0].player != null ? r[0].player : +String(r[0]).slice(1) : null;
}
function* chooseChar(S, pid, prompt, filter, intent, o = {}) {
  const ids = S.play.filter(id => isCharD(DD(S, id)) && targetable(S, pid, id) && (!filter || filter(id)));
  const opts = ids.map(id => {
    const v = charValue(S, id), mine = S.cards[id].ctrl === pid;
    return cOpt(S, id, intent === 'harm' ? (mine ? -v - 5 : v) : (mine ? v : -v - 5));
  });
  const r = yield* pick(S, pid, prompt, opts, o);
  if (r === null) return null;
  return r.length ? r[0] : (o.cancel ? null : undefined);
}
function* oppDiscards(S, pid, src) {
  const o = yield* chooseOpp(S, pid, `${src}: melyik ellenfeled dob el egy lapot?`, x => P(S, x).hand.length * 2 + P(S, x).support * 0.1);
  if (o == null || !P(S, o).hand.length) return;
  const h = P(S, o).hand;
  const r = yield* pick(S, o, `${src}: válassz egy lapot, amit eldobsz.`, h.map(id => cOpt(S, id, -handValue(S, o, id))), { title: 'Eldobás' });
  if (r && r.length) discardFromHand(S, o, r[0]);
}
function* lookTop(S, pid, n, takeFilter, label) {
  const p = P(S, pid);
  const top = p.deck.slice(-n).reverse();
  if (!top.length) return;
  const sel = top.filter(takeFilter);
  const r = yield* pick(S, pid, `${label}: a paklid felső ${top.length} lapja. Válassz egyet a kezedbe, a többi alulra kerül.`,
    sel.map(id => cOpt(S, id, handValue(S, pid, id))), { show: top, force: true, min: sel.length ? 1 : 0, max: sel.length ? 1 : 0, title: label });
  const taken = r && r.length ? r[0] : null;
  for (const id of top) {
    p.deck.splice(p.deck.indexOf(id), 1);
    if (id === taken) { p.hand.push(id); S.cards[id].zone = 'hand'; }
    else p.deck.unshift(id);
  }
  if (taken) log(S, `${p.name} kézbe vesz egy lapot (${label}).`);
}
function* peekTop(S, pid, label) {
  const p = P(S, pid);
  if (!p.deck.length) return;
  const top = p.deck[p.deck.length - 1];
  const keepV = handValue(S, pid, top);
  const r = yield* pick(S, pid, `${label}: a paklid felső lapja. Alulra teszed?`,
    [{ id: 'keep', label: 'Marad felül', ai: keepV }, { id: 'bottom', label: 'Alulra teszem', ai: 3 }], { show: [top], title: label });
  if (r && r[0] === 'bottom') { p.deck.pop(); p.deck.unshift(top); log(S, `${p.name} a felső lapot alulra teszi.`); }
}
function* searchDeck(S, pid, filter, label) {
  const p = P(S, pid);
  const ids = p.deck.filter(filter);
  const r = yield* pick(S, pid, `${label}: válassz a paklidból.`, ids.map(id => cOpt(S, id, handValue(S, pid, id) + (isCharD(DD(S, id)) ? charBaseValue(S.cards[id].name) : 0))), { force: true, min: ids.length ? 1 : 0, max: ids.length ? 1 : 0, title: label });
  const id = r && r.length ? r[0] : null;
  if (id) p.deck.splice(p.deck.indexOf(id), 1);
  shuffle(S, p.deck);
  return id;
}
function charBaseValue(n) { const d = DEF[n]; return (d.p || 0) * 1.2 + (d.h || 0) * 0.6; }

/* ── lapok hatásai ─────────────────────────────────────────────────── */
// etb: function*(S,id,pid)  · start/end: function*(S,id,pid)
// Akciók: can(S,pid) · targets: function*(S,pid) → tg | null · onCast(S,pid,tg) · resolve: function*(S,item)
const FX = {
  'Békemenet': { *etb(S, id, pid) { gainSupport(S, pid, 1); } },
  'Vidéki fórum': {
    *etb(S, id, pid) {
      const t = yield* chooseChar(S, pid, 'Vidéki fórum: melyik szereplőd kap Szimpátia jelzőt?', x => S.cards[x].ctrl === pid, 'help');
      if (t) addSymp(S, t, 1);
    }
  },
  'Tiborcz István': { *etb(S, id, pid) { draw(S, pid, hasChar(S, pid, 'Orbán Viktor') ? 2 : 1); } },
  'Gulyás Gergely': { *etb(S, id, pid) { removeScandal(S, pid, 3); } },
  'Kubatov Gábor': {
    *etb(S, id, pid) {
      const o = yield* chooseOpp(S, pid, 'Kubatov: kinek a kezét nézed meg?', x => P(S, x).hand.length);
      if (o == null) return;
      const h = P(S, o).hand;
      const acts = h.filter(x => isActionD(DD(S, x)));
      const r = yield* pick(S, pid, `${nm(S, o)} keze. Választhatsz egy Akciót, amit eldob.`, acts.map(x => cOpt(S, x, handValue(S, o, x))), { show: h, force: true, min: 0, max: 1, title: 'Kubatov-lista' });
      if (r && r.length) discardFromHand(S, o, r[0]);
    }
  },
  'Lázár János': { *etb(S, id, pid) { yield* oppDiscards(S, pid, 'Lázár János'); } },
  'Dúró Dóra': { *etb(S, id, pid) { yield* oppDiscards(S, pid, 'Dúró Dóra'); } },
  'KESMA': {}, 'Közmédia': {
    *start(S, id, pid) { if (!instActive(S, id)) return; log(S, 'Közmédia: minden ellenfél −1 Támogatottság.'); for (const o of opps(S, pid)) loseSupport(S, o, 1, false); }
  },
  'Simicska Lajos': {
    *start(S, id, pid) {
      if (P(S, pid).scandal < 5) return;
      const os = opps(S, pid);
      if (!os.length) return;
      const to = os.slice().sort((a, b) => P(S, a).scandal - P(S, b).scandal)[0];
      const c = S.cards[id];
      c.ctrl = to; c.fresh = true; c.tapped = false;
      log(S, `G-nap! Simicska Lajos átáll: mostantól ${nm(S, to)} irányítja.`, 'big');
      ev(S, { type: 'steal', id, to });
    }
  },
  'Karácsony Gergely': { *start(S, id, pid) { P(S, pid).pool.push('F'); log(S, 'Karácsony Gergely: +F.'); } },
  'Fővárosi Közgyűlés': { *start(S, id, pid) { if (instActive(S, id)) { gainSupport(S, pid, 1); log(S, 'Fővárosi Közgyűlés: +1 Támogatottság.'); } } },
  'Telex': { *start(S, id, pid) { if (instActive(S, id)) yield* peekTop(S, pid, 'Telex'); } },
  'Gyurcsány Ferenc': { *etb(S, id, pid) { for (const o of opps(S, pid)) draw(S, o, 1); log(S, 'Gyurcsány — Megosztó: minden ellenfél húz egy lapot.'); } },
  'Fekete-Győr András': {
    *etb(S, id, pid) {
      const ids = S.play.filter(x => DD(S, x).t === 'Intézmény' && printedCost(S.cards[x].name) <= 4);
      if (!ids.length) return;
      const r = yield* pick(S, pid, 'NOlimpia: a Süllyesztőbe küldhetsz egy legfeljebb 4 költségű Intézményt.', ids.map(x => cOpt(S, x, S.cards[x].ctrl === pid ? -10 : instValue(S, x))), { min: 0, max: 1, title: 'NOlimpia' });
      if (r && r.length) { log(S, `NOlimpia: ${S.cards[r[0]].name} a Süllyesztőbe kerül.`, 'hit'); leave(S, r[0]); }
    }
  },
  'Bajnai Gordon': {
    *etb(S, id, pid) {
      const b = yield* searchDeck(S, pid, x => DD(S, x).t === 'Bázis', 'Válságkezelő');
      if (b) { P(S, pid).hand.push(b); S.cards[b].zone = 'hand'; }
      gainSupport(S, pid, 2);
    }
  },
  'Előválasztási önkéntes': { *etb(S, id, pid) { yield* peekTop(S, pid, 'Előválasztási önkéntes'); } },
  'Tarr Zoltán': {
    *etb(S, id, pid) {
      const t = yield* chooseChar(S, pid, 'Tarr Zoltán: egy másik szereplőd kap egy Szimpátia jelzőt.', x => S.cards[x].ctrl === pid && x !== id, 'help');
      if (t) addSymp(S, t, 1);
    }
  },
  'Orbán Anita': {
    *etb(S, id, pid) {
      const o = yield* chooseOpp(S, pid, 'Orbán Anita: kinek a kezét nézed meg?', x => P(S, x).hand.length);
      if (o != null) yield* pick(S, pid, `${nm(S, o)} keze.`, [], { show: P(S, o).hand.slice(), force: true, min: 0, max: 0, title: 'Betekintés' });
      draw(S, pid, 1);
    }
  },
  'Lannert Judit': { *etb(S, id, pid) { draw(S, pid, 1); } },
  'Kiábrándult szavazó': { *etb(S, id, pid) { if (oppScandal(S, pid) >= 3) addSymp(S, id, 2); } },
  'Vona Gábor': {
    *etb(S, id, pid) {
      const r = yield* pick(S, pid, 'Néppártosodás: válassz!', [
        { id: 'A', label: 'Radikális és Lendület', ai: 2 },
        { id: 'B', label: '+0/+2, köröd végén +1 Támogatottság', ai: 2.2 }], { title: 'Vona Gábor' });
      S.cards[id].mode = (r && r[0]) || 'B';
    },
    *end(S, id, pid) { if (S.cards[id].mode === 'B') { gainSupport(S, pid, 1); log(S, 'Vona Gábor: +1 Támogatottság.'); } }
  },
  'Toroczkai László': { *etb(S, id, pid) { makeToken(S, pid, 'Kerítés', false); log(S, 'Toroczkai: létrejön egy Kerítés.'); } },
  'Jakab Péter': {
    *etb(S, id, pid) {
      const o = yield* chooseOpp(S, pid, 'Jakab Péter: melyik ellenfeled kap 3 Botrányt?', x => P(S, x).scandal + (has(S, x, 'Átlátszó') ? 0 : 1));
      if (o != null) { gainScandal(S, o, 3); log(S, `${nm(S, o)} +3 Botrány (Jakab Péter).`, 'hit'); }
    }
  },
  'Donáth Anna': {
    *etb(S, id, pid) {
      const ids = S.play.filter(x => DD(S, x).t === 'Intézmény');
      if (!ids.length) return;
      const r = yield* pick(S, pid, 'Brüsszel: melyik Intézmény kerül vissza a tulajdonosa kezébe?', ids.map(x => cOpt(S, x, S.cards[x].ctrl === pid ? -10 : instValue(S, x))), { title: 'Brüsszel' });
      if (r && r.length) { log(S, `Brüsszel: ${S.cards[r[0]].name} visszakerül a tulajdonosához.`, 'hit'); bounce(S, r[0]); }
    }
  },
  'Index': { *etb(S, id, pid) { draw(S, pid, 1); } },
  'Gyöngyösi Márton': { *etb(S, id, pid) { yield* lookTop(S, pid, 3, () => true, 'Gyöngyösi Márton'); } },
  'Vidéki polgármester': { *etb(S, id, pid) { gainSupport(S, pid, 2); } },
  'Partizán': { *etb(S, id, pid) { draw(S, pid, 2); } },
  'Pethő András': {
    *etb(S, id, pid) {
      const o = yield* chooseOpp(S, pid, 'Pethő András: kit leplezel le?', x => P(S, x).scandal);
      if (o != null) leleplez(S, pid, o, 2);
    }
  },
  'Átlátszó': { *etb(S, id, pid) { for (const o of opps(S, pid)) gainScandal(S, o, 1); log(S, 'Átlátszó: minden ellenfél +1 Botrány.'); } },
  'Bayer Zsolt': {
    *etb(S, id, pid) {
      const o = yield* chooseOpp(S, pid, 'Bayer Zsolt: melyik ellenfeled veszít 1 Támogatottságot?', x => 30 - P(S, x).support);
      if (o != null) loseSupport(S, o, 1, false);
    }
  },
  'Origo': {
    *end(S, id, pid) {
      if (!instActive(S, id)) return;
      const me = insts(S, pid).length;
      if (opps(S, pid).every(o => insts(S, o).length < me)) { gainSupport(S, pid, 1); log(S, 'Origo: +1 Támogatottság.'); }
    }
  },

  /* ── Akciók ── */
  'Rezsicsökkentés': { *resolve(S, it) { gainSupport(S, it.pid, 5); log(S, `${nm(S, it.pid)} +5 Támogatottság.`, 'good'); } },
  'Plakátkampány': {
    *resolve(S, it) { for (const o of opps(S, it.pid)) for (const id of chars(S, o)) addTemp(S, id, { p: -1, h: -1 }); log(S, 'Plakátkampány: az ellenfelek szereplői −1/−1.'); }
  },
  'Alaptörvény-módosítás': {
    can: (S, pid) => S.stack.some(x => !x.countered),
    *targets(S, pid) {
      const items = S.stack.filter(x => !x.countered);
      const r = yield* pick(S, pid, 'Melyik Akciót semlegesíted?', items.map(x => ({ id: 'st' + x.uid, card: x.cid, label: S.cards[x.cid].name, ai: x.pid === pid ? -9 : 1 })), { cancel: true });
      if (!r || !r.length) return null;
      return { uid: +String(r[0]).slice(2) };
    },
    *resolve(S, it) {
      const t = S.stack.find(x => x.uid === it.tg.uid);
      if (t) { t.countered = true; log(S, `${S.cards[t.cid].name} semlegesítve!`, 'hit'); }
      gainScandal(S, it.pid, 1);
    }
  },
  'Obstrukció': {
    can: (S, pid) => S.stack.some(x => !x.countered && DD(S, x.cid).t === 'Lépés' && printedCost(S.cards[x.cid].name) <= 3),
    *targets(S, pid) {
      const items = S.stack.filter(x => !x.countered && DD(S, x.cid).t === 'Lépés' && printedCost(S.cards[x.cid].name) <= 3);
      const r = yield* pick(S, pid, 'Melyik Lépést semlegesíted?', items.map(x => ({ id: 'st' + x.uid, card: x.cid, label: S.cards[x.cid].name, ai: x.pid === pid ? -9 : 1 })), { cancel: true });
      if (!r || !r.length) return null;
      return { uid: +String(r[0]).slice(2) };
    },
    *resolve(S, it) { const t = S.stack.find(x => x.uid === it.tg.uid); if (t) { t.countered = true; log(S, `${S.cards[t.cid].name} semlegesítve!`, 'hit'); } }
  },
  'Bűnbak': {
    can: (S, pid) => chars(S, pid).length > 0,
    *targets(S, pid) {
      const r = yield* pick(S, pid, 'Bűnbak: melyik szereplődet áldozod fel?', chars(S, pid).map(id => cOpt(S, id, -charValue(S, id))), { cancel: true });
      return r && r.length ? { sac: r[0] } : null;
    },
    onCast(S, pid, tg) { if (S.cards[tg.sac].zone === 'play') { log(S, `${S.cards[tg.sac].name} feláldozva.`); leave(S, tg.sac); } },
    *resolve(S, it) { removeScandal(S, it.pid, 3); draw(S, it.pid, 2); }
  },
  'Kiszivárgott hangfelvétel': {
    *targets(S, pid) { const o = yield* chooseOpp(S, pid, 'Kiszivárgott hangfelvétel: kit leplezel le?', x => P(S, x).scandal); return o == null ? null : { o }; },
    *resolve(S, it) { if (!P(S, it.tg.o).out) leleplez(S, it.pid, it.tg.o, 2); }
  },
  'Bizalmatlansági indítvány': {
    can: (S, pid) => S.play.some(id => isCharD(DD(S, id)) && targetable(S, pid, id) && tough(S, id) <= 4),
    *targets(S, pid) { const t = yield* chooseChar(S, pid, 'Bizalmatlansági indítvány: célpont (Hitelesség ≤ 4)?', id => tough(S, id) <= 4, 'harm', { cancel: true }); return t ? { c: t } : null; },
    *resolve(S, it) {
      const id = it.tg.c;
      if (targetable(S, it.pid, id) && tough(S, id) <= 4) { log(S, `${S.cards[id].name} megbukik.`, 'hit'); leave(S, id); }
      else log(S, 'A Bizalmatlansági indítvány hatástalan.');
    }
  },
  'Előválasztás': {
    *resolve(S, it) { yield* lookTop(S, it.pid, 5, id => isCharD(DD(S, id)), 'Előválasztás'); gainSupport(S, it.pid, 1); }
  },
  'Visszalépés a közös jelölt javára': {
    can: (S, pid) => chars(S, pid).length >= 2,
    *targets(S, pid) {
      const r = yield* pick(S, pid, 'Visszalépés: melyik szereplődet áldozod fel?', chars(S, pid).map(id => cOpt(S, id, -charValue(S, id))), { cancel: true });
      if (!r || !r.length) return null;
      const sac = r[0];
      const r2 = yield* pick(S, pid, 'Melyik szereplőd kap két Szimpátia jelzőt?', chars(S, pid).filter(x => x !== sac).map(id => cOpt(S, id, charValue(S, id))), { cancel: true });
      if (!r2 || !r2.length) return null;
      return { sac, c: r2[0] };
    },
    onCast(S, pid, tg) { if (S.cards[tg.sac].zone === 'play') { log(S, `${S.cards[tg.sac].name} visszalép.`); leave(S, tg.sac); } },
    *resolve(S, it) { if (S.cards[it.tg.c].zone === 'play') addSymp(S, it.tg.c, 2); }
  },
  'Az interjú': { *resolve(S, it) { draw(S, it.pid, oppScandal(S, it.pid) >= 3 ? 3 : 2); } },
  'Országjárás': { *resolve(S, it) { for (const id of chars(S, it.pid)) addSymp(S, id, 1); } },
  'Felháborodás': {
    can: (S, pid) => S.play.some(id => isCharD(DD(S, id)) && targetable(S, pid, id)),
    *targets(S, pid) { const t = yield* chooseChar(S, pid, 'Felháborodás: melyik szereplő kap +X/+X-et?', null, 'help', { cancel: true }); return t ? { c: t } : null; },
    *resolve(S, it) {
      if (!targetable(S, it.pid, it.tg.c)) return;
      const x = Math.min(4, oppScandal(S, it.pid));
      addTemp(S, it.tg.c, { p: x, h: x });
      log(S, `${S.cards[it.tg.c].name} +${x}/+${x}.`, 'good');
    }
  },
  'Nagygyűlés': { *resolve(S, it) { for (const id of chars(S, it.pid)) addTemp(S, id, { p: 2, kw: ['Propaganda'] }); log(S, 'Szereplőid +2/+0 és Propaganda.'); } },
  'Mozgósítás': {
    can: (S, pid) => chars(S, pid).length > 0,
    *targets(S, pid) { const t = yield* chooseChar(S, pid, 'Mozgósítás: melyik szereplőd kap két Szimpátia jelzőt?', id => S.cards[id].ctrl === pid, 'help', { cancel: true }); return t ? { c: t } : null; },
    *resolve(S, it) { if (S.cards[it.tg.c].zone === 'play') addSymp(S, it.tg.c, 2); }
  },
  'Utcai demonstráció': {
    *targets(S, pid) {
      const opts = opps(S, pid).map(o => pOpt(S, o, P(S, o).support <= 2 ? 50 : 2));
      for (const id of S.play) if (isCharD(DD(S, id)) && targetable(S, pid, id)) {
        const mine = S.cards[id].ctrl === pid, kills = tough(S, id) - S.cards[id].dmg <= 3;
        opts.push(cOpt(S, id, mine ? -20 : (kills ? charValue(S, id) + 1 : 0)));
      }
      const r = yield* pick(S, pid, 'Utcai demonstráció: 3 sebzés egy szereplőnek, vagy 2 egy ellenfélnek — kinek?', opts, { cancel: true });
      if (!r || !r.length) return null;
      const x = r[0];
      return String(x).startsWith('p') ? { o: +String(x).slice(1) } : { c: x };
    },
    *resolve(S, it) {
      if (it.tg.o != null) { if (!P(S, it.tg.o).out) { log(S, `${nm(S, it.tg.o)} 2 sebzést kap.`, 'hit'); loseSupport(S, it.tg.o, 2, true); } }
      else if (targetable(S, it.pid, it.tg.c)) { dealDamage(S, it.tg.c, 3, false); log(S, `${S.cards[it.tg.c].name} 3 sebzést kap.`, 'hit'); }
    }
  },
  'Pártszakadás': { *resolve(S, it) { makeToken(S, it.pid, 'Szakadár', true); makeToken(S, it.pid, 'Szakadár', true); log(S, 'Két Szakadár jelző Lendülettel.'); } },
  'Néppárti fordulat': {
    can: (S, pid) => S.play.some(id => isCharD(DD(S, id)) && targetable(S, pid, id)),
    *targets(S, pid) { const t = yield* chooseChar(S, pid, 'Néppárti fordulat: melyik szereplő kap +0/+3-at?', null, 'help', { cancel: true }); return t ? { c: t } : null; },
    *resolve(S, it) {
      const id = it.tg.c;
      if (!targetable(S, it.pid, id)) return;
      addTemp(S, id, { h: 3 });
      if (S.cards[id].ctrl === it.pid) { gainSupport(S, it.pid, 2); draw(S, it.pid, 1); }
    }
  },
};

/* ── képességek (↷) ────────────────────────────────────────────────── */
const ABIL = {
  'Rogán Antal': [{
    label: '−2/−0 egy szereplőnek', cost: { g: 0, s: ['M'] }, when: ['main', 'combat'],
    can: (S, id, pid) => S.play.some(x => isCharD(DD(S, x)) && targetable(S, pid, x)),
    *run(S, id, pid) { const t = yield* chooseChar(S, pid, 'Rogán: melyik szereplő kap −2/−0-t?', null, 'harm'); if (t) { addTemp(S, t, { p: -2 }); log(S, `${S.cards[t].name} −2/−0.`); } }
  }],
  'Szijjártó Péter': [{ label: 'Keleti nyitás', when: ['main'], can: (S, id, pid) => P(S, pid).deck.length > 0, *run(S, id, pid) { yield* lookTop(S, pid, 3, () => true, 'Keleti nyitás'); gainScandal(S, pid, 1); } }],
  'Novák Katalin': [{
    label: 'Kegyelem', when: ['main'], can: (S, id, pid) => P(S, pid).discard.some(x => isCharD(DD(S, x))),
    *run(S, id, pid) {
      const p = P(S, pid);
      const ids = p.discard.filter(x => isCharD(DD(S, x)));
      const r = yield* pick(S, pid, 'Kegyelem: melyik szereplőd tér vissza a kezedbe?', ids.map(x => cOpt(S, x, handValue(S, pid, x))), { title: 'Kegyelem' });
      if (r && r.length) { p.discard.splice(p.discard.indexOf(r[0]), 1); p.hand.push(r[0]); S.cards[r[0]].zone = 'hand'; log(S, `${S.cards[r[0]].name} visszatér a kézbe.`); }
      gainScandal(S, pid, 2);
    }
  }],
  'Dobrev Klára': [{ label: 'Árnyékkormány: +1/+0', when: ['main', 'combat'], can: (S, id, pid) => chars(S, pid).length > 1, *run(S, id, pid) { for (const x of chars(S, pid)) if (x !== id) addTemp(S, x, { p: 1 }); log(S, 'Árnyékkormány: a többi szereplő +1/+0.'); } }],
  'Hadházy Ákos': [{ label: 'Leleplezés (1)', when: ['main'], can: (S, id, pid) => opps(S, pid).length > 0, *run(S, id, pid) { const o = yield* chooseOpp(S, pid, 'Hadházy: kit leplezel le?', x => P(S, x).scandal); if (o != null) leleplez(S, pid, o, 1); } }],
  'Botka László': [{
    label: 'Visszalépés', sac: true, when: ['main'], can: () => true,
    *run(S, id, pid) {
      const c = yield* searchDeck(S, pid, x => isCharD(DD(S, x)) && printedCost(S.cards[x].name) <= 4, 'Visszalépés');
      if (c) yield* enterPlay(S, c, pid, false);
    }
  }],
  'Ruff Bálint': [{ label: 'Propagandát ad', when: ['main'], can: (S, id, pid) => chars(S, pid).length > 0, *run(S, id, pid) { const t = yield* chooseChar(S, pid, 'Ruff Bálint: melyik szereplőd kap Propagandát?', x => S.cards[x].ctrl === pid, 'help'); if (t) addTemp(S, t, { kw: ['Propaganda'] }); } }],
  'Hegedűs Zsolt': [{ label: '+1 Támogatottság', when: ['main'], can: () => true, *run(S, id, pid) { gainSupport(S, pid, 1); } }],
  'Határvadász': [{
    label: 'Támadó −1/−0', when: ['combat'], can: (S, id, pid) => !!S.combat && S.combat.att.some(x => S.cards[x.a].zone === 'play' && targetable(S, pid, x.a) && S.cards[x.a].ctrl !== pid),
    *run(S, id, pid) { const t = yield* chooseChar(S, pid, 'Határvadász: melyik támadó kap −1/−0-t?', x => S.cards[x].att && S.cards[x].ctrl !== pid, 'harm'); if (t) addTemp(S, t, { p: -1 }); }
  }],
  'HVG': [{ label: 'Leleplezés (1)', when: ['main'], can: (S, id, pid) => opps(S, pid).length > 0, *run(S, id, pid) { const o = yield* chooseOpp(S, pid, 'HVG: kit leplezel le?', x => P(S, x).scandal); if (o != null) leleplez(S, pid, o, 1); } }],
  'Megafon': [{ label: 'Minden ellenfél −1', cost: { g: 0, s: ['M'] }, when: ['main'], can: () => true, *run(S, id, pid) { for (const o of opps(S, pid)) loseSupport(S, o, 1, false); log(S, 'Megafon: minden ellenfél −1 Támogatottság.'); } }],
};

function abilityUsable(S, pid, id, ai, ctx) {
  const c = S.cards[id];
  const ab = (ABIL[c.name] || [])[ai];
  if (!ab || c.zone !== 'play' || c.ctrl !== pid || c.tapped) return false;
  const d = DEF[c.name];
  if (isCharD(d) && !canTapChar(S, id)) return false;
  if (d.t === 'Intézmény' && c.supp !== null) return false;
  const phase = ctx === 'end' ? 'main' : ctx;
  if (!ab.when.includes(phase)) return false;
  if (phase === 'main' && (S.turn !== pid || S.stack.length)) return false;
  if (ab.cost) {
    // a saját lap kimerítése nem fizethet önmagáért
    c.tapped = true; const ok = canPay(S, pid, ab.cost); c.tapped = false;
    if (!ok) return false;
  }
  return ab.can(S, id, pid);
}
function* useAbility(S, pid, id, ai) {
  const c = S.cards[id], ab = ABIL[c.name][ai];
  c.tapped = true;
  if (ab.cost) { const ok = yield* pay(S, pid, ab.cost); if (!ok) { c.tapped = false; return; } }
  log(S, `${nm(S, pid)}: ${c.name} — ${ab.label}.`);
  ev(S, { type: 'ability', pid, id, name: c.name });
  if (ab.sac) leave(S, id);
  yield* ab.run(S, id, pid);
}

/* ── kijátszás ─────────────────────────────────────────────────────── */
function reactAllowed(S, pid) {
  if (P(S, pid).flags.reacts >= 1 && opps(S, pid).some(o => hasChar(S, o, 'Kövér László'))) return false;
  return true;
}
function* enterPlay(S, id, pid, fromHand) {
  const c = S.cards[id], d = DEF[c.name];
  c.zone = 'play'; c.ctrl = pid;
  resetCard(c);
  if (isCharD(d)) c.fresh = true;
  if (c.name === 'Uniós forrás' || c.name === 'Vidéki fórum') c.tapped = true;
  S.play.push(id);
  ev(S, { type: 'enter', id, pid });
  if (SCANDAL_ETB[c.name]) { gainScandal(S, pid, SCANDAL_ETB[c.name]); log(S, `${c.name}: +${SCANDAL_ETB[c.name]} Botrány.`, 'bad'); }
  if (d.t === 'Bázis') for (const x of chars(S, pid)) if (hasKW(S, x, 'Mozgalom') && S.cards[x].symp < 3) addSymp(S, x, 1);
  if (d.t === 'Intézmény' && fromHand) for (const o of opps(S, pid)) for (const f of inPlay(S, o, q => q.name === 'Fővárosi Közgyűlés')) if (instActive(S, f)) { draw(S, o, 1); log(S, `Fővárosi Közgyűlés: ${nm(S, o)} húz egy lapot.`); }
  const fx = FX[c.name];
  if (fx && fx.etb) yield* fx.etb(S, id, pid);
  checkState(S);
}
function canCast(S, pid, id, ctx) {
  const d = DD(S, id), n = S.cards[id].name;
  const myTurn = S.turn === pid;
  const mainLike = (ctx === 'main' || ctx === 'end') && myTurn && !S.stack.length;
  if (d.t === 'Bázis') return mainLike && !P(S, pid).flags.base;
  if (d.t === 'Szereplő' || d.t === 'Intézmény' || d.t === 'Lépés') {
    if (!mainLike) return false;
  } else if (d.t === 'Reakció') {
    if (!reactAllowed(S, pid)) return false;
    if (ctx === 'stack' && !S.stack.length) return false;
  } else return false;
  const fx = FX[n];
  if (fx && fx.can && !fx.can(S, pid)) return false;
  return canPay(S, pid, costOf(S, pid, n, 'play'));
}
function* castFromHand(S, pid, id) {
  const p = P(S, pid), c = S.cards[id], d = DEF[c.name];
  if (d.t === 'Bázis') {
    p.hand.splice(p.hand.indexOf(id), 1);
    p.flags.base = true;
    log(S, `${p.name} Bázist tesz le: ${c.name}.`);
    yield* enterPlay(S, id, pid, true);
    return;
  }
  const cost = costOf(S, pid, c.name, 'play');
  if (d.t === 'Szereplő' || d.t === 'Intézmény') {
    const ok = yield* pay(S, pid, cost);
    if (!ok) return;
    p.hand.splice(p.hand.indexOf(id), 1);
    log(S, `${p.name} kijátssza: ${c.name}.`, 'play');
    ev(S, { type: 'play', pid, id, name: c.name });
    yield* enterPlay(S, id, pid, true);
    return;
  }
  const fx = FX[c.name] || {};
  let tg = {};
  if (fx.targets) { tg = yield* fx.targets(S, pid); if (tg === null) return; }
  const ok = yield* pay(S, pid, cost);
  if (!ok) return;
  p.hand.splice(p.hand.indexOf(id), 1);
  c.zone = 'stack';
  if (d.t === 'Reakció') p.flags.reacts++;
  log(S, `${p.name} kijátssza: ${c.name}.`, 'play');
  ev(S, { type: 'play', pid, id, name: c.name });
  if (fx.onCast) fx.onCast(S, pid, tg);
  const item = { uid: S.nextUid++, cid: id, pid, tg, countered: false };
  S.stack.push(item);
  yield* respond(S, pid);
  const i = S.stack.indexOf(S.stack.find(x => x.uid === item.uid));
  if (i >= 0) S.stack.splice(i, 1);
  if (!item.countered && !P(S, pid).out && fx.resolve) yield* fx.resolve(S, item);
  toGrave(S, id);
  checkState(S);
}
function* resolveStackSim(S) {
  while (S.stack.length) {
    const it = S.stack.pop();
    const fx = FX[S.cards[it.cid].name] || {};
    if (!it.countered && !P(S, it.pid).out && fx.resolve) yield* fx.resolve(S, it);
    toGrave(S, it.cid);
    checkState(S);
  }
}
function* recruit(S, pid, idx) {
  const id = S.feed[idx];
  if (!id) return;
  const c = S.cards[id], p = P(S, pid);
  const ok = yield* pay(S, pid, costOf(S, pid, c.name, 'recruit'));
  if (!ok) return;
  p.flags.rec = true;
  const nid = feedDraw(S);
  if (nid) S.feed[idx] = nid; else S.feed.splice(idx, 1);
  log(S, `${p.name} toboroz: ${c.name}.`, 'play');
  ev(S, { type: 'play', pid, id, name: c.name, recruit: true });
  yield* enterPlay(S, id, pid, false);
}
function* expose(S, pid) {
  const o = yield* chooseOpp(S, pid, 'Leleplezés: melyik ellenfeledet?', x => P(S, x).scandal * 3 + (P(S, x).scandal ? 0 : -10));
  if (o == null) return;
  const ok = yield* pay(S, pid, exposeCost(S, pid));
  if (!ok) return;
  P(S, pid).flags.exp = true;
  leleplez(S, pid, o, 2);
}
function feedDraw(S) {
  if (!S.feedDeck.length) {
    if (!S.feedDiscard.length) return null;
    S.feedDeck = S.feedDiscard.splice(0);
    S.feedDeck.forEach(id => S.cards[id].zone = 'feedDeck');
    shuffle(S, S.feedDeck);
  }
  const id = S.feedDeck.pop();
  S.cards[id].zone = 'feed';
  return id;
}

function legal(S, pid, ctx) {
  const p = P(S, pid), acts = [];
  if (p.out || S.over) return acts;
  const myTurn = S.turn === pid;
  const mainLike = (ctx === 'main' || ctx === 'end') && myTurn && !S.stack.length;
  const canCycle = mainLike && canPay(S, pid, CYCLE_COST);
  for (const id of p.hand) {
    const d = DD(S, id);
    if (d.t === 'Bázis') {
      if (mainLike && !p.flags.base) acts.push({ type: 'base', cid: id });
      if (canCycle) acts.push({ type: 'cycle', cid: id });
      continue;
    }
    if (canCast(S, pid, id, ctx)) acts.push({ type: 'play', cid: id });
  }
  if (mainLike) {
    if (!p.flags.rec) S.feed.forEach((id, i) => { if (id && canPay(S, pid, costOf(S, pid, S.cards[id].name, 'recruit'))) acts.push({ type: 'recruit', idx: i, cid: id }); });
    if (!p.flags.exp && opps(S, pid).length && canPay(S, pid, exposeCost(S, pid))) acts.push({ type: 'expose' });
  }
  if (ctx !== 'stack') for (const id of inPlay(S, pid)) {
    const abs = ABIL[S.cards[id].name];
    if (abs) abs.forEach((ab, i) => { if (abilityUsable(S, pid, id, i, ctx)) acts.push({ type: 'ability', cid: id, ab: i }); });
  }
  return acts;
}
const CYCLE_COST = { g: 1, s: [] };
function* cycle(S, pid, id) {
  const p = P(S, pid);
  if (!p.hand.includes(id)) return;
  const ok = yield* pay(S, pid, CYCLE_COST);
  if (!ok) return;
  p.hand.splice(p.hand.indexOf(id), 1);
  toGrave(S, id);
  log(S, `${p.name} Csere: eldobja (${S.cards[id].name}), és húz egy lapot.`);
  ev(S, { type: 'cycle', pid, id });
  draw(S, pid, 1);
}
function sameAct(a, b) { return a.type === b.type && a.cid === b.cid && a.ab === b.ab && a.idx === b.idx; }
function* doAction(S, pid, a) {
  switch (a.type) {
    case 'base': case 'play': yield* castFromHand(S, pid, a.cid); break;
    case 'cycle': yield* cycle(S, pid, a.cid); break;
    case 'recruit': yield* recruit(S, pid, a.idx); break;
    case 'expose': yield* expose(S, pid); break;
    case 'ability': yield* useAbility(S, pid, a.cid, a.ab); break;
    case 'tap': tapForMana(S, pid, a.cid, a.opt); break;
  }
  checkState(S);
}
function manualTapOK(S, pid, id) {
  const c = S.cards[id];
  if (!c || c.zone !== 'play' || c.ctrl !== pid || c.tapped) return false;
  if (!manaOptions(S, id)) return false;
  if (isCharD(DEF[c.name]) && !canTapChar(S, id)) return false;
  return true;
}

/* ── reakcióablak ──────────────────────────────────────────────────── */
function* respond(S, casterPid) {
  const n = S.players.length;
  const start = (casterPid + 1) % n;
  yield* windowLoop(S, start, 'stack');
}
function* windowLoop(S, startPid, ctx) {
  const n = S.players.length;
  const order = [];
  for (let k = 0; k < n; k++) order.push((startPid + k) % n);
  let passes = 0, idx = 0;
  for (let guard = 0; guard < 80 && passes < order.length && !S.over; guard++) {
    const pid = order[idx % order.length];
    if (P(S, pid).out) { passes++; idx++; continue; }
    const acts = legal(S, pid, ctx);
    if (!acts.length) { passes++; idx++; continue; }
    const a = yield { q: 'react', pid, ctx, acts };
    if (a && a.type === 'tap') { if (manualTapOK(S, pid, a.cid)) tapForMana(S, pid, a.cid, a.opt); continue; }
    idx++;
    if (!a || a.type === 'pass' || !acts.some(x => sameAct(x, a))) { passes++; continue; }
    yield* doAction(S, pid, a);
    passes = 0;
  }
}

/* ── kampány ───────────────────────────────────────────────────────── */
function eligibleAttackers(S, pid) {
  return chars(S, pid).filter(id => { const c = S.cards[id]; return !c.tapped && canTapChar(S, id) && !hasKW(S, id, 'Kerítés'); });
}
function eligibleBlockers(S, pid) { return chars(S, pid).filter(id => !S.cards[id].tapped); }
function* combatPhase(S) {
  const pid = S.turn, p = P(S, pid);
  if (S.era === 'Járvány') { log(S, 'Járvány: ebben a fordulóban senki sem kampányolhat.'); return; }
  const elig = eligibleAttackers(S, pid);
  if (!elig.length || !opps(S, pid).length) return;
  let decl = yield { q: 'attack', pid, elig };
  decl = (decl || []).filter((x, i, arr) => elig.includes(x.a) && opps(S, pid).includes(x.t) && arr.findIndex(y => y.a === x.a) === i);
  const final = [];
  for (const x of decl) {
    if (has(S, x.t, 'Határzár')) {
      const ok = yield* pay(S, pid, { g: 1, s: [] });
      if (!ok) { log(S, `${S.cards[x.a].name} nem támadhat (Határzár).`); continue; }
    }
    final.push(x);
  }
  if (!final.length) return;
  S.combat = { att: final.map(x => ({ a: x.a, t: x.t, b: [], blocked: false })) };
  for (const x of final) { const c = S.cards[x.a]; c.tapped = true; c.att = true; }
  p.flags.attacked = true;
  log(S, `${p.name} támad: ${final.map(x => S.cards[x.a].name + (S.players.length > 2 ? ' → ' + nm(S, x.t) : '')).join(', ')}.`, 'atk');
  ev(S, { type: 'attack', pid });
  for (const x of final) if (S.cards[x.a].name === 'Márki-Zay Péter') {
    const r = 1 + Math.floor(rnd(S) * 6);
    log(S, `Márki-Zay Péter — Rögtönzés: dobás ${r}.`);
    ev(S, { type: 'dice', n: r });
    if (r <= 2) loseSupport(S, pid, 1, false); else if (r >= 5) draw(S, pid, 1);
  }
  checkState(S);
  if (S.over || p.out) { endCombat(S); return; }
  for (const d of opps(S, pid)) {
    const mine = S.combat.att.filter(x => x.t === d && S.cards[x.a].zone === 'play').map(x => x.a);
    if (!mine.length) continue;
    const avail = eligibleBlockers(S, d);
    if (!avail.length) continue;
    const bl = yield { q: 'block', pid: d, attackers: mine, blockers: avail };
    applyBlocks(S, d, bl || [], avail, mine);
  }
  yield* windowLoop(S, pid, 'combat');
  if (S.over) { endCombat(S); return; }
  combatDamage(S);
  checkState(S);
  endCombat(S);
}
function applyBlocks(S, d, bl, avail, mine) {
  const used = new Set();
  for (const x of bl) {
    if (!avail.includes(x.b) || used.has(x.b) || !mine.includes(x.a)) continue;
    const at = S.combat.att.find(y => y.a === x.a);
    if (!at) continue;
    used.add(x.b); at.b.push(x.b);
  }
  for (const at of S.combat.att) {
    if (at.t !== d) continue;
    if (at.b.length === 1 && hasKW(S, at.a, 'Propaganda')) { used.delete(at.b[0]); at.b = []; }
    at.blocked = at.b.length > 0;
  }
  for (const b of used) S.cards[b].blk = true;
  const desc = S.combat.att.filter(at => at.t === d && at.blocked).map(at => `${at.b.map(b => S.cards[b].name).join(' + ')} feltartja: ${S.cards[at.a].name}`);
  if (desc.length) log(S, desc.join('; ') + '.', 'blk');
  ev(S, { type: 'block', pid: d });
}
function combatDamage(S) {
  const dmgC = {}, dmgP = {}, okn = {};
  const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
  for (const x of S.combat.att) {
    const a = S.cards[x.a];
    if (a.zone !== 'play' || !a.att) continue;
    const Pw = Math.max(0, power(S, x.a));
    const bl = x.b.filter(b => S.cards[b].zone === 'play');
    if (x.blocked) {
      const aOk = hasKW(S, x.a, 'Oknyomozó');
      let rem = Pw;
      const order = bl.slice().sort((u, v) => charValue(S, v) - charValue(S, u));
      for (const b of order) {
        const need = aOk ? 1 : Math.max(1, tough(S, b) - S.cards[b].dmg);
        if (rem >= need) { add(dmgC, b, need); rem -= need; if (aOk) okn[b] = true; }
      }
      if (rem > 0 && order.length) { add(dmgC, order[0], rem); if (aOk) okn[order[0]] = true; }
      for (const b of bl) {
        const bp = Math.max(0, power(S, b));
        if (bp > 0) { add(dmgC, x.a, bp); if (hasKW(S, b, 'Oknyomozó')) okn[x.a] = true; }
      }
    } else if (Pw > 0) add(dmgP, x.t, Pw);
  }
  for (const id in dmgC) dealDamage(S, id, dmgC[id], !!okn[id]);
  for (const t in dmgP) {
    log(S, `${nm(S, +t)} ${dmgP[t]} sebzést kap a kampányban.`, 'hit');
    ev(S, { type: 'pdmg', pid: +t, n: dmgP[t] });
    loseSupport(S, +t, dmgP[t], true);
  }
}
function endCombat(S) {
  for (const id of S.play) { S.cards[id].att = false; S.cards[id].blk = false; }
  S.combat = null;
}

/* ── kör ───────────────────────────────────────────────────────────── */
function* mainPhase(S, ctx) {
  for (let guard = 0; guard < 120 && !S.over; guard++) {
    if (P(S, S.turn).out) return;
    const a = yield { q: 'main', pid: S.turn, ctx };
    if (!a || a.type === 'next') return;
    if (a.type === 'tap') { if (manualTapOK(S, S.turn, a.cid)) tapForMana(S, S.turn, a.cid, a.opt); continue; }
    if (!legal(S, S.turn, ctx).some(x => sameAct(x, a))) continue;
    yield* doAction(S, S.turn, a);
  }
}
function nextEvent(S) {
  if (S.era) S.eventDiscard.push(S.era);
  if (!S.eventDeck.length) { S.eventDeck = shuffle(S, S.eventDiscard.splice(0)); log(S, 'Az Esemény-pakli elfogyott: újrakeverve.'); }
  return S.eventDeck.pop();
}
function* eraReveal(S, name) {
  S.era = name;
  log(S, `${S.round}. forduló — új Esemény: ${name}.`, 'era');
  ev(S, { type: 'era', name });
  if (S.feed.length) {
    feedBottom(S, S.feed.shift());
    const nid = feedDraw(S); if (nid) S.feed.push(nid);
  }
  const order = [];
  for (let k = 0; k < S.players.length; k++) { const q = (S.turn + k) % S.players.length; if (!P(S, q).out) order.push(q); }
  const sup = q => P(S, q).support;
  switch (name) {
    case 'Rezsiharc': for (const q of order) gainSupport(S, q, 2); break;
    case 'G-nap': for (const q of order) if (P(S, q).scandal >= 4 && P(S, q).hand.length) {
      const h = P(S, q).hand;
      const r = yield* pick(S, q, 'G-nap: dobj el egy lapot.', h.map(x => cOpt(S, x, -handValue(S, q, x))), { title: 'G-nap' });
      if (r && r.length) discardFromHand(S, q, r[0]);
    } break;
    case 'Kvótanépszavazás': for (const q of order) {
      const r = yield* pick(S, q, 'Kvótanépszavazás: húzol egy lapot, vagy +2 Támogatottság?', [{ id: 'd', label: 'Húzok egy lapot', ai: P(S, q).hand.length < 3 ? 3 : 1.5 }, { id: 's', label: '+2 Támogatottság', ai: P(S, q).support < 10 ? 4 : 2 }], { title: 'Kvótanépszavazás' });
      if (r && r[0] === 'd') draw(S, q, 1); else gainSupport(S, q, 2);
    } break;
    case 'Önkormányzati fordulat': { const m = Math.min(...order.map(sup)); for (const q of order) if (sup(q) === m) gainSupport(S, q, 3); } break;
    case 'Járvány': for (const q of order) draw(S, q, 1); break;
    case 'Index-ügy':
      for (const id of S.feed) feedBottom(S, id);
      S.feed = [];
      for (let i = 0; i < 3; i++) { const x = feedDraw(S); if (x) S.feed.push(x); }
      break;
    case 'Ellenzéki előválasztás': for (const q of order) yield* lookTop(S, q, 3, () => true, 'Ellenzéki előválasztás'); break;
    case 'Pedagógus-tüntetések': for (const q of order) if (basesOf(S, q).some(b => (manaOptions(S, b) || []).some(o => o.includes('U')))) gainSupport(S, q, 2); break;
    case 'Kegyelmi ügy': { const m = Math.max(...order.map(q => P(S, q).scandal)); if (m > 0) for (const q of order) if (P(S, q).scandal === m) { loseSupport(S, q, 3, false); log(S, `${nm(S, q)} −3 Támogatottság (Kegyelmi ügy).`, 'hit'); } } break;
    case 'Új kihívó': for (const q of order) {
      const t = yield* chooseChar(S, q, 'Új kihívó: tehetsz egy Szimpátia jelzőt egy szereplődre.', x => S.cards[x].ctrl === q, 'help', { min: 0, max: 1 });
      if (t) addSymp(S, t, 1);
    } break;
    case 'Hangulatváltás': {
      const mx = Math.max(...order.map(sup)), mn = Math.min(...order.map(sup));
      if (mx !== mn) { for (const q of order) if (sup(q) === mx) loseSupport(S, q, 2, false); for (const q of order) if (sup(q) === mn) gainSupport(S, q, 2); }
    } break;
  }
  checkState(S);
}
function* takeTurn(S) {
  const pid = S.turn, p = P(S, pid);
  S.turnNo++;
  S.phase = 'wake';
  for (const q of S.players) { q.flags.reacts = 0; q.flags.used444 = false; }
  p.flags.base = false; p.flags.rec = false; p.flags.exp = false; p.flags.attacked = false;
  for (const id of S.play) { const c = S.cards[id]; if (c.ctrl === pid) { c.tapped = false; c.fresh = false; } if (c.supp === pid) c.supp = null; }
  log(S, `— ${p.name} köre —`, 'turn');
  ev(S, { type: 'turn', pid });
  if (S.newRound) {
    S.newRound = false;
    S.round++;
    yield* eraReveal(S, nextEvent(S));
    if (S.over || p.out) return;
  }
  S.phase = 'start';
  for (const id of inPlay(S, pid)) {
    if (S.cards[id].zone !== 'play' || S.cards[id].ctrl !== pid) continue;
    const fx = FX[S.cards[id].name];
    if (fx && fx.start) yield* fx.start(S, id, pid);
    checkState(S);
    if (S.over || p.out) return;
  }
  S.phase = 'draw';
  if (S.turnNo > 1) draw(S, pid, 1);
  if (p.scandal >= threshold(S, pid)) { log(S, `${p.name} túllépte a Botrányküszöböt: −1 Támogatottság.`, 'bad'); loseSupport(S, pid, 1, false); }
  checkState(S);
  if (S.over || p.out) return;
  S.phase = 'main';
  yield* mainPhase(S, 'main');
  if (S.over || p.out) return;
  S.phase = 'combat';
  yield* combatPhase(S);
  if (S.over || p.out) return;
  S.phase = 'end';
  yield* mainPhase(S, 'end');
  if (S.over || p.out) return;
  S.phase = 'close';
  for (const id of inPlay(S, pid)) {
    const fx = FX[S.cards[id].name];
    if (fx && fx.end && S.cards[id].zone === 'play') yield* fx.end(S, id, pid);
  }
  checkState(S);
  if (S.over) return;
  for (const id of S.play) { const c = S.cards[id]; c.dmg = 0; c.temp = []; c.oknyo = false; }
  for (const q of S.players) q.pool = [];
  if (p.hand.length > 7 && !p.out) {
    const k = p.hand.length - 7;
    const r = yield* pick(S, pid, `Kézlimit: dobj el ${k} lapot.`, p.hand.map(x => cOpt(S, x, -handValue(S, pid, x))), { min: k, max: k, title: 'Kézlimit' });
    for (const x of (r || []).slice(0, k)) discardFromHand(S, pid, x);
    while (p.hand.length > 7) discardFromHand(S, pid, p.hand[0]);
  }
  checkState(S);
}
function nextSeat(S) {
  const n = S.players.length;
  for (let k = 1; k <= n; k++) { const s = (S.turn + k) % n; if (!S.players[s].out) return s; }
  return S.turn;
}
// Nincs körlimit; ez csak a végtelen játszmák ellen véd (gyakorlatilag nem fordul elő).
function stalemateEnd(S) {
  const al = S.players.filter(p => !p.out).sort((a, b) => (b.support - b.scandal) - (a.support - a.scandal));
  S.over = true; S.winner = al[0].id; S.endReason = 'limit';
  log(S, `A játszma elhúzódott: ${al[0].name} nyer (Támogatottság − Botrány).`, 'big');
}
function* mulligans(S) {
  for (const p of S.players) {
    let n = 0;
    for (; n < 6; n++) {
      const nb = p.hand.filter(x => DD(S, x).t === 'Bázis').length;
      const good = (nb >= 2 && nb <= 5) || n >= 2;
      const r = yield* pick(S, p.id, n ? `Új kéz (${n}. újrahúzás). Ha megtartod, ${n} lapot a paklid aljára teszel.` : 'Kezdő kéz: megtartod, vagy újrahúzod?',
        [{ id: 'keep', label: 'Megtartom', ai: good ? 2 : 0 }, { id: 'mull', label: 'Újrahúzás (mulligan)', ai: good ? 0 : 2 }], { show: p.hand.slice(), title: 'Kezdő kéz' });
      if (!r || r[0] !== 'mull') break;
      for (const x of p.hand) { S.cards[x].zone = 'deck'; p.deck.push(x); }
      p.hand = [];
      shuffle(S, p.deck);
      draw(S, p.id, 7);
      log(S, `${p.name} újrahúzza a kezét.`);
    }
    if (n) {
      const r2 = yield* pick(S, p.id, `Mulligan: válassz ${n} lapot, ami a paklid aljára kerül.`, p.hand.map(x => cOpt(S, x, -handValue(S, p.id, x))), { min: n, max: n, title: 'Mulligan' });
      const sel = (r2 || []).filter(x => p.hand.includes(x)).slice(0, n);
      while (sel.length < n) sel.push(p.hand.find(x => !sel.includes(x)));
      for (const b of sel) { p.hand.splice(p.hand.indexOf(b), 1); S.cards[b].zone = 'deck'; p.deck.unshift(b); }
    }
  }
}
function* gameLoop(S) {
  yield* mulligans(S);
  S.phase = 'play';
  S.turn = 0; S.newRound = true;
  for (let guard = 0; guard < 600 && !S.over; guard++) {
    yield* takeTurn(S);
    checkState(S);
    if (S.over) break;
    const ns = nextSeat(S);
    if (ns <= S.turn) S.newRound = true;
    S.turn = ns;
  }
  if (!S.over) stalemateEnd(S);
  ev(S, { type: 'over' });
}

/* ── új játék ──────────────────────────────────────────────────────── */
// cfg: { players:[{name, faction, ai:null|'easy'|'normal'|'hard'}], variant:'normal'|'short', seed }
function newGame(cfg) {
  const S = {
    seed: cfg.seed != null ? cfg.seed : (Math.random() * 2 ** 31) | 0, nextId: 1, nextUid: 1, cards: {}, players: [], play: [], stack: [],
    feed: [], feedDeck: [], feedDiscard: [], eventDeck: [], eventDiscard: [], round: 0, turn: 0, turnNo: 0, phase: 'setup', era: null,
    log: [], events: [], over: false, winner: null, sim: false, combat: null, newRound: false, variant: cfg.variant || 'normal',
  };
  // kezdőjátékos sorsolása: az ülésrend elforgatása
  const list = cfg.players.slice();
  const first = Math.floor(rnd(S) * list.length);
  const seats = list.slice(first).concat(list.slice(0, first));
  const startSup = S.variant === 'short' ? 15 : 20;
  seats.forEach((pc, i) => {
    const p = { id: i, name: pc.name, faction: pc.faction, ai: pc.ai || null, human: !pc.ai, support: startSup + (seats.length === 2 && i === 1 ? 5 : 0), scandal: 0, deck: [], hand: [], discard: [], pool: [], out: false, flags: { base: false, rec: false, exp: false, attacked: false, reacts: 0, used444: false } };
    S.players.push(p);
    for (const c of CARDS) if (c.f === pc.faction) for (let k = 0; k < c.k; k++) p.deck.push(newCard(S, c.n, i));
    shuffle(S, p.deck);
  });
  for (const c of CARDS) if (c.f === 'SAJ') { const id = newCard(S, c.n, null); S.cards[id].zone = 'feedDeck'; S.cards[id].ctrl = null; S.feedDeck.push(id); }
  shuffle(S, S.feedDeck);
  for (let i = 0; i < 3; i++) S.feed.push(feedDraw(S));
  S.eventDeck = shuffle(S, CARDS.filter(c => c.f === 'KOR').map(c => c.n));
  for (const p of S.players) draw(S, p.id, 7);
  log(S, `Új játék. Kezdő játékos: ${S.players[0].name}.`, 'big');
  return S;
}

if (typeof module !== 'undefined') module.exports = {
  DEF, FX, ABIL, MANA, KWS, FACTION_NAME, newGame, gameLoop, legal, power, tough, hasKW, allKW, costOf, exposeCost, canPay, planPay,
  manaOptions, manualTapOK, CYCLE_COST, eligibleAttackers, eligibleBlockers, chars, insts, basesOf, opps, threshold, charValue, instValue, handValue,
  combatPhase, combatDamage, applyBlocks, doAction, castFromHand, resolveStackSim, checkState, printedCost, parties, rnd, shuffle, P,
};
