import { ObjectServiceClass } from '$services/classes/object-service.class';
import { ExerciseMode } from '$types/exercise.type';
import type { ID } from '$types/core.type';

/** User preferences persisted to localStorage. */
export interface ExerciseSettings {
	id: ID;
	/** Which pool new events draw their exercises from. */
	mode: ExerciseMode;
}

export const settingsService = new ObjectServiceClass<ExerciseSettings>('exercise-settings', {
	id: 'exercise-settings',
	mode: ExerciseMode.Mix
});
