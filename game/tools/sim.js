// Fej nélküli gép-gép szimuláció: node game/tools/sim.js [játszmák] [játékosok] [szintek, pl. hard,normal]
const fs = require('fs'), vm = require('vm'), path = require('path');
const dir = path.join(__dirname, '..');
const ctx = { console, structuredClone, Math, module: { exports: {} } };
vm.createContext(ctx);
for (const f of ['cards.js', 'engine.js', 'ai.js']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
const { newGame, gameLoop, aiDecide } = vm.runInContext('({newGame,gameLoop,aiDecide})', ctx);
const N = +process.argv[2] || 20, np = +process.argv[3] || 2, lv = (process.argv[4] || 'normal').split(',');
const facs = ['NER', 'OSZ', 'TIS', 'RAD'];
const wins = {}, lvwins = {}; let rounds = 0, ko = 0, errs = 0; const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const pl = []; for (let i = 0; i < np; i++) pl.push({ name: 'P' + i, faction: facs[(g + i) % 4], ai: lv[i % lv.length] });
  const S = newGame({ players: pl, seed: g * 7919 + 1 });
  const gen = gameLoop(S); let r = gen.next(), steps = 0;
  try { while (!r.done) { r = gen.next(aiDecide(S, r.value)); if (++steps > 20000) throw new Error('too many steps'); } }
  catch (e) { errs++; console.log('HIBA, játszma', g, e.stack.split('\n').slice(0, 5).join('\n')); continue; }
  const w = S.players[S.winner]; wins[w.faction] = (wins[w.faction] || 0) + 1; lvwins[w.ai] = (lvwins[w.ai] || 0) + 1;
  rounds += S.round; if (S.endReason === 'ko') ko++;
}
console.log({ játszmák: N, játékosok: np, frakciógyőzelmek: wins, szintgyőzelmek: lvwins, átlagKör: +(rounds / N).toFixed(1), kiütés: ko, hibák: errs, ms: Date.now() - t0 });
process.exit(errs ? 1 : 0);
