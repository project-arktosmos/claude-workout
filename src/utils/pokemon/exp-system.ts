/**
 * Pokémon Essentials experience-curve formulas, ported verbatim from the
 * Pokémon-Champions-5e project (which in turn mirrors the canon Gen-5+
 * Essentials implementation — the same numbers mainline Pokémon has used since
 * Black/White). Each species carries a `growthRate` and `baseExp` in the
 * compendium (see `$data/pokemon-compendium`).
 *
 * Six growth rates exist (Essentials' canonical labels in parentheses):
 *   - `fast`        (Fast — 4n³/5)
 *   - `medium`      (Medium Fast — n³)
 *   - `slow`        (Slow — 5n³/4)
 *   - `parabolic`   (Medium Slow — 6n³/5 − 15n² + 100n − 140)
 *   - `erratic`     (piecewise around n=50/68/98)
 *   - `fluctuating` (piecewise around n=15/35)
 *
 * Level 1 always sits at 0 total XP; the max level is 100.
 */

import type { GrowthRate } from '$types/pokemon.type';

export const GROWTH_RATES: readonly GrowthRate[] = [
	'fast',
	'medium',
	'slow',
	'parabolic',
	'erratic',
	'fluctuating'
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 100;

export function isGrowthRate(value: unknown): value is GrowthRate {
	return typeof value === 'string' && (GROWTH_RATES as readonly string[]).includes(value);
}

/**
 * Total experience required to *reach* `level` from level 1, for the given
 * growth rate. Returns 0 for level 1, NaN for out-of-range input.
 *
 * These formulas match Bulbapedia's "Experience" article, which mirrors the
 * Gen-5+ Pokémon main-line game code that Essentials reuses.
 */
export function expForLevel(rate: GrowthRate, level: number): number {
	if (!Number.isFinite(level) || level < MIN_LEVEL || level > MAX_LEVEL) return NaN;
	const lvl = Math.floor(level);
	if (lvl <= 1) return 0;
	const n = lvl;
	switch (rate) {
		case 'fast':
			return Math.floor((4 * n * n * n) / 5);
		case 'medium':
			return n * n * n;
		case 'slow':
			return Math.floor((5 * n * n * n) / 4);
		case 'parabolic': {
			// Medium Slow: 6n³/5 − 15n² + 100n − 140
			const cube = n * n * n;
			return Math.floor((6 * cube) / 5 - 15 * n * n + 100 * n - 140);
		}
		case 'erratic': {
			const cube = n * n * n;
			if (n <= 50) return Math.floor((cube * (100 - n)) / 50);
			if (n <= 68) return Math.floor((cube * (150 - n)) / 100);
			if (n <= 98) return Math.floor((cube * Math.floor((1911 - 10 * n) / 3)) / 500);
			return Math.floor((cube * (160 - n)) / 100);
		}
		case 'fluctuating': {
			const cube = n * n * n;
			if (n <= 15) return Math.floor((cube * (Math.floor((n + 1) / 3) + 24)) / 50);
			if (n <= 35) return Math.floor((cube * (n + 14)) / 50);
			return Math.floor((cube * (Math.floor(n / 2) + 32)) / 50);
		}
	}
}

/** Convenience: total XP at the *current* level (lower bound). */
export function expAtCurrentLevel(rate: GrowthRate, level: number): number {
	return expForLevel(rate, clampLevel(level));
}

/** Convenience: total XP needed to *next* level, or null at MAX_LEVEL. */
export function expAtNextLevel(rate: GrowthRate, level: number): number | null {
	const next = Math.min(MAX_LEVEL, Math.floor(level) + 1);
	if (next === level) return null;
	if (next > MAX_LEVEL) return null;
	return expForLevel(rate, next);
}

/** XP earned into the current level (`totalExp - expAtCurrentLevel`). */
export function expIntoLevel(rate: GrowthRate, level: number, totalExp: number): number {
	const floor = expForLevel(rate, level);
	if (!Number.isFinite(floor)) return 0;
	return Math.max(0, Math.floor(totalExp) - floor);
}

/** XP needed to fill the current level's bar, or null at max level. */
export function expForLevelBar(rate: GrowthRate, level: number): number | null {
	const cur = expForLevel(rate, level);
	const nxt = expAtNextLevel(rate, level);
	if (nxt === null || !Number.isFinite(cur)) return null;
	return Math.max(1, nxt - cur);
}

/**
 * Resolve the level reached by `totalExp` for the given growth rate.
 * Clamps to [1, MAX_LEVEL]. Uses a linear scan (max 100 iterations).
 */
export function levelFromExp(rate: GrowthRate, totalExp: number): number {
	if (!Number.isFinite(totalExp) || totalExp <= 0) return MIN_LEVEL;
	const xp = Math.floor(totalExp);
	let level = MIN_LEVEL;
	for (let n = MIN_LEVEL + 1; n <= MAX_LEVEL; n++) {
		if (expForLevel(rate, n) > xp) break;
		level = n;
	}
	return level;
}

/** Clamp `level` into the [MIN_LEVEL, MAX_LEVEL] range. */
export function clampLevel(level: number): number {
	if (!Number.isFinite(level)) return MIN_LEVEL;
	return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.floor(level)));
}

/**
 * Pokémon Essentials Gen-5+ scaled experience formula on defeat.
 *
 *     exp = floor( (a * b * L) / (7 * s) * scaledFactor )
 *
 *   a   = trainer multiplier (1.5 for trainer battles, 1.0 wild)
 *   b   = base_exp yield of the defeated species
 *   L   = level of the defeated Pokémon
 *   s   = number of participants on the winning side that share XP
 *   scaledFactor = ((2L + 10)^2.5 / (L + winnerLevel + 10)^2.5)
 *                  (Gen-5 scaled curve; matches Essentials' default config).
 *
 * Returns 0 for invalid input; minimum reward of 1 when otherwise positive.
 */
export interface ExpGainInput {
	baseExp: number;
	defeatedLevel: number;
	winnerLevel: number;
	/** Default 1 — number of party Pokémon sharing the gain. */
	participants?: number;
	/** Default false — trainer battles award 1.5× XP. */
	isTrainerBattle?: boolean;
	/** Optional multiplier for held items, Lucky Egg etc. Default 1. */
	itemMultiplier?: number;
}

export function expGainOnDefeat(input: ExpGainInput): number {
	const b = Math.max(0, Math.floor(input.baseExp ?? 0));
	const L = Math.max(1, Math.floor(input.defeatedLevel ?? 1));
	const Lp = Math.max(1, Math.floor(input.winnerLevel ?? 1));
	const s = Math.max(1, Math.floor(input.participants ?? 1));
	const a = input.isTrainerBattle ? 1.5 : 1.0;
	const item = Math.max(0, input.itemMultiplier ?? 1);
	if (b === 0) return 0;
	const base = (a * b * L) / (7 * s);
	const scaled = Math.pow((2 * L + 10) / (L + Lp + 10), 2.5);
	const gain = Math.floor(base * scaled * item);
	return Math.max(1, gain);
}

/**
 * Apply an XP delta and resolve the new level.
 * Returns `{ totalExp, level, levelsGained }`. The caller is responsible for any
 * per-level side effects (move learning, evolution checks).
 */
export interface ApplyExpResult {
	totalExp: number;
	level: number;
	levelsGained: number;
}

export function applyExp(
	rate: GrowthRate,
	currentLevel: number,
	currentTotalExp: number,
	gain: number
): ApplyExpResult {
	const start = clampLevel(currentLevel);
	const startTotal = Math.max(expForLevel(rate, start), Math.floor(currentTotalExp));
	const newTotal = Math.max(0, startTotal + Math.floor(gain));
	const cap = expForLevel(rate, MAX_LEVEL);
	const capped = Math.min(newTotal, cap);
	const newLevel = levelFromExp(rate, capped);
	return {
		totalExp: capped,
		level: newLevel,
		levelsGained: Math.max(0, newLevel - start)
	};
}
