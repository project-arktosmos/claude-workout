import type { ID } from '$types/core.type';

/**
 * A user's personal mark on an exercise. Favorite and Banned are mutually
 * exclusive — an exercise carries at most one flag at a time.
 */
export enum ExerciseFlag {
	Favorite = 'favorite',
	Banned = 'banned'
}

/**
 * Per-user flag state for a single exercise, persisted to localStorage.
 * `id` is the flagged exercise's id (its SVG filename), matching
 * {@link ExerciseImage.id}.
 */
export interface ExerciseFlagEntry {
	id: ID;
	flag: ExerciseFlag;
}
