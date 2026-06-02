import { ArrayServiceClass } from '$services/classes/array-service.class';
import { ExerciseFlag, type ExerciseFlagEntry } from '$types/exercise-flag.type';
import type { ID } from '$types/core.type';

/**
 * Tracks which exercises the user has marked Favorite or Banned. The catalog
 * itself (the SQLite `exercises` table) is read-only and shared, so these
 * personal flags live here, persisted to localStorage like other preferences.
 */
class ExerciseFlagsService extends ArrayServiceClass<ExerciseFlagEntry> {
	constructor() {
		super('exercise-flags', []);
	}

	/** The flag currently set on an exercise, or null when unflagged. */
	flagOf(id: ID): ExerciseFlag | null {
		return this.exists(id)?.flag ?? null;
	}

	/**
	 * Set an exercise's flag, or clear it when `flag` is null. Favorite and
	 * Banned are mutually exclusive, so setting one replaces the other.
	 */
	setFlag(id: ID, flag: ExerciseFlag | null): void {
		const current = this.exists(id);
		if (!flag) {
			if (current) this.remove(current);
			return;
		}
		if (current) {
			this.update({ id, flag });
		} else {
			this.add({ id, flag });
		}
	}

	/** Toggle a flag on an exercise: re-applying the current flag clears it. */
	toggle(id: ID, flag: ExerciseFlag): void {
		this.setFlag(id, this.flagOf(id) === flag ? null : flag);
	}
}

export const exerciseFlagsService = new ExerciseFlagsService();
