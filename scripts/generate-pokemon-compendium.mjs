import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regenerate src/data/pokemon-compendium.json from the Pokémon-Champions-5e
 * sources.
 *
 *   node scripts/generate-pokemon-compendium.mjs
 *
 * The BASE is the canonical "master dataset" (Pokémon Showdown data) — species
 * identity, types, and *evolution levels* (e.g. Bulbasaur → Ivysaur at 16).
 * From the Pokémon-5e homebrew we take exactly ONE thing: the base **SR**
 * (Stat Rank). EXP-curve inputs (growth rate + base exp) and the genus come
 * from the canonical Pokémon Essentials data, not from the 5e ruleset.
 *
 * Sources (under <champions-repo>/):
 *   packages/frontend/src/data/pokemon-champions/generated/species.json
 *       — master dataset (Showdown): `num`, `types`, `evos`/`prevo`/`evoLevel`/
 *         `evoType`/`evoItem`/… The evolution trigger lives on the *evolved*
 *         form, so each edge is read from the target species' entry.
 *   packages/data/compendium/pokemon.json
 *       — poke5e stat blocks. Only `level` (== base SR) is used, joined by id.
 *   packages/data/compendium/essentials-pokemon.json
 *       — `growth_rate` + `base_exp` per species (inputs to the EXP formulas in
 *         src/utils/pokemon/exp-system.ts).
 *   ref/Pokemon-Essentials-21-With-Unofficial-EBDX/PBS/pokemon.txt
 *       — canonical genus (`Category = Seed` → "Seed Pokémon").
 *
 * All joins normalise ids the same way the source repo's seed.js does:
 * lowercase + strip non-alphanumerics, with a base-species fallback for formes.
 *
 * Override the source repo location with the POKEMON_CHAMPIONS_REPO env var.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const CHAMPIONS_REPO =
	process.env.POKEMON_CHAMPIONS_REPO ?? join(ROOT, '..', 'pokemon-champions-5e.git');
const OUT = join(ROOT, 'src', 'data', 'pokemon-compendium.json');

const readJson = (rel) => JSON.parse(readFileSync(join(CHAMPIONS_REPO, rel), 'utf8'));

/** Same id normalisation the source seed.js uses to bridge the datasets. */
const norm = (s) =>
	String(s ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');

// ── Master dataset (Showdown) — the canonical base ──────────────────────────
const masterTable = readJson(
	'packages/frontend/src/data/pokemon-champions/generated/species.json'
).table;
// name → master entry (for resolving `evos`/`prevo` which reference names).
const masterByName = new Map();
for (const entry of Object.values(masterTable)) masterByName.set(norm(entry.name), entry);

// ── 5e SR (the only value we lift from the homebrew) ────────────────────────
const poke5e = readJson('packages/data/compendium/pokemon.json');
const srByNorm = new Map();
for (const p of poke5e) {
	if (p.level == null) continue;
	const key = norm(p.poke5e_id ?? p.name);
	if (key && !srByNorm.has(key)) srByNorm.set(key, p.level);
}

// ── Essentials growth curves (EXP formula inputs) ───────────────────────────
const essentials = readJson('packages/data/compendium/essentials-pokemon.json').species;
const essByNorm = new Map();
for (const s of essentials) {
	const key = norm(s.id ?? s.name);
	if (key && !essByNorm.has(key)) essByNorm.set(key, s);
}

// ── Canonical genus, parsed from the Essentials PBS (optional) ──────────────
const genusByNorm = new Map();
const PBS = 'ref/Pokemon-Essentials-21-With-Unofficial-EBDX/PBS/pokemon.txt';
if (existsSync(join(CHAMPIONS_REPO, PBS))) {
	const text = readFileSync(join(CHAMPIONS_REPO, PBS), 'utf8');
	let curName = null;
	for (const line of text.split(/\r?\n/)) {
		const name = line.match(/^Name\s*=\s*(.+)$/);
		if (name) curName = name[1].trim();
		const cat = line.match(/^Category\s*=\s*(.+)$/);
		if (cat && curName) genusByNorm.set(norm(curName), cat[1].trim());
	}
}

/** Resolve a value for `entry` by its id, falling back to its base species. */
function withFallback(entry, lookup) {
	const direct = lookup.get(norm(entry.name));
	if (direct !== undefined) return direct;
	if (entry.baseSpecies) return lookup.get(norm(entry.baseSpecies));
	return undefined;
}

/** Describe one evolution edge from the *evolved* species' master entry. */
function describeEvolution(evolved) {
	const conditions = [];
	const parts = [];
	if (evolved.evoLevel != null) {
		conditions.push({ type: 'level', value: evolved.evoLevel });
		parts.push(`Level ${evolved.evoLevel}`);
	}
	switch (evolved.evoType) {
		case 'trade':
			conditions.push({ type: 'special', value: 'trade' });
			parts.push(evolved.evoItem ? `Trade holding ${evolved.evoItem}` : 'Trade');
			break;
		case 'useItem':
			conditions.push({ type: 'item', value: evolved.evoItem });
			parts.push(`use ${evolved.evoItem}`);
			break;
		case 'levelFriendship':
			conditions.push({ type: 'loyalty', value: 'high' });
			parts.push('high friendship');
			break;
		case 'levelHold':
			conditions.push({ type: 'item', value: evolved.evoItem });
			parts.push(`Level up holding ${evolved.evoItem}`);
			break;
		case 'levelMove':
			conditions.push({ type: 'move', value: evolved.evoMove });
			parts.push(`Level up knowing ${evolved.evoMove}`);
			break;
		case 'levelExtra':
		case 'other':
			parts.push(evolved.evoCondition ?? 'special');
			break;
		default:
			if (evolved.evoLevel == null) parts.push('Level up');
	}
	if (evolved.evoCondition && evolved.evoType !== 'other' && evolved.evoType !== 'levelExtra') {
		conditions.push({ type: 'special', value: evolved.evoCondition });
		parts.push(`(${evolved.evoCondition})`);
	}
	return {
		toId: norm(evolved.name),
		toName: evolved.name,
		toDexNumber: typeof evolved.num === 'number' ? evolved.num : null,
		level: evolved.evoLevel ?? null,
		conditions,
		trigger: parts.join(' ') || 'unknown'
	};
}

const compendium = Object.entries(masterTable)
	.filter(([, e]) => typeof e.num === 'number' && e.num >= 1)
	.map(([id, e]) => {
		const ess = withFallback(e, essByNorm);
		const evolvesTo = (e.evos ?? [])
			.map((evoName) => masterByName.get(norm(evoName)))
			.filter(Boolean)
			.map(describeEvolution);
		return {
			id,
			dexNumber: e.num,
			name: e.name,
			// Genus from canonical Essentials PBS, shown as "<genus> Pokémon".
			category: genusByNorm.get(norm(e.name)) ?? (e.baseSpecies ? genusByNorm.get(norm(e.baseSpecies)) : null) ?? null,
			types: Array.isArray(e.types) ? e.types : [],
			// Base SR (Stat Rank) — the ONE value taken from the Pokémon-5e ruleset.
			sr: withFallback(e, srByNorm) ?? null,
			growthRate: ess?.growth_rate ?? null,
			baseExp: ess?.base_exp ?? null,
			hatchSteps: ess?.hatch_steps ?? null,
			generation: ess?.generation ?? null,
			evolvesTo
		};
	})
	// Stable, human-friendly order: by national dex, then alternate formes after.
	.sort((a, b) => a.dexNumber - b.dexNumber || a.name.localeCompare(b.name));

writeFileSync(OUT, JSON.stringify(compendium, null, '\t') + '\n');

const withGrowth = compendium.filter((c) => c.growthRate).length;
const withSr = compendium.filter((c) => c.sr != null).length;
console.log(`Wrote ${compendium.length} species to ${OUT}`);
console.log(`  with SR (from 5e): ${withSr}`);
console.log(`  with growth curve: ${withGrowth}`);
