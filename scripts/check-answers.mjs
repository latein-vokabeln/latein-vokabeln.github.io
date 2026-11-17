// Checks the answer comparison against every vocabulary entry.
// Run with: npm run check
import { vocabByGrade } from '../src/data/vocab.js';
import { compareAnswers, getAcceptedAnswers, normalizeAnswer } from '../src/utils/textComparison.js';
import { checkAnswer } from '../src/utils/answerCheck.js';

const errors = [];
const letterCount = (s) => (s.match(/\p{L}/gu) || []).length;

// Removes every bracket group: "la bici(cleta)" → "la bici", "(der) Herr" → "Herr".
const withoutBrackets = (s) =>
  s.replace(/\s*\([^()]*\)\s*/g, m => (/^\s|\s$/.test(m) ? ' ' : '')).trim();

let checked = 0;
for (const [grade, { topics }] of Object.entries(vocabByGrade)) {
  for (const topic of topics) {
    for (const word of topic.words) {
      for (const field of ['la', 'de']) {
        const answer = word[field];
        const where = `[${grade} · ${topic.name}] ${field}: "${answer}"`;
        checked++;

        const self = compareAnswers(answer, answer);
        if (!self.isCorrect || self.hint) errors.push(`${where} akzeptiert sich selbst nicht`);

        // Every spelling of the answer without its bracket parts must be accepted too.
        if (answer.includes('(')) {
          const short = withoutBrackets(answer);
          const literal = normalizeAnswer(short);
          const variants = getAcceptedAnswers(short).filter(v => v !== literal || getAcceptedAnswers(short).length === 1);
          for (const v of variants) {
            if (!compareAnswers(v, answer).isCorrect) errors.push(`${where} lehnt "${v}" (ohne Klammerteil) ab`);
          }
        }

        // One-letter answers are fine only if the word itself is one letter ("y", "e (vor i und hi)").
        const core = [normalizeAnswer(answer), normalizeAnswer(withoutBrackets(answer))];
        for (const v of getAcceptedAnswers(answer)) {
          if (letterCount(v) < 2 && !core.includes(v)) errors.push(`${where} akzeptiert zu kurze Alternative "${v}"`);
        }
      }
    }
  }
}

// Words with several meanings: every meaning must be accepted for the same prompt
// ("nur" → tantum / sōlum).
const allWords = Object.values(vocabByGrade).flatMap(g => g.topics.flatMap(t => t.words));
for (const w of allWords) {
  for (const other of allWords) {
    if (other === w) continue;
    if (other.la === w.la && other.de !== w.de && !checkAnswer(other.de, w, 'la2de').isCorrect)
      errors.push(`Mehrdeutig: "${w.la}" lehnt "${other.de}" ab`);
    if (other.de === w.de && other.la !== w.la && !checkAnswer(other.la, w, 'de2la').isCorrect)
      errors.push(`Mehrdeutig: "${w.de}" lehnt "${other.la}" ab`);
  }
}
const SYNONYMS = [
  ['tantum', { la: 'sōlum (Adv.)', de: 'nur' }, 'de2la', true],
  ['dann', { la: 'post (Präp. m. Akk.)', de: 'hinter, nach' }, 'la2de', false],
  ['wollen', { la: 'velle, volō', de: 'wollen' }, 'la2de', true],
];
for (const [input, word, dir, expected] of SYNONYMS) {
  if (checkAnswer(input, word, dir).isCorrect !== expected)
    errors.push(`Synonym: "${input}" für "${dir === 'la2de' ? word.la : word.de}" sollte ${expected ? 'richtig' : 'falsch'} sein`);
}

// Latin: length marks and grammar notes never count, German optional parts do.
const EXAMPLES = [
  ['cogitare', 'cōgitāre, cōgitat', true],
  ['cōgitāre', 'cōgitāre, cōgitat', true],
  ['cogitare, cogitat', 'cōgitāre, cōgitat', true],
  ['dominus', 'dominus (m)', true],
  ['ad', 'ad (Präp. m. Akk.)', true],
  ['pars', 'pars, partis (f; Gen. Pl. -ium)', true],
  ['pars partis', 'pars, partis (f; Gen. Pl. -ium)', true],
  ['que', '-que (angehängt)', true],
  ['ex', 'ē / ex (Präp. m. Abl.)', true],
  ['tecum', 'tēcum / cum tē', true],
  ['cum te', 'tēcum / cum tē', true],
  ['nec', 'neque / nec', true],
  ['ubi', 'ubi (Subj. m. Perf.)', true],
  ['inquam', 'inquam (3. Pers. Sg. inquit)', true],
  ['prohibere', 'prohibēre, prohibeō, prohibuī (ā m. Abl.)', true],
  ['vorbereiten', '(vor)bereiten, vorhaben, erwerben', true],
  ['bereiten', '(vor)bereiten, vorhaben, erwerben', true],
  ['ein wenig', '(um) ein wenig', true],
  ['der Feind', 'feindlich; (Subst.) der Feind', true],
  ['alle', 'jeder, ganz; (Pl.) alle', true],
  ['der Antrag', 'der Antrag (im Senat), die Meinung, der Satz, der Sinn', true],
  ['sicher', 'sicher (vor)', true],
  ['domina', 'dominus (m)', false],
  ['m', 'dominus (m)', false],
];
for (const [input, answer, expected] of EXAMPLES) {
  const { isCorrect } = compareAnswers(input, answer);
  if (isCorrect !== expected)
    errors.push(`Beispiel: "${input}" für "${answer}" sollte ${expected ? 'richtig' : 'falsch'} sein`);
}

const hint = (input, answer, expected) => {
  const r = compareAnswers(input, answer);
  if (r.hint !== expected) errors.push(`Beispiel: "${input}" für "${answer}" sollte Hinweis ${expected} haben, hat ${r.hint}`);
};
hint('cogitare', 'cōgitāre, cōgitat', null);
hint('Madchen', 'das Mädchen', 'article-accent');
hint('Herr', 'der Herr', 'article');

if (errors.length) {
  console.error(errors.join('\n'));
  console.error(`\n✘ ${errors.length} Fehler (${checked} Antworten geprüft)`);
  process.exit(1);
}
console.log(`✔ ${checked} Antworten geprüft, 0 Fehler`);
