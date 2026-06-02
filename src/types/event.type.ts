import type { ID } from '$types/core.type';

export enum PromptStatus {
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed'
}

/**
 * A single Claude Code prompt turn, from launch (UserPromptSubmit) to end
 * (Stop / StopFailure). Persisted in the Tauri backend's SQLite database and
 * delivered to the frontend via the `list_prompt_events` command and the
 * `prompt-event` live event. Shape mirrors the Rust `PromptEvent` (camelCase).
 */
export interface PromptEvent {
	id: ID;
	sessionId: string;
	prompt: string;
	cwd: string;
	status: PromptStatus;
	startedAt: number;
	endedAt: number | null;
	durationMs: number | null;
	errorType: string | null;
	/** The exercises drawn for this turn's round, in the order they ran. */
	exercises: ExerciseSegment[];
}

/**
 * One exercise as it was drawn into a round, stamped with the round's
 * running-elapsed (ms) at the moment it became the active exercise. The time an
 * exercise ran is the gap to the next segment (or, for the last one, to the
 * round's total running time), so each exercise carries exactly how long it was
 * held up — no per-window guessing.
 */
export interface ExerciseSegment {
	/** Exercise id (filename). */
	id: ID;
	/** Round running-elapsed in ms when this exercise became active. */
	atMs: number;
}

/** One executed exercise and how long it ran, derived from a round's segments. */
export interface ExerciseRunLog {
	/** Exercise id (filename). */
	id: ID;
	/** How long this exercise was held up, in ms. */
	durationMs: number;
}

/**
 * One drawn exercise and the prompts that share it. A round opens when a
 * prompt starts in a directory that has no other prompt running; every prompt
 * that starts while the round is still in flight joins it instead of drawing a
 * new one. The round's timer is the sum of all its prompts' durations, so
 * overlapping prompts add up against the same exercise. A fresh exercise is only
 * drawn once the directory goes idle and the next prompt opens a new round.
 */
export interface ExerciseRound {
	/** Stable key — the id of the prompt that opened the round. */
	id: ID;
	/** The exercises run this round, oldest first, each stamped with its start. */
	exercises: ExerciseSegment[];
	/** The same exercises with their running time resolved, oldest first. */
	exerciseLog: ExerciseRunLog[];
	/** Earliest prompt start in the round. */
	startedAt: number;
	/** Running while any of the round's prompts is in flight, else its last terminal status. */
	status: PromptStatus;
	/** How many prompts joined this round. */
	promptCount: number;
	/** How many of the round's prompts are still running. */
	runningCount: number;
	/** Summed duration of the round's completed/failed prompts. */
	completedDurationMs: number;
	/** Start timestamps of the round's still-running prompts, for live elapsed. */
	runningSince: number[];
	/** Error type of the round's most recent failed prompt, if any. */
	errorType: string | null;
}

/**
 * All prompt turns that ran in a single directory, collapsed into one row and
 * split into exercise rounds. `totalDurationMs` accumulates the duration of
 * every completed/failed turn and grows each time another prompt for that
 * directory finishes; in-flight turns contribute nothing until they close.
 */
export interface DirectoryEvent {
	/** Working directory shared by every turn in this group (the row's identity). */
	cwd: string;
	/** Running while any turn is in flight, otherwise the most recent terminal status. */
	status: PromptStatus;
	/** Total number of prompt turns launched in this directory. */
	promptCount: number;
	/** How many of those turns are still running. */
	runningCount: number;
	/** Earliest turn start in this directory. */
	startedAt: number;
	/** Most recent turn start or end — used to order directories by activity. */
	lastActivityAt: number;
	/** Summed duration of every completed/failed turn in this directory. */
	totalDurationMs: number;
	/** Exercise rounds in this directory, newest first; each holds its shared exercise. */
	rounds: ExerciseRound[];
	/** Every prompt turn in this directory, newest first — the raw per-prompt activity log. */
	prompts: PromptEvent[];
	/** Error type of the most recent failed turn, when the group ended in failure. */
	errorType: string | null;
}
