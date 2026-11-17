export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Browsers have no Latin voice. An Italian voice reads Latin quite naturally,
// once grammar notes "(m)", "(Präp. m. Akk.)" and length marks are removed.
const forLatin = (text) =>
  text.replace(/\([^()]*\)/g, ' ').normalize('NFD').replace(/[\u0304\u0306]/g, '').normalize('NFC').trim();

export function speak(text, lang = 'la') {
  if (!ttsSupported) return;
  window.speechSynthesis.cancel();
  const latin = lang === 'la';
  const utt = new SpeechSynthesisUtterance(latin ? forLatin(text) : text);
  utt.lang = latin ? 'it-IT' : lang;
  utt.rate = 0.85;
  window.speechSynthesis.speak(utt);
}
