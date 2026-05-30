import { useCallback, useRef, useState } from "react";
import { AuroraBackground } from "@/components/AuroraBackground";
import { MenuScreen } from "@/screens/MenuScreen";
import { NewPlayerScreen } from "@/screens/NewPlayerScreen";
import { GameScreen } from "@/screens/GameScreen";
import { ResultScreen } from "@/screens/ResultScreen";
import { LeaderboardScreen } from "@/screens/LeaderboardScreen";
import { ScoringScreen } from "@/screens/ScoringScreen";
import { useSettings } from "@/hooks/useSettings";
import {
  appendScore,
  clearAllScores,
  loadLatestResult,
  loadScores,
  saveLatestResult,
} from "@/storage/storage";
import { computeScore } from "@/lib/scoring";
import { DIFFICULTIES } from "@/lib/difficulty";
import type { Difficulty, GameResult, ScoreRecord, ScreenId } from "@/types";

const DEFAULT_PLAYER_NAME = "Player";

function isDifficulty(value: unknown): value is Difficulty {
  return value === "easy" || value === "medium" || value === "hard";
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sanitizeResult(input: Partial<GameResult> | null | undefined, fallbackName: string): GameResult {
  const difficulty = isDifficulty(input?.difficulty) ? input.difficulty : "medium";
  const cfg = DIFFICULTIES[difficulty];
  const discs = Math.max(1, Math.round(finiteNumber(input?.discs, cfg.discs)));
  const moves = Math.max(0, Math.round(finiteNumber(input?.moves, 0)));
  const minMoves = Math.max(1, Math.round(finiteNumber(input?.minMoves, Math.pow(2, discs) - 1)));
  const remainingMs = Math.max(0, Math.round(finiteNumber(input?.remainingMs, 0)));
  const elapsedMs = Math.max(0, Math.round(finiteNumber(input?.elapsedMs, 0)));
  const progressPercent = Math.max(0, Math.min(1, finiteNumber(input?.progressPercent, 0)));
  const efficiency = Math.max(0, Math.min(1, finiteNumber(input?.efficiency, moves > 0 ? minMoves / moves : 0)));
  const reason =
    input?.reason === "solved" || input?.reason === "timeout" || input?.reason === "quit"
      ? input.reason
      : input?.solved
        ? "solved"
        : "timeout";
  const solved = typeof input?.solved === "boolean" ? input.solved : reason === "solved";
  const score =
    typeof input?.score === "number" && Number.isFinite(input.score)
      ? input.score
      : computeScore({
          difficulty,
          discs,
          moves,
          remainingSeconds: Math.floor(remainingMs / 1000),
          solved,
          progressPercent,
        }).finalScore;

  return {
    playerName: (input?.playerName || fallbackName || DEFAULT_PLAYER_NAME).trim() || DEFAULT_PLAYER_NAME,
    difficulty,
    discs,
    moves,
    minMoves,
    remainingMs,
    elapsedMs,
    solved,
    progressPercent,
    efficiency,
    score,
    reason,
    completedAt: Math.round(finiteNumber(input?.completedAt, Date.now())),
  };
}

export default function App() {
  const { settings, toggleMute } = useSettings();

  const [screen, setScreen] = useState<ScreenId>("menu");
  const [playerName, setPlayerName] = useState("");
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [lastResult, setLastResult] = useState<GameResult | null>(() =>
    sanitizeResult(loadLatestResult(), DEFAULT_PLAYER_NAME)
  );
  const [latestScoreId, setLatestScoreId] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreRecord[]>(() => loadScores());
  // Increment to force GameScreen remount for a fresh game
  const gameKeyRef = useRef(0);
  const [gameKey, setGameKey] = useState(0);

  const refreshScores = useCallback(() => setScores(loadScores()), []);

  const navigate = useCallback((s: ScreenId) => setScreen(s), []);

  const handleStartGame = useCallback((name: string, diff: Difficulty) => {
    setPlayerName(name);
    setDifficulty(diff);
    gameKeyRef.current += 1;
    setGameKey(gameKeyRef.current);
    setScreen("game");
  }, []);

  const handleRoundComplete = useCallback(
    (result: GameResult) => {
      const safeResult = sanitizeResult(result, playerName);
      console.debug("[Hanoi Royale] score calculation", {
        result: safeResult,
        finalScore: safeResult.score,
      });
      setLastResult(safeResult);
      saveLatestResult(safeResult);

      try {
        const saved = appendScore({
          playerId: `session_${Date.now()}`,
          playerName: safeResult.playerName,
          difficulty: safeResult.difficulty,
          discs: safeResult.discs,
          score: safeResult.score,
          moves: safeResult.moves,
          minMoves: safeResult.minMoves,
          efficiency: safeResult.efficiency,
          timeUsedMs: safeResult.elapsedMs,
          timeLeftMs: safeResult.remainingMs,
          solved: safeResult.solved,
        });
        setLatestScoreId(saved.id);
        refreshScores();
      } catch (error) {
        console.error("[Hanoi Royale] leaderboard save failed; showing result anyway", error);
        setLatestScoreId(null);
      }
      setScreen("result");
    },
    [playerName, refreshScores]
  );

  return (
    <>
      <AuroraBackground />
      <main className="relative">
        <>
          {screen === "menu" && (
            <MenuScreen
              key="menu"
              muted={settings.muted}
              onToggleMute={toggleMute}
              onStartNewPlayer={() => navigate("new-player")}
              onLeaderboard={() => {
                setLatestScoreId(null);
                navigate("leaderboard");
              }}
              onScoring={() => navigate("scoring")}
              onClearScores={() => {
                clearAllScores();
                refreshScores();
              }}
              scores={scores}
            />
          )}

          {screen === "new-player" && (
            <NewPlayerScreen
              key="new-player"
              onStart={handleStartGame}
              onBack={() => navigate("menu")}
            />
          )}

          {screen === "game" && (
            <GameScreen
              key={`game-${gameKey}`}
              playerName={playerName}
              difficulty={difficulty}
              onComplete={handleRoundComplete}
            />
          )}

          {screen === "result" && (
            <ResultScreen
              key="result"
              result={lastResult ? sanitizeResult(lastResult, playerName) : sanitizeResult(loadLatestResult(), playerName)}
              playerName={lastResult?.playerName || playerName || DEFAULT_PLAYER_NAME}
              onNextPlayer={() => navigate("new-player")}
              onPlayAgain={() => {
                gameKeyRef.current += 1;
                setGameKey(gameKeyRef.current);
                setScreen("game");
              }}
              onLeaderboard={() => navigate("leaderboard")}
              onScoring={() => navigate("scoring")}
              onMenu={() => navigate("menu")}
            />
          )}

          {screen === "leaderboard" && (
            <LeaderboardScreen
              key="leaderboard"
              scores={scores}
              latestScoreId={latestScoreId}
              onBack={() => navigate("menu")}
              onClearAll={() => {
                clearAllScores();
                refreshScores();
              }}
            />
          )}

          {screen === "scoring" && (
            <ScoringScreen key="scoring" onBack={() => navigate("menu")} />
          )}
        </>
      </main>
    </>
  );
}
