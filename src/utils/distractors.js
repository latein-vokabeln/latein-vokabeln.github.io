// Picks up to `count` distinct wrong answer texts for a multiple-choice question.
// Skips candidates that could also be right:
//  - same answer or same prompt text,
//  - a shared German meaning ("die Stadt, die Hauptstadt" vs "die Stadt, die Kleinstadt"),
//  - the same Latin dictionary form ("dēbēre, dēbet" vs "dēbēre, dēbeō, dēbuī").
// `fallbackPool` is used when `pool` has too few distinct texts.

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[!?.…]/g, '').replace(/\s+/g, ' ').trim();
const noBrackets = (s) => s.replace(/\([^()]*\)/g, ' ');

// German: every meaning. Latin: the dictionary form(s) before the first comma ("ē / ex").
const deMeanings = (w) => new Set(noBrackets(w.de).split(/[,;]|\s\/\s/).map(norm).filter(Boolean));
const laLemmas   = (w) => new Set(noBrackets(w.la).split(',')[0].split(/\s\/\s/).map(norm).filter(Boolean));
const overlaps = (a, b) => [...a].some(x => b.has(x));

export function pickDistractors(item, dir, pool, fallbackPool = [], count = 3) {
  const promptOf = w => (dir === 'la2de' ? w.la : w.de);
  const answerOf = w => (dir === 'la2de' ? w.de : w.la);
  const itemDe = deMeanings(item);
  const itemLa = laLemmas(item);
  const seen = new Set([answerOf(item)]);
  const out = [];
  const tryAdd = (w) => {
    const text = answerOf(w);
    if (!text || seen.has(text) || promptOf(w) === promptOf(item)) return;
    if (overlaps(deMeanings(w), itemDe) || overlaps(laLemmas(w), itemLa)) return;
    seen.add(text);
    out.push(text);
  };
  for (const p of [pool, fallbackPool]) {
    if (!p.length) continue;
    for (let tries = 0; tries < 60 && out.length < count; tries++) {
      tryAdd(p[Math.floor(Math.random() * p.length)]);
    }
    // Small pools: scan everything from a random offset
    const offset = Math.floor(Math.random() * p.length);
    for (let k = 0; k < p.length && out.length < count; k++) {
      tryAdd(p[(offset + k) % p.length]);
    }
    if (out.length >= count) break;
  }
  return out;
}
