import { vocabByGrade } from '../data/vocab.js';
import { compareAnswers, normalizeAnswer } from './textComparison.js';

// la → all German translations, de → all Latin words (over the whole vocabulary)
let index = null;
function getIndex() {
  if (index) return index;
  const laToDe = new Map();
  const deToLa = new Map();
  const add = (map, k, v) => { if (!map.has(k)) map.set(k, new Set()); map.get(k).add(v); };
  for (const g of Object.values(vocabByGrade)) {
    for (const t of g.topics) {
      for (const w of t.words) { add(laToDe, w.la, w.de); add(deToLa, w.de, w.la); }
    }
  }
  index = { laToDe, deToLa };
  return index;
}

// Other valid answers for the same prompt: "nur" → tantum / sōlum.
export function alternativeAnswers(word, dir) {
  const { laToDe, deToLa } = getIndex();
  const set = dir === 'la2de' ? laToDe.get(word.la) : deToLa.get(word.de);
  const own = dir === 'la2de' ? word.de : word.la;
  return set ? [...set].filter(a => a !== own) : [];
}

const splitInput = (input) => input.split(/[,;]|\s\/\s/).map(s => s.trim()).filter(Boolean);

// Like compareAnswers, but also accepts every other meaning of the prompt.
// Returns the compareAnswers result plus `correct` (the matched solution) and
// `expected` (the solution stored with this card).
export function checkAnswer(input, word, dir) {
  const r = checkSingle(input, word, dir);
  if (r.isCorrect) return r;
  const parts = splitInput(input);
  if (parts.length < 2) return r;
  // "er, sie, es" for "dieser, diese, dieses; er, sie, es": every typed part is a correct meaning
  const each = parts.map(p => checkSingle(p, word, dir));
  if (each.every(x => x.isCorrect)) {
    const hinted = each.find(x => x.hint);
    return { ...each[0], hint: hinted?.hint ?? null, hasAccentWarning: each.some(x => x.hasAccentWarning) };
  }
  // Latin with extra forms ("amicus, amici", "cogitare, cogito", "cogito, cogitare"):
  // the dictionary form counts, as long as every typed form belongs to the same word.
  if (dir === 'de2la') {
    const hit = each.find(x => x.isCorrect);
    const stem = (s) => normalizeAnswer(s).slice(0, 2);
    if (hit && parts.every(p => stem(p) === stem(parts[each.indexOf(hit)])))
      return { ...hit, hasAccentWarning: false, hint: hit.hint ?? 'forms' };
  }
  return r;
}

function checkSingle(input, word, dir) {
  const expected = dir === 'la2de' ? word.de : word.la;
  const own = compareAnswers(input, expected);
  if (own.isCorrect && !own.hint) return { ...own, correct: expected, expected };
  for (const alt of alternativeAnswers(word, dir)) {
    const r = compareAnswers(input, alt);
    // Prefer a clean match on another meaning over a hinted match on this one
    if (r.isCorrect && (!r.hint || !own.isCorrect)) return { ...r, correct: alt, expected };
  }
  return { ...own, correct: expected, expected };
}
