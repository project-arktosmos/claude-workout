import { describe, it, expect } from 'vitest';
import { EventsAdapter } from '../../src/adapters/classes/events.adapter';
import { PromptStatus, type ExerciseSegment, type PromptEvent } from '../../src/types/event.type';

const adapter = new EventsAdapter();

/** Build an exercise segment list from [id, atMs] pairs. */
function segs(...pairs: [string, number][]): ExerciseSegment[] {
	return pairs.map(([id, atMs]) => ({ id, atMs }));
}

let seq = 0;
function turn(over: Partial<PromptEvent> = {}): PromptEvent {
	const startedAt = over.startedAt ?? 0;
	const endedAt = over.endedAt ?? null;
	return {
		id: over.id ?? `turn-${seq++}`,
		sessionId: over.sessionId ?? 'session',
		prompt: over.prompt ?? 'do a thing',
		cwd: over.cwd ?? '/project',
		status: over.status ?? (endedAt === null ? PromptStatus.Running : PromptStatus.Completed),
		startedAt,
		endedAt,
		durationMs: over.durationMs ?? (endedAt === null ? null : endedAt - startedAt),
		errorType: over.errorType ?? null,
		exercises: over.exercises ?? []
	};
}

describe('EventsAdapter.groupByDirectory — exercise rounds', () => {
	it('puts non-overlapping prompts in separate rounds, each with its own set', () => {
		const events = [
			turn({ id: 'a', startedAt: 0, endedAt: 100, exercises: segs(['x1', 0], ['x2', 30], ['x3', 70]) }),
			turn({ id: 'b', startedAt: 200, endedAt: 350, exercises: segs(['y1', 0], ['y2', 50]) })
		];

		const [dir] = adapter.groupByDirectory(events);

		expect(dir.rounds).toHaveLength(2);
		// Newest round first.
		expect(dir.rounds[0].id).toBe('b');
		expect(dir.rounds[0].exercises.map((s) => s.id)).toEqual(['y1', 'y2']);
		expect(dir.rounds[0].completedDurationMs).toBe(150);
		expect(dir.rounds[1].id).toBe('a');
		expect(dir.rounds[1].exercises.map((s) => s.id)).toEqual(['x1', 'x2', 'x3']);
		expect(dir.rounds[1].completedDurationMs).toBe(100);
	});

	it('logs each exercise with the time it ran, closing the last at the round total', () => {
		const events = [
			turn({ id: 'a', startedAt: 0, endedAt: 100, exercises: segs(['x1', 0], ['x2', 30], ['x3', 70]) })
		];

		const [dir] = adapter.groupByDirectory(events);

		// Gaps between stamps, with the final exercise closing at completedDurationMs.
		expect(dir.rounds[0].exerciseLog).toEqual([
			{ id: 'x1', durationMs: 30 },
			{ id: 'x2', durationMs: 40 },
			{ id: 'x3', durationMs: 30 }
		]);
		// The logged times sum to the round's total running time.
		const total = dir.rounds[0].exerciseLog.reduce((sum, e) => sum + e.durationMs, 0);
		expect(total).toBe(dir.rounds[0].completedDurationMs);
	});

	it('merges a prompt that starts while another is running into one round', () => {
		const events = [
			// a opens the round and draws the set; b joins while a is still running.
			turn({ id: 'a', startedAt: 0, endedAt: 300, exercises: segs(['x1', 0], ['x2', 120]) }),
			turn({ id: 'b', startedAt: 100, endedAt: 400, exercises: [] })
		];

		const [dir] = adapter.groupByDirectory(events);

		expect(dir.rounds).toHaveLength(1);
		const round = dir.rounds[0];
		expect(round.exercises.map((s) => s.id)).toEqual(['x1', 'x2']);
		expect(round.promptCount).toBe(2);
		// Both prompts' times add up against the same set: 300 + 300.
		expect(round.completedDurationMs).toBe(600);
		expect(round.startedAt).toBe(0);
		// Last exercise's run time closes at the round's full running time.
		expect(round.exerciseLog).toEqual([
			{ id: 'x1', durationMs: 120 },
			{ id: 'x2', durationMs: 480 }
		]);
	});

	it('keeps chained overlaps in the same round and starts a fresh one after idle', () => {
		const events = [
			turn({ id: 'a', startedAt: 0, endedAt: 200, exercises: segs(['x1', 0], ['x2', 120]) }),
			turn({ id: 'b', startedAt: 150, endedAt: 400, exercises: [] }), // overlaps a
			turn({ id: 'c', startedAt: 350, endedAt: 500, exercises: [] }), // overlaps b
			turn({ id: 'd', startedAt: 800, endedAt: 900, exercises: segs(['z1', 0]) }) // after idle
		];

		const [dir] = adapter.groupByDirectory(events);

		expect(dir.rounds).toHaveLength(2);
		const [newest, oldest] = dir.rounds;
		expect(oldest.promptCount).toBe(3);
		expect(oldest.exercises.map((s) => s.id)).toEqual(['x1', 'x2']);
		expect(oldest.completedDurationMs).toBe(200 + 250 + 150);
		expect(newest.promptCount).toBe(1);
		expect(newest.exercises.map((s) => s.id)).toEqual(['z1']);
	});

	it('keeps a round open and running while a prompt is still in flight', () => {
		const events = [
			turn({ id: 'a', startedAt: 0, status: PromptStatus.Running, endedAt: null }),
			turn({ id: 'b', startedAt: 50, status: PromptStatus.Running, endedAt: null })
		];

		const [dir] = adapter.groupByDirectory(events);

		expect(dir.rounds).toHaveLength(1);
		const round = dir.rounds[0];
		expect(round.status).toBe(PromptStatus.Running);
		expect(round.runningCount).toBe(2);
		expect(round.runningSince).toEqual([0, 50]);
		expect(round.completedDurationMs).toBe(0);
		expect(dir.status).toBe(PromptStatus.Running);
	});

	it('separates prompts from different directories', () => {
		const events = [
			turn({ id: 'a', cwd: '/one', startedAt: 0, endedAt: 100, exercises: segs(['x1', 0]) }),
			turn({ id: 'b', cwd: '/two', startedAt: 50, endedAt: 200, exercises: segs(['y1', 0]) })
		];

		const dirs = adapter.groupByDirectory(events);

		expect(dirs).toHaveLength(2);
		expect(dirs.every((d) => d.rounds.length === 1)).toBe(true);
	});
});
