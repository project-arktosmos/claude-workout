import { AdapterClass } from '$adapters/classes/adapter.class';
import {
	PromptStatus,
	type DirectoryEvent,
	type ExerciseRound,
	type PromptEvent
} from '$types/event.type';

/**
 * Transforms the flat per-turn prompt feed into the per-directory view the
 * events page renders: one row per `cwd`, with the prompts split into exercise
 * rounds and their durations summed across every turn that ran there.
 */
export class EventsAdapter extends AdapterClass {
	constructor() {
		super('events');
	}

	/**
	 * Collapse per-turn events into one `DirectoryEvent` per `cwd`, newest
	 * activity first. A directory is `Running` while any of its turns are in
	 * flight; otherwise it carries the status of its most recently ended turn.
	 */
	groupByDirectory(events: PromptEvent[]): DirectoryEvent[] {
		const byCwd = new Map<string, PromptEvent[]>();
		for (const event of events) {
			const list = byCwd.get(event.cwd);
			if (list) list.push(event);
			else byCwd.set(event.cwd, [event]);
		}

		const directories: DirectoryEvent[] = [];
		for (const [cwd, turns] of byCwd) {
			// Oldest first so rounds and terminal status build up chronologically
			// regardless of the input ordering.
			const ordered = [...turns].sort((a, b) => a.startedAt - b.startedAt);
			const rounds = this.buildRounds(ordered);
			const last = ordered[ordered.length - 1];
			const runningCount = ordered.filter((e) => e.status === PromptStatus.Running).length;

			directories.push({
				cwd,
				status: runningCount > 0 ? PromptStatus.Running : last.status,
				promptCount: ordered.length,
				runningCount,
				startedAt: ordered[0].startedAt,
				lastActivityAt: ordered.reduce(
					(max, e) => Math.max(max, e.endedAt ?? e.startedAt),
					ordered[0].startedAt
				),
				totalDurationMs: ordered.reduce((sum, e) => sum + (e.durationMs ?? 0), 0),
				// Newest round first to match the rest of the feed's ordering.
				rounds: rounds.reverse(),
				// Newest prompt first — the raw per-prompt activity log for this directory.
				prompts: [...ordered].reverse(),
				errorType: runningCount === 0 && last.status === PromptStatus.Failed ? last.errorType : null
			});
		}

		return directories.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
	}

	/**
	 * Split a directory's prompts (oldest first) into exercise rounds. A new
	 * round opens whenever a prompt starts after every prompt in the current
	 * round has already ended; otherwise the prompt overlaps the round and joins
	 * it, sharing its exercises and adding to its timer. A still-running prompt
	 * keeps its round open (it ends at `Infinity`), so any later prompt joins it.
	 */
	private buildRounds(ordered: PromptEvent[]): ExerciseRound[] {
		const rounds: ExerciseRound[] = [];
		let current: ExerciseRound | null = null;
		// Latest end across the current round's prompts; Infinity while any run.
		let currentRoundEnd = -Infinity;

		for (const event of ordered) {
			const end = event.endedAt ?? Infinity;
			const running = event.status === PromptStatus.Running;

			if (!current || event.startedAt >= currentRoundEnd) {
				current = {
					id: event.id,
					exercises: [...event.exercises],
					exerciseLog: [],
					startedAt: event.startedAt,
					status: event.status,
					promptCount: 0,
					runningCount: 0,
					completedDurationMs: 0,
					runningSince: [],
					errorType: null
				};
				rounds.push(current);
				currentRoundEnd = end;
			} else {
				currentRoundEnd = Math.max(currentRoundEnd, end);
			}

			current.promptCount += 1;
			current.startedAt = Math.min(current.startedAt, event.startedAt);
			// The opening prompt draws the set; joiners arrive with none, so adopt
			// the first non-empty draw seen in the round.
			if (current.exercises.length === 0 && event.exercises.length) {
				current.exercises = [...event.exercises];
			}
			if (running) {
				current.runningCount += 1;
				current.runningSince.push(event.startedAt);
			} else {
				current.completedDurationMs += event.durationMs ?? 0;
				current.errorType = event.status === PromptStatus.Failed ? event.errorType : null;
			}
			current.status = running ? PromptStatus.Running : event.status;
		}

		// A round with any in-flight prompt always reads as running.
		for (const round of rounds) {
			if (round.runningCount > 0) round.status = PromptStatus.Running;
			// Resolve each segment's running time: the gap to the next exercise,
			// and for the last one the remainder up to the round's total running
			// time. (A still-running round's last entry stops at the completed
			// time and excludes live time — only finished rounds are logged in the
			// history, which is the panel that reads this.)
			round.exerciseLog = round.exercises.map((segment, index) => {
				const endMs =
					index + 1 < round.exercises.length
						? round.exercises[index + 1].atMs
						: round.completedDurationMs;
				return { id: segment.id, durationMs: Math.max(0, endMs - segment.atMs) };
			});
		}

		return rounds;
	}
}

export const eventsAdapter = new EventsAdapter();
