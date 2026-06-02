import type { ID } from '$types/core.type';

export enum ExerciseCategory {
	Exercise = 'exercise',
	Yoga = 'yoga'
}

/**
 * Which pool an event's random draw is taken from. `Mix` combines both
 * collections into a single pool (a draw of 3 may mix workout and yoga).
 */
export enum ExerciseMode {
	Workout = 'workout',
	Yoga = 'yoga',
	Mix = 'mix'
}

/** A single workout illustration backed by an SVG in the static directory. */
export interface ExerciseImage {
	/** Stable identifier — the source filename. */
	id: ID;
	/** Human-friendly display name. */
	name: string;
	/** Which collection the image belongs to. */
	category: ExerciseCategory;
	/** Absolute URL to the SVG served from `static/`. */
	src: string;
}
