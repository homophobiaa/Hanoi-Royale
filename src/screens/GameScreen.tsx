import { AnimatePresence, motion } from "framer-motion";
// AnimatePresence kept for the invalid-move message below
import { RotateCcw, Timer, LogOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { GameBoard } from "@/components/game/GameBoard";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { DIFFICULTIES, ROUND_DURATION_MS } from "@/lib/difficulty";
import { formatMs, formatNumber } from "@/lib/format";
import { computeScore } from "@/lib/scoring";
import { SFX } from "@/lib/audio";
import { useGame } from "@/hooks/useGame";
import type { Difficulty, GameResult, ScoreRecord } from "@/types";

interface Props {
  playerName: string;
  difficulty: Difficulty;
  scores: ScoreRecord[];
  onComplete: (result: GameResult) => void;
}

type MoveTone = "neutral" | "optimal" | "good" | "warning" | "danger";
type TimerPressure = "normal" | "warning" | "urgent" | "critical";

function getMoveFeedback(moves: number, minMoves: number): { tone: MoveTone; label: string; className: string } {
  if (moves === 0) {
    return {
      tone: "neutral",
      label: "Optimal range",
      className: "border-white/10 bg-white/[0.06] text-white/80",
    };
  }

  const ratio = moves / minMoves;
  if (ratio <= 1.05) {
    return {
      tone: "optimal",
      label: "Optimal range",
      className: "border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-200",
    };
  }
  if (ratio <= 1.25) {
    return {
      tone: "good",
      label: "Good pace",
      className: "border-amber-300/25 bg-amber-400/[0.08] text-amber-200",
    };
  }
  if (ratio <= 1.6) {
    return {
      tone: "warning",
      label: "Efficiency dropping",
      className: "border-orange-300/30 bg-orange-400/[0.1] text-orange-200",
    };
  }
  return {
    tone: "danger",
    label: "High move count",
    className: "border-rose-300/35 bg-rose-500/[0.12] text-rose-200",
  };
}

function getTimerPressure(remainingMs: number, running: boolean): TimerPressure {
  if (!running) return "normal";
  if (remainingMs <= 10_000) return "critical";
  if (remainingMs <= 30_000) return "urgent";
  if (remainingMs <= 60_000) return "warning";
  return "normal";
}

function timerClass(pressure: TimerPressure): string {
  switch (pressure) {
    case "critical":
      return "border-rose-400/55 bg-rose-500/15 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.22)]";
    case "urgent":
      return "border-orange-300/45 bg-orange-400/[0.12] text-orange-100 shadow-[0_0_18px_rgba(251,146,60,0.18)]";
    case "warning":
      return "border-amber-300/35 bg-amber-400/[0.1] text-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.14)]";
    default:
      return "border-white/10 bg-white/[0.06] text-white/85";
  }
}

function timerAnimation(pressure: TimerPressure) {
  switch (pressure) {
    case "critical":
      return { scale: [1, 1.08, 1] };
    case "urgent":
      return { scale: [1, 1.05, 1] };
    case "warning":
      return { scale: [1, 1.025, 1] };
    default:
      return { scale: 1 };
  }
}

function timerTransition(pressure: TimerPressure) {
  switch (pressure) {
    case "critical":
      return { duration: 0.75, repeat: Infinity, repeatDelay: 0.7, ease: "easeInOut" };
    case "urgent":
      return { duration: 0.9, repeat: Infinity, repeatDelay: 1.4, ease: "easeInOut" };
    case "warning":
      return { duration: 1.1, repeat: Infinity, repeatDelay: 2.2, ease: "easeInOut" };
    default:
      return { duration: 0.2, repeat: 0, ease: "easeInOut" };
  }
}

export function GameScreen({ playerName, difficulty, scores, onComplete }: Props) {
  const game = useGame(difficulty);
  const cfg = DIFFICULTIES[difficulty];
  const topScores = useMemo(
    () => [...scores].sort((a, b) => b.score - a.score).slice(0, 5),
    [scores]
  );

  // Keep a ref to the latest onComplete so we never call a stale version.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Single-fire guard: once we call onComplete, never call it again for this
  // game instance (guards against StrictMode double-invocation).
  const firedRef = useRef(false);

  const completeRound = useCallback(() => {
    if (game.phase !== "won" && game.phase !== "timeout") return;
    if (firedRef.current) return;
    firedRef.current = true;

    const reason: GameResult["reason"] = game.phase === "won" ? "solved" : "timeout";
    const breakdown = computeScore({
      difficulty: game.difficulty,
      discs: game.discCount,
      moves: game.moves,
      remainingSeconds: Math.floor(game.remainingMs / 1000),
      solved: game.phase === "won",
      progressPercent: game.progressPercent,
    });
    const snapshot: GameResult = {
      playerName: playerName.trim() || "Player",
      difficulty: game.difficulty,
      discs: game.discCount,
      moves: game.moves,
      minMoves: game.minMoves,
      remainingMs: game.remainingMs,
      elapsedMs: game.elapsedMs,
      solved: game.phase === "won",
      progressPercent: game.progressPercent,
      efficiency: game.efficiency,
      score: breakdown.finalScore,
      reason,
      completedAt: Date.now(),
    };
    console.debug("[Hanoi Royale] result object before rendering Result screen", snapshot);
    onCompleteRef.current(snapshot);
  }, [
    game.difficulty,
    game.discCount,
    game.efficiency,
    game.elapsedMs,
    game.minMoves,
    game.moves,
    game.phase,
    game.progressPercent,
    game.remainingMs,
    playerName,
  ]);

  const timerPressure = getTimerPressure(game.remainingMs, game.phase === "running");
  const moveFeedback = getMoveFeedback(game.moves, game.minMoves);
  const timerStarted = game.startedAt != null;
  const gameOver = game.phase === "won" || game.phase === "timeout";

  useEffect(() => {
    if (timerPressure !== "urgent" && timerPressure !== "critical") return;
    const id = window.setInterval(() => SFX.tick(), 3000);
    return () => window.clearInterval(id);
  }, [timerPressure]);

  // Primary completion bridge: run as soon as React commits the terminal state.
  useLayoutEffect(() => {
    completeRound();
  }, [completeRound]);

  // Defensive fallback: if a terminal render is visible but effects are delayed
  // or interrupted, queue the handoff without throwing during render.
  if (gameOver && !firedRef.current) {
    queueMicrotask(completeRound);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col min-h-screen"
    >
      {/* ── Compact HUD ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 sm:px-6 sm:pt-5">
        <div className="max-w-6xl mx-auto flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Player + difficulty */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="chip min-w-0 truncate max-w-[140px]">
              <span className="h-1.5 w-1.5 rounded-full bg-royale-mint flex-shrink-0" />
              <span className="truncate">{playerName}</span>
            </span>
            <span className="chip flex-shrink-0">
              {cfg.label} · ×{cfg.multiplier.toFixed(2)}
            </span>
          </div>

          {/* Timer */}
          <motion.div
            animate={timerAnimation(timerPressure)}
            transition={timerTransition(timerPressure)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-mono transition-all duration-500 ${timerClass(timerPressure)}`}
          >
            <Timer className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="tabular-nums">
              {timerStarted ? formatMs(game.remainingMs) : formatMs(ROUND_DURATION_MS)}
            </span>
          </motion.div>

          {/* Moves */}
          <div className={`px-3 py-1.5 rounded-xl border text-sm tabular-nums flex-shrink-0 transition-all duration-500 ${moveFeedback.className}`}>
            <span className="text-white/45 mr-1">Moves</span>
            <span>{game.moves}</span>
            <span className="ml-2 text-[10px] font-sans uppercase tracking-[0.14em] text-white/35 hidden sm:inline">
              {moveFeedback.label}
            </span>
          </div>

          {/* Score preview */}
          <div className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.06] text-sm flex-shrink-0">
            <span className="text-white/45 mr-1">Score</span>
            <AnimatedNumber value={game.scorePreview} className="font-display tracking-tight" />
          </div>
        </div>
      </div>

      {/* ── Instruction strip ── */}
      <div className="flex-shrink-0 px-4 pb-2 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <p className="text-[12px] text-white/40 leading-relaxed">
            <span className="text-white/60">Move all discs from the left tower to the right tower.</span>
            {" "}Only one disc at a time — bigger discs cannot sit on smaller ones.
            {" "}<span className="text-white/35">Click a disc to pick it up, then click a tower to place it.</span>
          </p>
        </div>
      </div>

      {/* ── Board (dominant) ── */}
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center px-3 sm:px-6 py-1">
        <div className="mx-auto w-[min(78vw,1250px)] max-w-[calc(100vw-2rem)] min-w-0 rounded-[28px] border border-white/[0.055] bg-white/[0.03] backdrop-blur-xl shadow-inner-glass p-2 sm:p-3 lg:p-4 flex flex-col">
            <GameBoard
              rods={game.rods}
              discCount={game.discCount}
              selectedRod={game.selectedRod}
              invalidRod={game.invalidRod}
              invalidNonce={game.invalidNonce}
              disabled={gameOver}
              onRodClick={game.handleRodClick}
              onDragMove={(from, to) => game.tryMove(from, to)}
              boardHeight="clamp(560px, 68vh, 760px)"
            />

            {/* Invalid move message */}
            <AnimatePresence>
              {game.invalidNonce > 0 && !gameOver && (
                <motion.p
                  key={game.invalidNonce}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="mt-2 text-center text-[12px] text-rose-300/80"
                >
                  Bigger discs cannot go on smaller discs.
                </motion.p>
              )}
            </AnimatePresence>
        </div>
        <LiveLeaderboard scores={topScores} className="mt-3 w-[min(78vw,1250px)] max-w-[calc(100vw-2rem)] xl:hidden" />
      </div>

      <LiveLeaderboard
        scores={topScores}
        className="hidden xl:block fixed right-8 top-1/2 z-20 w-60 -translate-y-1/2"
      />

      {/* ── Bottom action bar ── */}
      <div className="flex-shrink-0 px-4 py-2 sm:px-6 sm:py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <button
            onClick={() => {
              SFX.click();
              onCompleteRef.current({
                playerName: playerName.trim() || "Player",
                difficulty: game.difficulty,
                discs: game.discCount,
                moves: game.moves,
                minMoves: game.minMoves,
                remainingMs: game.remainingMs,
                elapsedMs: game.elapsedMs,
                solved: false,
                progressPercent: game.progressPercent,
                efficiency: game.efficiency,
                score: computeScore({
                  difficulty: game.difficulty,
                  discs: game.discCount,
                  moves: game.moves,
                  remainingSeconds: Math.floor(game.remainingMs / 1000),
                  solved: false,
                  progressPercent: game.progressPercent,
                }).finalScore,
                reason: "quit",
                completedAt: Date.now(),
              });
            }}
            disabled={gameOver}
            className="btn-ghost text-white/50 hover:text-white/80 disabled:opacity-30 flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" /> Quit
          </button>

          <button
            aria-label="Restart round"
            onClick={() => {
              SFX.click();
              game.reset();
            }}
            disabled={gameOver}
            className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition disabled:opacity-30"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>

    </motion.div>
  );
}

function LiveLeaderboard({ scores, className = "" }: { scores: ScoreRecord[]; className?: string }) {
  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.12, duration: 0.35 }}
      className={`glass-card p-3 self-start ${className}`}
    >
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 mb-2">
        Top Scores
      </div>
      {scores.length === 0 ? (
        <div className="text-xs text-white/35 py-2">No scores yet.</div>
      ) : (
        <div className="space-y-1.5">
          {scores.map((score, index) => (
            <div
              key={score.id}
              className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 text-xs"
            >
              <span className="text-white/35 tabular-nums">{index + 1}.</span>
              <div className="min-w-0">
                <div className="truncate text-white/75 leading-tight">{score.playerName}</div>
                <DifficultyBadge difficulty={score.difficulty} />
              </div>
              <span className="font-mono tabular-nums text-white/85">
                {formatNumber(score.score)}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.aside>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  const cfg = DIFFICULTIES[difficulty] ?? DIFFICULTIES.medium;
  const tone =
    difficulty === "easy"
      ? "text-emerald-200 border-emerald-300/20 bg-emerald-400/10"
      : difficulty === "medium"
        ? "text-violet-200 border-violet-300/20 bg-violet-400/10"
        : difficulty === "hard"
          ? "text-rose-200 border-rose-300/20 bg-rose-400/10"
          : "text-amber-100 border-amber-300/25 bg-amber-400/10";

  return (
    <span className={`mt-0.5 inline-flex px-1.5 py-0.5 rounded-full border text-[9px] leading-none ${tone}`}>
      {cfg.label}
    </span>
  );
}
