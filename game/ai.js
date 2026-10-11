'use strict';
/* ════════════════════════════════════════════════════════════════════
   KÉTHARMAD — gépi játékosok
   easy   · Könnyű: nagyrészt véletlenszerű, de szabályos lépések
   normal · Közepes: minden lehetséges lépést leszimulál és a legjobbat
            választja; mohó támadás és feltartás
   hard   · Nehéz: szimuláció + kampány-előretekintés, a támadások és
            feltartások teljes keresése, okos Reakció-időzítés
   ════════════════════════════════════════════════════════════════════ */

const AI_LEVELS = { easy: 'Könnyű', normal: 'Közepes', hard: 'Nehéz' };

function cloneSim(S) {
  const L = S.log, E = S.events;
  S.log = []; S.events = [];
  const T = structuredClone(S);
  S.log = L; S.events = E;
  T.sim = true;
  T.seed = (T.seed ^ 0x5bd1e995) | 0;
  return T;
}
function runSync(T, gen, chooser) {
  let r = gen.next();
  for (let guard = 0; !r.done; guard++) {
    if (guard > 3000) throw new Error('sim guard');
    r = gen.next(chooser(T, r.value));
  }
  return r.value;
}
function rand(S) { return Math.random(); }

/* ── értékelés ─────────────────────────────────────────────────────── */
function scoreP(S, q) {
  const p = S.players[q];
  if (p.out) return -80;
  // nincs körlimit: a késői játékban a Támogatottság egyre többet ér
  const late = Math.min(1, S.round / 12);
  let v = p.support * (1 + late * 0.6);
  if (p.support <= 6) v -= (7 - p.support) * 1.6;
  v -= p.scandal * (0.5 + late * 0.7);
  if (p.scandal >= threshold(S, q)) v -= 2;
  v += Math.min(p.hand.length, 7) * 0.8;
  const nb = basesOf(S, q).length;
  v += Math.min(nb, 6) * 1.3 + Math.max(0, nb - 6) * 0.2;
  const bw = 1 - late * 0.45;
  for (const id of chars(S, q)) v += charValue(S, id) * bw;
  for (const id of insts(S, q)) v += instValue(S, id) * bw;
  if (p.deck.length < 4) v -= (4 - p.deck.length) * 1.5;
  return v;
}
function exposure(S, pid) {
  const me = S.players[pid];
  const myBlockers = chars(S, pid).filter(id => !S.cards[id].tapped).length;
  let pen = 0;
  const os = opps(S, pid);
  for (const o of os) {
    const pw = chars(S, o).filter(id => !hasKW(S, id, 'Kerítés')).map(id => Math.max(0, power(S, id, true))).sort((a, b) => b - a);
    const incoming = pw.slice(myBlockers).reduce((a, b) => a + b, 0);
    pen += incoming * 0.35 * (os.length > 1 ? 0.6 : 1);
    if (incoming >= me.support) pen += 15;
  }
  return pen;
}
function evalState(S, pid) {
  if (S.over) return S.winner === pid ? 1e4 : -1e4;
  if (S.players[pid].out) return -1e4;
  const me = scoreP(S, pid);
  const os = opps(S, pid).map(o => scoreP(S, o));
  let v = me;
  if (os.length === 1) v -= os[0];
  else if (os.length) v -= 0.6 * Math.max(...os) + 0.4 * os.reduce((a, b) => a + b, 0) / os.length;
  if (S.turn === pid) v -= exposure(S, pid);
  return v;
}

/* ── választások ───────────────────────────────────────────────────── */
function aiPick(S, req, level) {
  const opts = req.options;
  if (!opts.length) return [];
  if (level === 'easy') {
    const sh = opts.slice().sort(() => Math.random() - 0.5);
    let k = req.min + Math.floor(Math.random() * (req.max - req.min + 1));
    // a könnyű gép is általában él a „választhatsz” lehetőséggel
    if (req.max > req.min && Math.random() < 0.6) k = req.max;
    return sh.slice(0, k).map(o => o.id);
  }
  const sorted = opts.slice().sort((a, b) => (b.ai || 0) - (a.ai || 0));
  const out = [];
  for (const o of sorted) {
    if (out.length >= req.max) break;
    if (out.length < req.min || (o.ai || 0) > 0) out.push(o.id);
  }
  return out;
}

/* ── feltartás ─────────────────────────────────────────────────────── */
function greedyBlock(S, req) {
  const d = req.pid, sup = S.players[d].support;
  const atk = req.attackers.filter(a => S.cards[a].zone === 'play').slice().sort((a, b) => power(S, b) - power(S, a));
  const avail = req.blockers.slice().sort((a, b) => charValue(S, a) - charValue(S, b));
  const used = new Set(), res = [];
  let incoming = atk.reduce((s, a) => s + Math.max(0, power(S, a)), 0);
  for (const a of atk) {
    const Pa = Math.max(0, power(S, a)), Ta = tough(S, a) - S.cards[a].dmg, aOk = hasKW(S, a, 'Oknyomozó');
    const prop = hasKW(S, a, 'Propaganda');
    const free = avail.filter(b => !used.has(b));
    const lethal = incoming >= S.players[d].support;
    const survives = b => !aOk && Pa < tough(S, b) - S.cards[b].dmg;
    const kills = b => power(S, b) >= Ta || hasKW(S, b, 'Oknyomozó');
    if (prop) {
      if (free.length >= 2) {
        const pair = free.slice(0, 2);
        const together = pair.reduce((s, b) => s + power(S, b), 0) >= Ta;
        if (lethal || (together && charValue(S, a) > charValue(S, pair[0]))) { pair.forEach(b => { used.add(b); res.push({ b, a }); }); incoming -= Pa; }
      }
      continue;
    }
    let pick = free.find(b => survives(b) && kills(b)) || free.find(b => survives(b));
    if (!pick) { const tr = free.find(b => kills(b) && charValue(S, b) <= charValue(S, a) + 0.5); if (tr) pick = tr; }
    if (!pick && Pa > 0 && (lethal || (sup - incoming <= 4 && Pa >= 2))) pick = free[0];
    if (pick) { used.add(pick); res.push({ b: pick, a }); incoming -= Pa; }
  }
  return res;
}
function easyBlock(S, req) {
  const res = [];
  for (const b of req.blockers) if (Math.random() < 0.4) res.push({ b, a: req.attackers[Math.floor(Math.random() * req.attackers.length)] });
  return res;
}
function searchBlock(S, req) {
  const atk = req.attackers.filter(a => S.cards[a].zone === 'play');
  const bl = req.blockers;
  const choices = bl.map(() => atk.length + 1);
  let total = choices.reduce((a, b) => a * b, 1);
  if (total > 900) return greedyBlock(S, req);
  const d = req.pid;
  let best = greedyBlock(S, req), bestV = simBlocks(S, d, best, atk, bl);
  const idx = new Array(bl.length).fill(0);
  for (let n = 0; n < total; n++) {
    const asg = [];
    bl.forEach((b, i) => { if (idx[i] > 0) asg.push({ b, a: atk[idx[i] - 1] }); });
    const v = simBlocks(S, d, asg, atk, bl);
    if (v > bestV + 0.01) { bestV = v; best = asg; }
    let i = 0;
    while (i < bl.length) { idx[i]++; if (idx[i] < choices[i]) break; idx[i] = 0; i++; }
  }
  return best;
}
function simBlocks(S, d, asg, atk, bl) {
  const T = cloneSim(S);
  applyBlocks(T, d, asg, bl, atk);
  try { combatDamage(T); checkState(T); } catch (e) { return -1e9; }
  return evalState(T, d);
}

/* ── támadás ───────────────────────────────────────────────────────── */
function bestTarget(S, pid) {
  const os = opps(S, pid);
  // a leggyengébb ellenfelet ütjük, ha közel a kiütés; különben a vezetőt
  return os.slice().sort((a, b) => {
    const A = S.players[a], B = S.players[b];
    const ka = A.support <= 6 ? -100 + A.support : -A.support, kb = B.support <= 6 ? -100 + B.support : -B.support;
    return ka - kb;
  })[0];
}
function quickAttack(S, req) {
  const pid = req.pid;
  const t = bestTarget(S, pid);
  if (t == null) return [];
  const blockers = eligibleBlockers(S, t);
  const sortedP = req.elig.map(a => Math.max(0, power(S, a))).sort((a, b) => b - a);
  if (!blockers.length || sortedP.slice(blockers.length).reduce((s, x) => s + x, 0) >= S.players[t].support) return req.elig.map(a => ({ a, t }));
  const out = [];
  for (const a of req.elig) {
    const Pa = power(S, a), Ta = tough(S, a), va = charValue(S, a);
    if (Pa <= 0) continue;
    const danger = blockers.filter(b => (power(S, b) >= Ta || hasKW(S, b, 'Oknyomozó')));
    const safe = danger.every(b => (Pa >= tough(S, b) || hasKW(S, a, 'Oknyomozó')) && charValue(S, b) >= va * 0.8);
    if (safe || hasKW(S, a, 'Propaganda') && blockers.length < 2) out.push({ a, t });
  }
  return out;
}
function searchAttack(S, req, chooser) {
  const pid = req.pid;
  let elig = req.elig.filter(a => power(S, a) > 0);
  const targets = opps(S, pid);
  if (!elig.length) return [];
  if (elig.length > 7) elig = elig.sort((a, b) => power(S, b) - power(S, a)).slice(0, 7);
  let best = [], bestV = simAttack(S, pid, [], chooser);
  const n = elig.length;
  for (const t of targets) {
    for (let mask = 1; mask < (1 << n); mask++) {
      const decl = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) decl.push({ a: elig[i], t });
      const v = simAttack(S, pid, decl, chooser);
      if (v > bestV + 0.05) { bestV = v; best = decl; }
    }
  }
  return best;
}
function simAttack(S, pid, decl, chooser) {
  const T = cloneSim(S);
  const ch = (T2, r) => r.q === 'attack' ? decl : chooser(T2, r);
  try { runSync(T, combatPhase(T), ch); } catch (e) { return -1e9; }
  return evalState(T, pid);
}

/* ── szimulációs választó: a többiek passzolnak, mohón döntenek ───── */
function simChooser(T, r) {
  switch (r.q) {
    case 'pick': return aiPick(T, r, 'normal');
    case 'react': return { type: 'pass' };
    case 'attack': return quickAttack(T, r);
    case 'block': return greedyBlock(T, r);
    case 'main': return { type: 'next' };
  }
  return null;
}

/* ── Csere: a fölösleges Bázist új lapra váltjuk ───────────────────── */
const BASE_TARGET = 6;
function cycleAct(S, pid, acts) {
  const p = S.players[pid];
  const cyc = acts.filter(a => a.type === 'cycle');
  if (!cyc.length) return null;
  const inHand = p.hand.filter(x => DEF[S.cards[x].name].t === 'Bázis').length;
  const willPlay = p.flags.base ? 0 : Math.min(1, inHand);
  const need = Math.max(0, BASE_TARGET - basesOf(S, pid).length - willPlay);
  // a ki nem játszott Bázis-lehetőséghez egyet mindig megtartunk
  const surplus = inHand - willPlay - need;
  return surplus > 0 ? cyc[0] : null;
}

/* ── fő szakasz ────────────────────────────────────────────────────── */
function lookaheadValue(T, pid, hard, ctx) {
  if (hard && ctx === 'main' && !T.over && T.turn === pid && T.era !== 'Járvány') {
    try { runSync(T, combatPhase(T), simChooser); } catch (e) { return -1e9; }
  }
  return evalState(T, pid);
}
function aiMain(S, req, level) {
  const pid = req.pid;
  const all = legal(S, pid, req.ctx);
  if (!all.length) return { type: 'next' };
  // a Csere a szimulációban nem mérhető (véletlen húzás): külön szabály dönt róla, ha más nincs
  const acts = all.filter(a => a.type !== 'cycle');
  if (level === 'easy') {
    const base = acts.find(a => a.type === 'base');
    if (base) return base;
    const nonReact = acts.filter(a => !(a.type === 'play' && DEF[S.cards[a.cid].name].t === 'Reakció'));
    if (nonReact.length && Math.random() < 0.8) return nonReact[Math.floor(Math.random() * nonReact.length)];
    return (req.ctx === 'end' && cycleAct(S, pid, all)) || { type: 'next' };
  }
  const hard = level === 'hard';
  const base = lookaheadValue(cloneSim(S), pid, hard, req.ctx);
  let best = null, bestV = base + 0.2;
  for (const a of acts) {
    const T = cloneSim(S);
    try { runSync(T, doAction(T, pid, a), simChooser); } catch (e) { continue; }
    let v = lookaheadValue(T, pid, hard, req.ctx);
    if (a.type === 'base') v += 0.5;
    if (level === 'normal') v += (Math.random() - 0.5) * 0.6;
    if (v > bestV) { bestV = v; best = a; }
  }
  if (best) return best;
  // Cserélni a kampány után érdemes, amikor már semmi másra nem kell az erőforrás
  return (req.ctx === 'end' && cycleAct(S, pid, all)) || { type: 'next' };
}

/* ── reakciók ──────────────────────────────────────────────────────── */
function aiReact(S, req, level) {
  const pid = req.pid;
  const acts = req.acts;
  if (!acts.length) return { type: 'pass' };
  if (level === 'easy') {
    if (Math.random() < 0.12) return acts[Math.floor(Math.random() * acts.length)];
    return { type: 'pass' };
  }
  const rest = T => {
    if (req.ctx === 'stack') runSync(T, resolveStackSim(T), simChooser);
    else if (req.ctx === 'combat' && T.combat) { combatDamage(T); checkState(T); }
    return evalState(T, pid);
  };
  let baseV;
  try { baseV = rest(cloneSim(S)); } catch (e) { return { type: 'pass' }; }
  const thr = level === 'hard' ? 0.9 : 2.2;
  let best = null, bestV = baseV + thr;
  for (const a of acts) {
    const T = cloneSim(S);
    let v;
    try { runSync(T, doAction(T, pid, a), simChooser); v = rest(T); } catch (e) { continue; }
    if (v > bestV) { bestV = v; best = a; }
  }
  if (best && level === 'normal' && Math.random() < 0.3) return { type: 'pass' };
  return best || { type: 'pass' };
}

/* ── belépési pont ─────────────────────────────────────────────────── */
function aiDecide(S, req) {
  const p = S.players[req.pid];
  const level = p.ai || 'normal';
  switch (req.q) {
    case 'pick': return aiPick(S, req, level);
    case 'main': return aiMain(S, req, level);
    case 'react': return aiReact(S, req, level);
    case 'attack':
      if (level === 'easy') {
        const os = opps(S, req.pid);
        return req.elig.filter(() => Math.random() < 0.55).map(a => ({ a, t: os[Math.floor(Math.random() * os.length)] }));
      }
      if (level === 'hard') return searchAttack(S, req, simChooser);
      return quickAttack(S, req);
    case 'block':
      if (level === 'easy') return easyBlock(S, req);
      if (level === 'hard') return searchBlock(S, req);
      return greedyBlock(S, req);
  }
  return null;
}

if (typeof module !== 'undefined') module.exports = { aiDecide, evalState, AI_LEVELS, runSync, cloneSim };
