import { AnimatePresence, motion } from "framer-motion";
// AnimatePresence kept for the invalid-move message below
import { RotateCcw, Timer, LogOut } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { GameBoard } from "@/components/game/GameBoard";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { DIFFICULTIES, ROUND_DURATION_MS } from "@/lib/difficulty";
import { formatMs } from "@/lib/format";
import { computeScore } from "@/lib/scoring";
import { SFX } from "@/lib/audio";
import { useGame } from "@/hooks/useGame";
import type { Difficulty, GameResult } from "@/types";

interface Props {
  playerName: string;
  difficulty: Difficulty;
  onComplete: (result: GameResult) => void;
}

export function GameScreen({ playerName, difficulty, onComplete }: Props) {
  const game = useGame(difficulty);
  const cfg = DIFFICULTIES[difficulty];

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

  const timerLow = game.remainingMs <= 30_000 && game.phase === "running";
  const timerCritical = game.remainingMs <= 10_000 && game.phase === "running";
  const timerStarted = game.startedAt != null;
  const gameOver = game.phase === "won" || game.phase === "timeout";

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
        <div className="max-w-4xl mx-auto flex items-center gap-2 sm:gap-3 flex-wrap">
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
            animate={
              timerCritical
                ? { scale: [1, 1.07, 1] }
                : timerLow
                  ? { scale: [1, 1.03, 1] }
                  : { scale: 1 }
            }
            transition={{
              duration: timerCritical ? 0.65 : 1.1,
              repeat: timerLow ? Infinity : 0,
              ease: "easeInOut",
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-mono transition ${
              timerCritical
                ? "border-rose-400/50 bg-rose-500/15 text-rose-100"
                : timerLow
                  ? "border-rose-300/30 bg-rose-400/10 text-rose-200"
                  : "border-white/10 bg-white/[0.06] text-white/85"
            }`}
          >
            <Timer className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="tabular-nums">
              {timerStarted ? formatMs(game.remainingMs) : formatMs(ROUND_DURATION_MS)}
            </span>
          </motion.div>

          {/* Moves */}
          <div className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/[0.06] text-sm tabular-nums text-white/80 flex-shrink-0">
            <span className="text-white/45 mr-1">Moves</span>
            {game.moves}
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
        <div className="max-w-4xl mx-auto">
          <p className="text-[12px] text-white/40 leading-relaxed">
            <span className="text-white/60">Move all discs from the left tower to the right tower.</span>
            {" "}Only one disc at a time — bigger discs cannot sit on smaller ones.
            {" "}<span className="text-white/35">Click a disc to pick it up, then click a tower to place it.</span>
          </p>
        </div>
      </div>

      {/* ── Board (dominant) ── */}
      <div className="flex-1 flex flex-col px-3 sm:px-6">
        <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
          <div className="flex-1 glass-card gradient-border p-3 sm:p-5 flex flex-col">
            <GameBoard
              rods={game.rods}
              discCount={game.discCount}
              selectedRod={game.selectedRod}
              invalidRod={game.invalidRod}
              invalidNonce={game.invalidNonce}
              disabled={gameOver}
              onRodClick={game.handleRodClick}
              onDragMove={(from, to) => game.tryMove(from, to)}
              boardHeight={440}
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
        </div>
      </div>

      {/* ── Bottom action bar ── */}
      <div className="flex-shrink-0 px-4 py-3 sm:px-6 sm:py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
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
