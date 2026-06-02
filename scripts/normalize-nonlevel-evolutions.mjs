// Normalize non-level evolution triggers in the Pokémon compendium into pure
// level-gated evolutions, so the road page (which only fires evolutions where
// `level !== null`) can drive every species' progression.
//
// Rules (applied only to evolution edges with `level === null`):
//
//   1. Move-based edges (a "move" condition): evolve at the level the *evolving*
//      species first learns that move. The compendium carries no learnset data,
//      so the canonical level-up levels are tabulated below (MOVE_LEARN_LEVELS).
//   2. Edges where the evolving species itself evolves from a pre-evolution:
//      level = (level at which the pre-evolution produced this species) + 10.
//      That incoming level is resolved recursively, so a stone/trade pre-evo
//      cascades correctly (e.g. Pichu→Pikachu at 20 ⇒ Pikachu→Raichu at 30).
//   3. Edges on a base-form species (no pre-evolution) that use loyalty/special/
//      item (or any other non-level trigger): evolve at level 20.
//
// Each rewritten edge becomes a pure level edge: `level` set, `conditions`
// replaced with a single `{type:'level', value}`, and `trigger` set to
// `"Level N"` — mirroring the shape of the existing level-gated edges. The
// original non-level method is intentionally overwritten (git preserves it).
//
// Run: node scripts/normalize-nonlevel-evolutions.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'data', 'pokemon-compendium.json');

const BASE_FORM_LEVEL = 20;
const PREEVO_INCREMENT = 10;

// Canonical level-up learn level of each move-evolution's trigger move, keyed by
// the *evolving* species id. Sourced from Pokémon canon (no learnset data ships
// in this repo). Verify/adjust as needed.
const MOVE_LEARN_LEVELS = {
	lickitung: 33, // Rollout
	tangela: 36, // Ancient Power
	aipom: 32, // Double Hit
	yanma: 33, // Ancient Power
	girafarig: 35, // Twin Beam
	dunsparce: 32, // Hyper Drill (→ dudunsparce and …threesegment)
	piloswine: 33, // Ancient Power
	bonsly: 17, // Mimic
	mimejr: 15, // Mimic (→ mrmime and mrmimegalar)
	steenee: 28, // Stomp
	poipole: 40, // Dragon Pulse
	clobbopus: 25, // Taunt
	dipplin: 41 // Dragon Cheer
};

const raw = readFileSync(DATA_PATH, 'utf8');
const species = JSON.parse(raw);

const byId = new Map(species.map((p) => [p.id, p]));

// child id -> parent id (each species has at most one pre-evolution).
const parentOf = new Map();
for (const p of species) {
	for (const e of p.evolvesTo ?? []) parentOf.set(e.toId, p.id);
}

function hasMoveCondition(edge) {
	return (edge.conditions ?? []).some((c) => c.type === 'move');
}

// Level at which `parentId` evolves into `childId` (the incoming edge of child).
function resolveEdgeLevel(parentId, childId) {
	const parent = byId.get(parentId);
	const edge = parent?.evolvesTo?.find((e) => e.toId === childId);
	if (!edge) return BASE_FORM_LEVEL; // defensive; shouldn't happen
	if (edge.level !== null) return edge.level; // already level-gated
	if (hasMoveCondition(edge)) return MOVE_LEARN_LEVELS[parentId] ?? BASE_FORM_LEVEL;
	const grandparent = parentOf.get(parentId);
	if (grandparent) return resolveEdgeLevel(grandparent, parentId) + PREEVO_INCREMENT;
	return BASE_FORM_LEVEL;
}

const changes = [];
for (const p of species) {
	for (const edge of p.evolvesTo ?? []) {
		if (edge.level !== null) continue; // only the non-level edges
		const before = edge.trigger;
		const level = resolveEdgeLevel(p.id, edge.toId);
		const rule = hasMoveCondition(edge)
			? 'move'
			: parentOf.has(p.id)
				? 'preevo+10'
				: 'base=20';
		edge.level = level;
		edge.conditions = [{ type: 'level', value: level }];
		edge.trigger = `Level ${level}`;
		changes.push({ from: p.id, to: edge.toId, before, after: edge.trigger, rule });
	}
}

writeFileSync(DATA_PATH, JSON.stringify(species, null, '\t') + '\n');

// Report.
const byRule = changes.reduce((m, c) => ((m[c.rule] = (m[c.rule] ?? 0) + 1), m), {});
console.log(`Rewrote ${changes.length} non-level evolution edges:`, byRule);
console.log('\nMove-based (canonical learn levels):');
for (const c of changes.filter((c) => c.rule === 'move'))
	console.log(`  ${c.from} -> ${c.to}  ${JSON.stringify(c.before)} => ${c.after}`);
