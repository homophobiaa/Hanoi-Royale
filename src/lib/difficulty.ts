import type { Difficulty, DifficultyConfig } from "@/types";

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy: {
    id: "easy",
    label: "Easy",
    discs: 3,
    baseScore: 1000,
    multiplier: 1.0,
    tagline: "Quick introduction",
    description: "3 discs. Quick introduction with the lowest score potential.",
  },
  medium: {
    id: "medium",
    label: "Medium",
    discs: 5,
    baseScore: 3000,
    multiplier: 1.8,
    tagline: "Recommended challenge",
    description: "5 discs. Recommended challenge with higher score potential.",
  },
  hard: {
    id: "hard",
    label: "Hard",
    discs: 6,
    baseScore: 5000,
    multiplier: 2.7,
    tagline: "For experienced players",
    description: "6 discs. For experienced players with very high score potential.",
  },
  extreme: {
    id: "extreme",
    label: "Extreme",
    discs: 8,
    baseScore: 9000,
    multiplier: 4.0,
    tagline: "Tournament difficulty",
    description: "8 discs. Tournament difficulty with maximum score potential.",
  },
};

export const DIFFICULTY_LIST: DifficultyConfig[] = [
  DIFFICULTIES.easy,
  DIFFICULTIES.medium,
  DIFFICULTIES.hard,
  DIFFICULTIES.extreme,
];

export const ROUND_DURATION_MS = 5 * 60 * 1000; // exactly 5 minutes
export const ROUND_DURATION_S = 300;

export function minMovesForDiscs(discs: number): number {
  return Math.pow(2, discs) - 1;
}
