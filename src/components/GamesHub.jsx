import React, { useState, useEffect, useRef, useMemo } from 'react';
import { buildWordPool, vocabByGrade } from '../data/vocab';
import FloatingBack from './FloatingBack';
import BackButton from './BackButton';
import { shuffle } from '../utils/shuffle';
import { pickDistractors } from '../utils/distractors';
import { storageGet, storageSet } from '../utils/storage';
import { useBackHandler } from '../utils/backStack';
import ConfirmDialog from './ConfirmDialog';

// ─── Games Hub Menu ──────────────────────────────────────────────────────────
export default function GamesHub({ selectedGrades, onBack }) {
  const [game, setGame] = useState(null);
  const [scores, setScores] = useState(() => ({
    survival:  Number(storageGet('gm_survival')  || 0),
    timeattack: Number(storageGet('gm_timeattack') || 0),
    streak:    Number(storageGet('gm_streak')    || 0),
  }));

  const saveScore = (type, val) => {
    setScores(s => ({ ...s, [type]: val }));
    storageSet(`gm_${type}`, val);
  };

  // No grade selected → play with all grades. Deduplicate identical es/de pairs.
  const wordPool = useMemo(() => {
    const grades = selectedGrades.length ? selectedGrades : Object.keys(vocabByGrade);
    const seen = new Set();
    return buildWordPool(grades).filter(w => {
      const k = `${w.la}|${w.de}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
  }, [selectedGrades]);

  if (game === 'survival')   return <ArcadeGame key="survival"   type="survival"   wordPool={wordPool} highscore={scores.survival}   onSave={v => saveScore('survival',v)}   onBack={() => setGame(null)} />;
  if (game === 'timeattack') return <ArcadeGame key="timeattack" type="timeattack" wordPool={wordPool} highscore={scores.timeattack} onSave={v => saveScore('timeattack',v)} onBack={() => setGame(null)} />;
  if (game === 'streak')     return <ArcadeGame key="streak"     type="streak"     wordPool={wordPool} highscore={scores.streak}    onSave={v => saveScore('streak',v)}    onBack={() => setGame(null)} />;

  return (
    <>
    <FloatingBack onClick={onBack} />
    <div className="animate-slide-up space-y-4">
      <div className="flex items-center gap-3">
        <BackButton onClick={onBack} />
        <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100">Spiele</h2>
      </div>

      {selectedGrades.length > 0 && (
        <div className="text-xs text-center text-gray-400">{wordPool.length} Wörter aus {selectedGrades.length} Lektion(en)</div>
      )}
      {selectedGrades.length === 0 && (
        <div className="text-xs text-center text-violet-500 font-medium">{wordPool.length} Wörter aus allen Lektionen (keine ausgewählt) · Wähle auf der Startseite Lektionen für gezielteres Training</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <GameCard
          icon="❤️" bg="var(--game-bg-red)" color="#dc2626"
          title="Überleben"
          desc="3 Leben · Timer beschleunigt mit jedem Treffer"
          badge={`Rekord: ${scores.survival} Pkt.`}
          btnLabel="Spielen ❤️"
          btnColor="#dc2626"
          disabled={!wordPool.length}
          onClick={() => setGame('survival')}
        />
        <GameCard
          icon="⏱️" bg="var(--game-bg-green)" color="#16a34a"
          title="Gegen die Zeit"
          desc="60 Sekunden · Richtig +2s, Falsch −1s"
          badge={`Rekord: ${scores.timeattack} Pkt.`}
          btnLabel="Spielen ⏱️"
          btnColor="#16a34a"
          disabled={!wordPool.length}
          onClick={() => setGame('timeattack')}
        />
        <GameCard
          icon="🔥" bg="var(--game-bg-amber)" color="#d97706"
          title="Vokabel-Serie"
          desc="Unbegrenzte Zeit · Ein Fehler beendet die Serie"
          badge={`Rekord: ${scores.streak} Treffer`}
          btnLabel="Spielen 🔥"
          btnColor="#d97706"
          disabled={!wordPool.length}
          onClick={() => setGame('streak')}
        />
      </div>
    </div>
    </>
  );
}

function GameCard({ icon, bg, color, title, desc, badge, btnLabel, btnColor, onClick, disabled }) {
  return (
    <div className={`card flex flex-col justify-between transition-all ${disabled ? 'opacity-50' : 'hover:shadow-xl'}`} style={{ background: bg }}>
      <div>
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-3" style={{ background: `${color}22` }}>
          {icon}
        </div>
        <h3 className="font-bold text-gray-800 dark:text-gray-100 mb-1">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-xs mb-3">{desc}</p>
        <div className="text-xs font-bold" style={{ color }}>{badge}</div>
      </div>
      <button onClick={disabled ? undefined : onClick} disabled={disabled} className="btn mt-4 text-white text-sm font-bold" style={{ background: disabled ? '#9ca3af' : btnColor }}>
        {disabled ? 'Lektion wählen ↩' : btnLabel}
      </button>
    </div>
  );
}

// ─── Arcade Game (Survival / Time Attack / Streak) ───────────────────────────
const TIME_ATTACK_MS = 60000;
const SURVIVAL_START_MS = 10000;

function ArcadeGame({ type, wordPool, highscore, onSave, onBack }) {
  const [score, setScore]     = useState(0);
  const [lives, setLives]     = useState(3);
  const [timeLeft, setTimeLeft]     = useState(SURVIVAL_START_MS);
  const [timeLeftSec, setTimeLeftSec] = useState(TIME_ATTACK_MS / 1000);
  const [question, setQuestion]  = useState(null);
  const [gameOver, setGameOver]  = useState(false);
  const [feedback, setFeedback]  = useState(null);
  const [fbShow, setFbShow]      = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [showExit, setShowExit]  = useState(false);

  // Back button: ask while playing, leave directly on the result screen
  useBackHandler(true, () => {
    if (overRef.current) { onBack(); return; }
    setShowExit(true);
    return false;
  });

  // Refs hold the live game values so timers never read stale state
  const speedRef   = useRef(SURVIVAL_START_MS);
  const scoreRef   = useRef(0);
  const livesRef   = useRef(3);
  const overRef    = useRef(false);
  const highRef    = useRef(highscore);
  const timersRef  = useRef([]);
  // Survival: remaining ms of the current question while its timer is paused
  const survivalRemRef = useRef({ qid: null, ms: SURVIVAL_START_MS });
  // Time attack: deadline while running, remaining ms while paused
  const deadlineRef = useRef(0);
  const taRemRef    = useRef(TIME_ATTACK_MS);

  const later = (fn, ms) => { timersRef.current.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timersRef.current.forEach(clearTimeout); timersRef.current = []; };
  useEffect(() => clearTimers, []);

  const updateScore = (v) => { scoreRef.current = v; setScore(v); };
  const updateLives = (v) => { livesRef.current = v; setLives(v); };

  const genQuestion = () => {
    if (!wordPool.length || overRef.current) return;
    const item = wordPool[Math.floor(Math.random() * wordPool.length)];
    const isLaToDe = Math.random() > 0.5;
    const correct  = isLaToDe ? item.de : item.la;
    const opts = shuffle([correct, ...pickDistractors(item, isLaToDe ? 'la2de' : 'de2la', wordPool)]);
    setQuestion({ id: `${item.la}-${Date.now()}-${Math.random()}`, text: isLaToDe ? `Was heißt '${item.la}'?` : `Was heißt '${item.de}' auf Latein?`, opts, correct, topic: item.topic });
    setFeedback(null); setFbShow(false);
    if (type === 'survival') setTimeLeft(speedRef.current);
  };

  const endGame = () => {
    if (overRef.current) return;
    overRef.current = true;
    clearTimers();
    setGameOver(true);
    const final = scoreRef.current;
    if (final > highRef.current) { setNewRecord(true); onSave(final); }
  };

  const loseLife = () => {
    const nl = livesRef.current - 1;
    updateLives(nl);
    later(() => { if (nl <= 0) endGame(); else genQuestion(); }, 1200);
  };

  const startGame = () => {
    clearTimers();
    overRef.current = false;
    highRef.current = highscore;
    updateScore(0); updateLives(3);
    setGameOver(false); setNewRecord(false);
    setFeedback(null); setFbShow(false);
    speedRef.current = SURVIVAL_START_MS;
    taRemRef.current = TIME_ATTACK_MS;
    setTimeLeft(SURVIVAL_START_MS);
    setTimeLeftSec(TIME_ATTACK_MS / 1000);
    genQuestion();
  };

  useEffect(() => { startGame(); }, [type]);

  // Survival timer (paused during feedback and the exit dialog)
  useEffect(() => {
    if (gameOver || type !== 'survival' || fbShow || showExit || !question) return;
    const qid = question.id;
    const rem = survivalRemRef.current;
    const deadline = Date.now() + (rem.qid === qid ? rem.ms : speedRef.current);
    const iv = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(iv);
        setFeedback({ isCorrect: false, picked: null }); setFbShow(true);
        loseLife();
      }
    }, 50);
    return () => {
      clearInterval(iv);
      survivalRemRef.current = { qid, ms: Math.max(0, deadline - Date.now()) };
    };
  }, [question?.id, gameOver, fbShow, showExit, type]);

  // Time attack clock (deadline-based, paused during the exit dialog)
  useEffect(() => {
    if (gameOver || type !== 'timeattack' || showExit) return;
    deadlineRef.current = Date.now() + taRemRef.current;
    const tick = () => {
      const left = deadlineRef.current - Date.now();
      setTimeLeftSec(Math.max(0, Math.ceil(left / 1000)));
      if (left <= 0) { clearInterval(iv); endGame(); }
    };
    const iv = setInterval(tick, 200);
    tick();
    return () => {
      clearInterval(iv);
      taRemRef.current = Math.max(0, deadlineRef.current - Date.now());
    };
  }, [gameOver, type, showExit]);

  const adjustClock = (ms) => {
    deadlineRef.current += ms;
    setTimeLeftSec(Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000)));
  };

  const pick = (opt) => {
    if (fbShow || gameOver) return;
    const isCorrect = opt === question.correct;
    setFeedback({ isCorrect, picked: opt }); setFbShow(true);
    if (isCorrect) {
      const ns = scoreRef.current + 1;
      updateScore(ns);
      if (type === 'timeattack') adjustClock(2000);
      else if (type === 'survival') speedRef.current = Math.max(2500, SURVIVAL_START_MS - ns * 150);
      later(genQuestion, 400);
    } else if (type === 'timeattack') {
      adjustClock(-1000);
      later(genQuestion, 600);
    } else if (type === 'survival') {
      loseLife();
    } else {
      // Streak: the first mistake ends the run
      later(endGame, 1200);
    }
  };

  const restart = startGame;

  const pct = type === 'survival' ? (timeLeft / speedRef.current) * 100 : Math.min(100, (timeLeftSec / 60) * 100);
  const barColor = type === 'survival'
    ? (pct > 50 ? '#6366f1' : pct > 25 ? '#f59e0b' : '#dc2626')
    : (timeLeftSec > 20 ? '#16a34a' : timeLeftSec > 8 ? '#f59e0b' : '#dc2626');

  const typeConfig = {
    survival:   { label: '❤️ Supervivencia', scoreLabel: 'Punkte' },
    timeattack: { label: '⏱️ Contrarreloj',  scoreLabel: 'Punkte' },
    streak:     { label: '🔥 Racha',          scoreLabel: 'Treffer' },
  };
  const cfg = typeConfig[type];

  return (
    <div className="relative">
      <div className="card animate-slide-up">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setShowExit(true)} className="text-gray-400 hover:text-red-500 font-semibold text-sm">← Salir</button>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-gray-600 dark:text-gray-400">{cfg.scoreLabel}: <span className="text-gray-900 dark:text-gray-100">{score}</span></span>
            {type === 'survival'   && <span>{[1,2,3].map(h => <span key={h}>{h <= lives ? '❤️' : '🖤'}</span>)}</span>}
            {type === 'timeattack' && <span className="font-bold text-emerald-600">⏱️ {timeLeftSec}s</span>}
            {type === 'streak'     && <span className="font-bold text-amber-500">🏆 {highscore}</span>}
          </div>
        </div>

        {!gameOver && type !== 'streak' && (
          <div className="w-full bg-gray-100 dark:bg-gray-800 h-2.5 rounded-full mb-6 overflow-hidden">
            <div className="h-full transition-all duration-75 rounded-full" style={{ width: `${pct}%`, background: barColor }} />
          </div>
        )}

        {question && !gameOver && (
          <div>
            <div className="mb-5 p-4 sm:p-5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 text-center">
              {question.topic && <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide block mb-1">{question.topic}</span>}
              <p className="text-base sm:text-xl font-bold dark:text-gray-100">{question.text}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {question.opts.map((opt, i) => {
                let cls = 'btn-outline';
                if (fbShow) {
                  if (opt === question.correct) cls = 'border-2 bg-green-100 dark:bg-green-950 border-green-500 text-green-800 dark:text-green-200';
                  else if (opt === feedback?.picked) cls = 'border-2 bg-red-100 dark:bg-red-950 border-red-500 text-red-800 dark:text-red-200 animate-shake';
                  else cls = 'btn-outline opacity-40';
                }
                return (
                  <button key={i} onClick={() => pick(opt)} disabled={fbShow}
                    className={`btn text-left py-3 text-sm ${cls}`}>
                    {opt}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {gameOver && (
          <div className="text-center py-4 space-y-4 animate-slide-up">
            <div className="text-5xl">{newRecord ? '🏆' : '🎮'}</div>
            <h3 className="text-2xl font-extrabold">Spiel vorbei!</h3>
            {newRecord && <p className="text-emerald-600 font-bold animate-bounce">Neuer Rekord! 🎉</p>}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-5 max-w-xs mx-auto">
              <div className="flex justify-between py-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-gray-500 dark:text-gray-400">Punkte:</span>
                <span className="font-bold dark:text-gray-100">{score}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-500 dark:text-gray-400">Rekord:</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{highscore}</span>
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={restart} className="btn btn-primary">Nochmal spielen</button>
              <button onClick={onBack} className="btn btn-outline">Menü</button>
            </div>
          </div>
        )}
      </div>

      {showExit && (
        <ConfirmDialog
          title="Spiel abbrechen?"
          text="Aktuelle Punkte gehen verloren. Rekorde bleiben gespeichert."
          confirmLabel="Ja, beenden"
          cancelLabel="Weiterspielen"
          onConfirm={onBack}
          onCancel={() => setShowExit(false)}
        />
      )}
    </div>
  );
}
