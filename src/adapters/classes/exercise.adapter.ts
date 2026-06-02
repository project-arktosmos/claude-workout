import { AdapterClass } from '$adapters/classes/adapter.class';
import { ExerciseCategory, type ExerciseImage } from '$types/exercise.type';

/** Static folder name each category is served from. */
const CATEGORY_FOLDER: Record<ExerciseCategory, string> = {
	[ExerciseCategory.Exercise]: 'exercise',
	[ExerciseCategory.Yoga]: 'yoga-poses'
};

/**
 * Transforms raw SVG filenames (e.g. `adho-mukha-svanasana-4733988.svg`) into
 * displayable {@link ExerciseImage} records. Filenames are `slug-id.svg`; the
 * trailing numeric id is dropped and the slug is title-cased for display.
 * Anonymous exercise illustrations (slug `exercise`) are numbered sequentially.
 */
export class ExerciseAdapter extends AdapterClass {
	constructor() {
		super('exercise');
	}

	fromFilenames(filenames: string[], category: ExerciseCategory): ExerciseImage[] {
		return filenames.map((filename, index) => this.fromFilename(filename, category, index));
	}

	fromFilename(filename: string, category: ExerciseCategory, index: number): ExerciseImage {
		const base = filename.replace(/\.svg$/i, '');
		const match = base.match(/^(.*?)-(\d+)$/);
		const slug = match ? match[1] : base;
		const name = slug && slug !== 'exercise' ? this.toTitle(slug) : `Exercise ${index + 1}`;

		return {
			id: filename,
			name,
			category,
			src: `/${CATEGORY_FOLDER[category]}/${filename}`
		};
	}

	private toTitle(slug: string): string {
		return slug
			.split('-')
			.filter(Boolean)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join(' ');
	}
}

export const exerciseAdapter = new ExerciseAdapter();
