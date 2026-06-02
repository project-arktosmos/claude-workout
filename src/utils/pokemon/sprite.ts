// Resolves a Pokémon species name to its front-sprite URL under
// `static/assets/Pokemon/Front`. The asset pack names files after the *base*
// species in UPPERCASE with every non-alphanumeric character stripped, so
// "Mr. Mime" → MRMIME, "Farfetch'd" → FARFETCHD, "Flabébé" → FLABEBE and
// "Jangmo-o" → JANGMOO. Regional/special formes reuse the base sprite, so the
// regional suffix is dropped first ("Growlithe-Hisui" → GROWLITHE).

/** Blank silhouette shown when a species has no bundled sprite (e.g. Gen 9). */
export const MISSING_SPRITE_URL = '/assets/Pokemon/Front/000.png';

// Forme suffixes that share the base species' artwork. Matched as a trailing
// "-Suffix" so genuine hyphenated names (Jangmo-o, Ho-Oh, Porygon-Z) are kept.
const FORME_SUFFIX =
	/-(Alola|Galar|Hisui|Paldea|Mega|Gmax|Therian|Origin|Crowned|Hangry|Low-Key|Bloodmoon)$/i;

// Names whose file deviates from the normalized form (gender-only species).
const SPECIAL: Record<string, string> = {
	'Nidoran-F': 'NIDORANfE',
	'Nidoran-M': 'NIDORANmA'
};

/** Normalize a species name to its sprite filename stem (without extension). */
export function spriteStem(name: string): string {
	if (SPECIAL[name]) return SPECIAL[name];
	return name
		.replace(FORME_SUFFIX, '')
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '') // strip combining accent marks
		.toUpperCase()
		.replace(/[^A-Z0-9]/g, ''); // drop spaces, dots, apostrophes, hyphens
}

/** Front-sprite URL for a species name (not guaranteed to exist on disk). */
export function frontSpriteUrl(name: string): string {
	return `/assets/Pokemon/Front/${spriteStem(name)}.png`;
}

/**
 * Follower walk-sheet URL for a species name, used by the /road field. The
 * follower pack names sheets after the species in UPPERCASE (e.g. "Bulbasaur" →
 * `BULBASAUR.png`); not guaranteed to exist on disk for every species.
 */
export function followerSheetUrl(name: string): string {
	return `/assets/Characters/Followers/${name.toUpperCase()}.png`;
}
