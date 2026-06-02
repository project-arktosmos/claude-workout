import {
	AnimatedSprite,
	Application,
	Container,
	Graphics,
	Rectangle,
	Sprite,
	Text,
	Texture,
	type Ticker
} from 'pixi.js';
import capitalize from '$utils/string/capitalize';
import { gen1WildPool, pokemonByName } from '$data/pokemon-compendium.data';
import { spriteStem } from '$utils/pokemon/sprite';
import { formatMultiplier } from '$utils/pokemon/type-chart';

/**
 * A square grass field built on PixiJS, painted from the four "grass-1..4" tiles
 * surfaced on the /map-assets page (pieces 066–069 of the Pokémon-style tileset
 * under `static/maps/pieces/`).
 *
 * The canvas is a centred square. Its ground is a grid of 16x16 pixel-art tiles
 * that scrolls forever: each cell draws one of the four grass variants, chosen
 * from the cell's *world* coordinates so the pattern reads as one continuous,
 * alternating field rather than a repeating stamp, and the tile grid is
 * row-recycling so memory is bounded and the scroll never ends. A purple lattice
 * overlaid on the grass (and scrolling with it) is the only visible grid. An
 * invisible GRID×GRID cell system spanning the canvas places the line-up:
 * Bulbasaur and the trainer stand near the centre, and wild Pokémon walk up from
 * below to greet them before fading.
 *
 * Like RunGame, this module owns the canvas, asset loading and render loop; the
 * Svelte page only mounts a container element (see CLAUDE.md architecture rules).
 *
 * Usage:
 *   const game = new RoadGame({ container });
 *   await game.start();
 *   // later
 *   game.destroy();
 */

/** The four "enabled" grass tiles from /map-assets, in cycle order. */
const GRASS_TILES = [
	'/maps/pieces/piece-066.png', // grass-1
	'/maps/pieces/piece-067.png', // grass-2
	'/maps/pieces/piece-068.png', // grass-3
	'/maps/pieces/piece-069.png' // grass-4
];

/**
 * The "water-loop" animation from /map-assets — pieces 1–8, played in order on a
 * shared timer (every tile shows the same frame at once) so the band of water
 * down each side edge ripples in sync, matching the map-assets preview.
 */
const WATER_TILES = [
	'/maps/pieces/piece-001.png',
	'/maps/pieces/piece-002.png',
	'/maps/pieces/piece-003.png',
	'/maps/pieces/piece-004.png',
	'/maps/pieces/piece-005.png',
	'/maps/pieces/piece-006.png',
	'/maps/pieces/piece-007.png',
	'/maps/pieces/piece-008.png'
];

/** Milliseconds per water-loop frame, matching the /map-assets animation. */
const WATER_FRAME_MS = 150;

/** Number of tile columns painted as water on each side edge of the field. */
const WATER_BAND = 3;

/**
 * The "flowers" animation from /map-assets — pieces 042–046, played in order on a
 * shared timer (every patch shows the same frame at once) so the flower beds sway
 * in sync, matching the map-assets preview. They are scattered sparsely over the
 * grass and, living in the scrolling `world`, slide along with it.
 */
const FLOWER_TILES = [
	'/maps/pieces/piece-042.png',
	'/maps/pieces/piece-043.png',
	'/maps/pieces/piece-044.png',
	'/maps/pieces/piece-045.png',
	'/maps/pieces/piece-046.png'
];

/** Milliseconds per flower-loop frame, matching the /map-assets animation. */
const FLOWER_FRAME_MS = 150;

/** Roughly the share of (non-water) grass cells that sprout a flower patch. */
const FLOWER_DENSITY = 0.053;

/** Native tile size — every grass piece is 16x16. */
const TILE = 16;

/** Upscaling factor applied to the 16px pixel-art tiles. */
const SCALE = 3;

/** On-screen size of one tile after scaling. */
const DISPLAY = TILE * SCALE;

/** Floor for the canvas height when the container hasn't been laid out yet. */
const MIN_HEIGHT = 260;

/**
 * The field is divided into a GRID×GRID system of cells spanning the whole
 * canvas, used only to place the line-up and aim the wild mon — no lattice is
 * drawn for it. The scrolling grass (with its own purple tile lattice) is the
 * only visible grid; the pair sit in cells near the centre (see `positionPlayer`).
 */
const GRID = 5;

/**
 * Colour of the purple lattice drawn over the scrolling grass tiles to make the
 * 16px (×SCALE) grass cells the field is built from visible. It lives inside the
 * scrolling `world` so it tracks the grass tiles as they slide past.
 */
const GRASS_GRID_COLOR = 0xa855f7; // tailwind purple-500

/** A board cell addressed by zero-based column (A=0) and row (row "1"=0). */
interface Cell {
	col: number;
	row: number;
}

/**
 * Home cells of the line-up: the primary follower at B2, the trainer at C2, and
 * the optional secondary follower at D2. Wild mon walk to the follower or the
 * secondary to battle for XP, or to the trainer to be caught.
 */
const POKEMON_CELL: Cell = { col: 1, row: 1 }; // B2
const TRAINER_CELL: Cell = { col: 2, row: 1 }; // C2
const SECONDARY_CELL: Cell = { col: 3, row: 1 }; // D2

/** Ground scroll speed in pixels-per-frame at a 60fps baseline. */
const SPEED = 2.4;

/**
 * Fraction of a cell a sprite fills. Shared by the line-up (player, trainer,
 * secondary) and the wild mon so every Pokémon on the field reads at the same
 * scale — they only differ by where they're anchored within the cell.
 */
const SPRITE_CELL_FILL = 0.6;

/** Bulbasaur follower sheet (shared with the /followers page). */
const FOLLOWER = '/assets/Characters/Followers/BULBASAUR.png';

/** Native follower frame size — the 256x256 sheet is a 4x4 grid. */
const FOLLOWER_FRAME = 64;

/** Sheet row index for the "facing down" walk cycle (Down, Left, Right, Up). */
const FOLLOWER_DOWN_ROW = 0;

/**
 * Base pixel edge the elemental type-icon strips are built at; the strip is then
 * scaled down to the cell on layout. The icons themselves are the same SVGs the
 * /road species panel shows (static/types/Pokemon_Type_Icon_<Type>.svg).
 */
const TYPE_ICON_BASE = 32;

/** Which trainer charset walks beside Bulbasaur on the road. */
export type TrainerCharacter = 'boy' | 'girl';

/**
 * Trainer *walking* charsets, from the Pokémon Essentials character set. Both are
 * 128x192 / 32x48-frame walk sheets in the same layout, so either can be sliced
 * the same way. These are the players' `@walk_charset`s (not the `_run` running
 * animations): the boy is Red (boy_walk.png = trainer_POKEMONTRAINER_Red) and the
 * girl is Leaf (girl_walk.png = trainer_POKEMONTRAINER_Leaf).
 */
const TRAINER_SHEETS: Record<TrainerCharacter, string> = {
	boy: '/assets/trainer/boy_walk.png',
	girl: '/assets/trainer/girl_walk.png'
};

/** Native trainer frame size — the 128x192 sheet is a 4x4 grid of 32x48 frames. */
const TRAINER_FRAME_W = 32;
const TRAINER_FRAME_H = 48;

/** Sheet row index for the "facing down" walk cycle (front-facing, top row). */
const TRAINER_DOWN_ROW = 0;

/**
 * Wild followers wander up from the bottom of the road to greet the pair. The
 * pool is no longer a fixed pair — it is any Gen-I species whose base SR is within
 * the follower's reach (see `gen1WildPool`), so their walk sheets are sliced and
 * cached lazily the first time each species is rolled. Every follower sheet shares
 * the Bulbasaur 256x256 / 64px-frame layout.
 */

/**
 * Walk-cycle row indices in the follower sheets (Down, Left, Right, Up). Wild mon
 * emerge from row 6 on the A or E edge and approach in their sideways view, so the
 * Left/Right rows drive the animation; all four are still sliced for completeness.
 */
const WILD_DOWN_ROW = 0;
const WILD_LEFT_ROW = 1;
const WILD_RIGHT_ROW = 2;
const WILD_UP_ROW = 3;

/**
 * Frames a wild follower's approach should take (~3s at a 60fps baseline). Each
 * mon's per-frame speed is derived from its own spawn-to-target distance so the
 * whole journey lands in this window regardless of which edge it came from.
 */
const WILD_APPROACH_FRAMES = 180;

/** Cap on simultaneously visible wild followers. */
const WILD_MAX = 3;

/**
 * Floor on simultaneously visible wild followers — the field always carries at
 * least this many. Whenever the count drops below it, the engine spawns straight
 * away (every tick until one lands) instead of waiting out the random timer, so
 * the road is never empty.
 */
const WILD_MIN = 1;

/** Frames between spawns (~60fps baseline), randomised within this range. */
const WILD_SPAWN_MIN = 150;
const WILD_SPAWN_MAX = 420;

/** Frames a wild follower takes to fade out once it reaches the pair (~0.75s). */
const WILD_FADE = 45;

/** Lifetime, in 60fps-baseline frames, of a floating "+N EXP" award (~1.25s). */
const EXP_TEXT_FRAMES = 75;

/** Distance, in px, a floating "+N EXP" award drifts up over its lifetime. */
const EXP_TEXT_RISE = 44;

/** Fraction of an award's life spent fully opaque before it starts to fade. */
const EXP_TEXT_HOLD = 0.6;

/**
 * What an encounter callback hands back for the engine to float above the
 * follower: the XP gained and the type-chart multiplier that scaled it (0, ¼, ½,
 * 1, 2 or 4). The engine renders the multiplier alongside "+N EXP" on impact.
 */
export interface EncounterAward {
	amount: number;
	multiplier: number;
}

export interface RoadGameOptions {
	/** Element the canvas is appended to. */
	container: HTMLElement;
	/**
	 * Current level of Bulbasaur. Wild encounters are spawned at this same level
	 * (read fresh on each spawn so the field tracks Bulbasaur as it grows).
	 * Defaults to 5 when omitted.
	 */
	getPlayerLevel?: () => number;
	/**
	 * Current species name of the player's follower (e.g. "Bulbasaur", or its
	 * evolution). Shown on the level tag and read fresh so it tracks evolutions.
	 * Defaults to "Bulbasaur" when omitted.
	 */
	getPlayerName?: () => string;
	/**
	 * Fired the instant a wild mon reaches the *follower* (the "impact"), with the
	 * encountered species' compendium name. The page turns this into an XP award and
	 * returns the amount gained plus the type multiplier that scaled it, which the
	 * engine floats as "×M +N EXP" above the follower. Wild mon that walk to the
	 * trainer instead are captured, not battled (see `onCapture`), so this fires only
	 * for the follower-bound ones.
	 */
	onEncounter?: (species: string) => EncounterAward | void;
	/**
	 * Fired when a wild mon reaches the *trainer* instead of the follower: it is
	 * caught rather than battled, so it yields no XP — the page adds it to the
	 * player's caught roster.
	 */
	onCapture?: (species: string) => void;
	/**
	 * Current species name of the *secondary* follower (cell D2), or null while
	 * that slot is empty. Read fresh each frame so the engine spawns, swaps or
	 * tears down the D2 sprite as the slot is filled, reassigned or evolves.
	 */
	getSecondaryName?: () => string | null;
	/** Current level of the secondary follower (defaults to the primary's level). */
	getSecondaryLevel?: () => number;
	/**
	 * Fired the instant a wild mon reaches the *secondary* follower — the D2
	 * counterpart of `onEncounter`. The page turns it into an XP award for the
	 * secondary and returns the amount gained plus its type multiplier, which the
	 * engine floats above D2.
	 */
	onSecondaryEncounter?: (species: string) => EncounterAward | void;
	/**
	 * Fired the instant a wild mon steps onto the canvas (spawns), with its species
	 * name, so the page can bump the distinct-species "seen" tally.
	 */
	onSeen?: (species: string) => void;
	/** Distinct species the player has seen, shown on the trainer's counter tag. */
	getSeenCount?: () => number;
	/** Distinct species the player has caught, shown on the trainer's counter tag. */
	getCaughtCount?: () => number;
	/** Trainer charset to start with. Defaults to the boy (Red). */
	character?: TrainerCharacter;
}

/** A wild follower mid-encounter: walking up to the pair, then fading away. */
interface WildMon {
	/** Compendium species name (e.g. "Rattata"), used for the XP award. */
	name: string;
	sprite: AnimatedSprite;
	/** Floating "Lv N" tag rendered above the mon's head. */
	label: Text;
	/** Strip of the species' elemental type icons, pinned left of the level tag. */
	typeIcons: Container;
	speed: number;
	/** World point (one of the pair's feet) the mon walks toward before fading. */
	tx: number;
	ty: number;
	/** The target's home cell — the yellow square the mon collides against. */
	cell: Cell;
	/**
	 * Which slot this mon is walking to: the primary follower (B2) or secondary
	 * follower (D2) battle for XP; the trainer (C2) catches.
	 */
	target: 'primary' | 'secondary' | 'trainer';
	phase: 'approach' | 'fade';
}

/** A "+N EXP" award drifting up and fading out above the follower on impact. */
interface FloatingText {
	text: Text;
	/** Frames elapsed since it spawned, against EXP_TEXT_FRAMES. */
	elapsed: number;
	/** Canvas y it started at, so the rise is measured from a fixed origin. */
	startY: number;
}

/** Level used for wild encounters when no `getPlayerLevel` is supplied. */
const DEFAULT_PLAYER_LEVEL = 5;

/** Species name shown on the player tag when no `getPlayerName` is supplied. */
const DEFAULT_PLAYER_NAME = 'Bulbasaur';

export class RoadGame {
	private readonly container: HTMLElement;
	private readonly options: RoadGameOptions;

	private app = new Application();
	private running = false;
	/**
	 * Paused by default: Bulbasaur and the trainer stand still, the field doesn't
	 * scroll, and no wild Pokémon spawn. The /road page drives this from Claude
	 * Code prompt activity — it resumes while a prompt is running.
	 */
	private paused = true;

	// Display layers.
	private world = new Container();
	/** Sprite grid indexed as `tiles[col][row]`. */
	private tiles: Sprite[][] = [];
	private grass: Texture[] = [];

	/** The water-loop frames, painted on the side bands and animated in `tick`. */
	private water: Texture[] = [];
	/** Current water-loop frame index, advanced on a WATER_FRAME_MS timer. */
	private waterFrame = 0;
	/** Milliseconds accumulated toward the next water-loop frame. */
	private waterElapsed = 0;

	/**
	 * The flower-loop frames, scattered over the grass and animated in `tick`. A
	 * parallel grid of sprites (`flowerTiles`) overlays the grass — shown only on
	 * the cells the scatter picks — and recycles in lockstep with it.
	 */
	private flowers: Texture[] = [];
	/** Sprite grid for the flower overlay, indexed as `flowerTiles[col][row]`. */
	private flowerTiles: Sprite[][] = [];
	/** Current flower-loop frame index, advanced on a FLOWER_FRAME_MS timer. */
	private flowerFrame = 0;
	/** Milliseconds accumulated toward the next flower-loop frame. */
	private flowerElapsed = 0;

	/** Bulbasaur, walking the road in place while the field scrolls past. */
	private player!: AnimatedSprite;

	/** Trainer (boy or girl), walking down beside Bulbasaur. */
	private trainer!: AnimatedSprite;

	/** "Lv N" tag pinned above Bulbasaur, mirroring the wild followers' tags. */
	private playerLabel!: Text;

	/** "Seen N / Caught M" distinct-species counter tag pinned above the trainer. */
	private statsLabel!: Text;

	/**
	 * Strip of the follower's elemental type icons, hung just beneath its feet —
	 * the same icons the /road species panel shows. Rebuilt when the species
	 * changes (evolution); `playerIconsName` tracks which species it was built for.
	 */
	private playerTypeIcons?: Container;
	private playerIconsName = '';

	/**
	 * The optional secondary follower at D2 and its overlays, present only while
	 * the slot is filled. `secondaryRendered` tracks the species currently drawn
	 * ('' when empty) and `secondaryLoading` the species whose sheet is mid-slice,
	 * so `syncSecondary` can spawn, swap or tear down the sprite as the slot changes.
	 */
	private secondarySprite?: AnimatedSprite;
	private secondaryLabel?: Text;
	private secondaryTypeIcons?: Container;
	private secondaryRendered = '';
	private secondaryIconsName = '';
	private secondaryLoading = '';
	/** A species whose follower sheet failed to load, so we don't retry it each frame. */
	private secondaryFailed = '';

	/**
	 * Type-icon textures keyed by capitalized type name (e.g. "Grass"), loaded
	 * lazily and shared by the follower and every wild mon's strip.
	 */
	private typeIcons: Record<string, Texture> = {};

	/** Which charset the trainer currently uses. */
	private trainerCharacter: TrainerCharacter;

	/**
	 * Walk frames per wild species, keyed by species name, indexed by facing row
	 * (0–3). Populated lazily by `ensureWildFrames` the first time a species spawns.
	 */
	private wildFrames: Record<string, Texture[][]> = {};
	/** Species whose walk sheet is mid-load, so we don't kick off a duplicate slice. */
	private wildFrameLoads = new Set<string>();
	/** Wild followers currently on screen. */
	private wild: WildMon[] = [];
	/** "+N EXP" awards floating up above the follower, advanced each tick. */
	private floatingTexts: FloatingText[] = [];
	/** Frames until the next wild spawn. */
	private spawnTimer = WILD_SPAWN_MIN;

	// Scroll state. `offset` is the total distance scrolled (px); `baseRow` is the
	// world-row index currently sitting at the top edge of the viewport.
	private offset = 0;
	private baseRow = 0;
	private cols = 0;
	private rows = 0;

	private resizeObserver?: ResizeObserver;

	constructor(options: RoadGameOptions) {
		this.container = options.container;
		this.options = options;
		this.trainerCharacter = options.character ?? 'boy';
	}

	/** Bulbasaur's current level, from the host page (defaults to L5). */
	private playerLevel(): number {
		return this.options.getPlayerLevel?.() ?? DEFAULT_PLAYER_LEVEL;
	}

	/** The player follower's current species name (defaults to "Bulbasaur"). */
	private playerName(): string {
		return capitalize(this.options.getPlayerName?.() ?? DEFAULT_PLAYER_NAME);
	}

	/** The follower's current base SR, resolved from its species (null if unknown). */
	private playerSr(): number | null {
		return pokemonByName(this.playerName())?.sr ?? null;
	}

	/** The tag text shared by the player and wild mon: name over its level. */
	private levelText(name: string, level: number): string {
		return `${name}\nLv ${level}`;
	}

	/** A white tag with a dark outline — the shared look of every on-field label. */
	private makeTag(text: string): Text {
		return new Text({
			text,
			style: {
				fontFamily: 'monospace',
				fontSize: 24,
				fill: '#ffffff',
				align: 'center',
				stroke: { color: '#1d232a', width: 6 }
			}
		});
	}

	/** A white tag with a dark outline, shared by the player and wild mon. */
	private makeLevelLabel(name: string, level: number): Text {
		return this.makeTag(this.levelText(name, level));
	}

	/** Distinct species seen, from the host page (0 when unsupplied). */
	private seenCount(): number {
		return this.options.getSeenCount?.() ?? 0;
	}

	/** Distinct species caught, from the host page (0 when unsupplied). */
	private caughtCount(): number {
		return this.options.getCaughtCount?.() ?? 0;
	}

	/** The trainer's counter tag: distinct species seen over distinct species caught. */
	private statsText(seen: number, caught: number): string {
		return `Seen ${seen}\nCaught ${caught}`;
	}

	/**
	 * Load (once) and return the elemental type-icon texture for a type, mirroring
	 * the badges on the /road species panel (static/types/Pokemon_Type_Icon_*.svg).
	 * Returns null for an unknown/failed icon so callers can simply skip it.
	 */
	private async loadTypeIcon(type: string): Promise<Texture | null> {
		const cached = this.typeIcons[type];
		if (cached) return cached;
		try {
			// These icons are SVGs with a viewBox but no intrinsic width/height, so the
			// webview reports an inconsistent natural size (often 0) and Texture.from
			// would yield wildly different texture sizes — some icons end up tiny.
			// Fetch the markup and inject explicit width/height, then rasterise onto a
			// fixed-size square canvas, so every type-icon texture is identical and
			// scales uniformly regardless of how the engine sizes a bare-viewBox SVG.
			const res = TYPE_ICON_BASE * 4; // 4× the display base for crispness
			const markup = await fetch(`/types/Pokemon_Type_Icon_${type}.svg`).then((r) => r.text());
			const sized = markup.replace(/<svg\b/, `<svg width="${res}" height="${res}"`);
			const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
			try {
				const img = await this.loadImage(url);
				const canvas = document.createElement('canvas');
				canvas.width = res;
				canvas.height = res;
				const ctx = canvas.getContext('2d');
				if (!ctx) return null;
				ctx.drawImage(img, 0, 0, res, res);
				const tex = Texture.from(canvas);
				this.typeIcons[type] = tex;
				return tex;
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch {
			return null;
		}
	}

	/**
	 * Populate `box` with a species' elemental type icons stacked in a vertical
	 * column, built at TYPE_ICON_BASE and centred on (0,0) (so the column can
	 * simply be scaled and pinned beside a tag). A dual-type mon thus shows its two
	 * badges one above the other. Unknown species yield an empty column.
	 */
	private async fillTypeIcons(box: Container, name: string): Promise<void> {
		const types = pokemonByName(name)?.types ?? [];
		const textures = await Promise.all(types.map((t) => this.loadTypeIcon(t)));
		if (box.destroyed) return;
		const icons = textures.filter((t): t is Texture => t !== null);
		const gap = TYPE_ICON_BASE * 0.2;
		const total = icons.length * TYPE_ICON_BASE + Math.max(0, icons.length - 1) * gap;
		let y = -total / 2;
		for (const tex of icons) {
			const sprite = new Sprite(tex);
			sprite.width = TYPE_ICON_BASE;
			sprite.height = TYPE_ICON_BASE;
			sprite.anchor.set(0.5, 0); // top edge, horizontally centred on the column
			sprite.y = y;
			box.addChild(sprite);
			y += TYPE_ICON_BASE + gap;
		}
	}

	/**
	 * Pin a type-icon strip on the same row as a level tag, butted against the tag's
	 * left edge. The strip is built centred on (0,0), so we offset by its scaled
	 * half-width and centre it on the tag's vertical midline — which sits above or
	 * below the tag's origin depending on its anchor (player tag anchors at its
	 * bottom, wild tags at their top). Icons are sized to about one text line so the
	 * strip reads as part of the tag.
	 */
	private placeIconsLeftOfLabel(box: Container, label: Text): void {
		const size = label.height * 0.45;
		box.scale.set(size / TYPE_ICON_BASE);
		const gap = size * 0.35;
		box.x = label.x - label.width / 2 - gap - box.width / 2;
		box.y = label.y + (0.5 - label.anchor.y) * label.height;
	}

	/**
	 * (Re)build the follower's type-icon strip for its current species and swap it
	 * in. A later evolution (or teardown) may supersede an in-flight build, so the
	 * result is discarded unless the species is still current.
	 */
	private async refreshPlayerTypeIcons(): Promise<void> {
		const name = this.playerName();
		this.playerIconsName = name;
		const box = new Container();
		await this.fillTypeIcons(box, name);
		if (!this.running || this.playerIconsName !== name) {
			box.destroy({ children: true });
			return;
		}
		this.playerTypeIcons?.destroy({ children: true });
		this.playerTypeIcons = box;
		this.app.stage.addChild(box);
		this.positionPlayerTypeIcons();
	}

	/** Pin the follower's type strip on the same row as its level tag, to its left. */
	private positionPlayerTypeIcons(): void {
		if (!this.playerTypeIcons || !this.playerLabel) return;
		this.placeIconsLeftOfLabel(this.playerTypeIcons, this.playerLabel);
	}

	// --- secondary follower (D2) ---------------------------------------------

	/** The secondary slot's desired species name (display-cased), or null when empty. */
	private desiredSecondary(): string | null {
		const name = this.options.getSecondaryName?.();
		return name ? capitalize(name) : null;
	}

	/** The secondary follower's current level (defaults to the primary's). */
	private secondaryLevel(): number {
		return this.options.getSecondaryLevel?.() ?? this.playerLevel();
	}

	/**
	 * Reconcile the D2 sprite with the secondary slot each frame: build it when the
	 * slot is filled, swap its sheet when the species changes (assignment/evolution),
	 * tear it down when the slot empties, and otherwise just keep its level tag live.
	 */
	private syncSecondary(): void {
		const desired = this.desiredSecondary();

		if (!desired) {
			if (this.secondaryRendered || this.secondarySprite) this.teardownSecondary();
			return;
		}

		// A new species (first fill, reassignment or evolution) rebuilds the sprite —
		// unless its sheet already failed to load, in which case we don't retry it.
		if (desired !== this.secondaryRendered) {
			if (desired !== this.secondaryFailed) void this.buildSecondary(desired);
			return;
		}

		// Same species: keep the name/level tag in step with the live progression.
		if (this.secondarySprite && this.secondaryLabel) {
			const tag = this.levelText(desired, this.secondaryLevel());
			if (this.secondaryLabel.text !== tag) {
				this.secondaryLabel.text = tag;
				this.positionSecondaryTypeIcons();
			}
		}
	}

	/**
	 * Build (or swap the sheet of) the D2 follower for `name`, slicing its walk
	 * sheet the same way the primary's is. The slice is async, so a later change
	 * (reassignment, evolution, teardown) may supersede an in-flight build — the
	 * result is discarded unless the species is still the one we want.
	 */
	private async buildSecondary(name: string): Promise<void> {
		if (this.secondaryLoading === name) return;
		this.secondaryLoading = name;

		const url = `/assets/Characters/Followers/${spriteStem(name)}.png`;
		let frames: Texture[];
		try {
			frames = await this.sliceRow(url, FOLLOWER_FRAME, FOLLOWER_FRAME, FOLLOWER_DOWN_ROW, 4);
		} catch {
			// Missing/!256² sheet — flag it so we don't re-fetch every frame; a later
			// assignment to a different species clears past it.
			if (this.secondaryLoading === name) this.secondaryLoading = '';
			this.secondaryFailed = name;
			return;
		}

		// The build may have straddled a teardown or a newer desired species.
		if (!this.running || this.desiredSecondary() !== name) {
			if (this.secondaryLoading === name) this.secondaryLoading = '';
			return;
		}

		if (!this.secondarySprite) {
			this.secondarySprite = new AnimatedSprite(frames);
			this.secondarySprite.anchor.set(0.5, 0.5);
			this.secondarySprite.animationSpeed = 0.12;
			this.app.stage.addChild(this.secondarySprite);

			this.secondaryLabel = this.makeLevelLabel(name, this.secondaryLevel());
			this.secondaryLabel.anchor.set(0.5, 1);
			this.app.stage.addChild(this.secondaryLabel);
		} else {
			this.secondarySprite.textures = frames;
			if (this.secondaryLabel) this.secondaryLabel.text = this.levelText(name, this.secondaryLevel());
		}

		this.secondaryRendered = name;
		this.secondaryLoading = '';
		if (this.paused) this.secondarySprite.gotoAndStop(0);
		else this.secondarySprite.play();

		this.positionSecondary();
		void this.refreshSecondaryTypeIcons();
	}

	/** Scale and centre the D2 follower in its cell and pin its level tag above it. */
	private positionSecondary(): void {
		if (!this.secondarySprite) return;
		const cs = this.cellSize();
		this.secondarySprite.scale.set((cs * SPRITE_CELL_FILL) / FOLLOWER_FRAME);
		const centre = this.cellCentre(SECONDARY_CELL);
		this.secondarySprite.x = centre.x;
		this.secondarySprite.y = centre.y;
		if (this.secondaryLabel) {
			this.secondaryLabel.x = this.secondarySprite.x;
			this.secondaryLabel.y = this.secondarySprite.y - this.secondarySprite.height / 2 - 4;
		}
		this.positionSecondaryTypeIcons();
	}

	/** Pin the secondary's type strip on the same row as its level tag, to its left. */
	private positionSecondaryTypeIcons(): void {
		if (!this.secondaryTypeIcons || !this.secondaryLabel) return;
		this.placeIconsLeftOfLabel(this.secondaryTypeIcons, this.secondaryLabel);
	}

	/**
	 * (Re)build the secondary follower's type-icon strip for its current species and
	 * swap it in, mirroring `refreshPlayerTypeIcons`. A later change may supersede an
	 * in-flight build, so the result is discarded unless the species is still current.
	 */
	private async refreshSecondaryTypeIcons(): Promise<void> {
		if (!this.secondarySprite) return;
		const name = this.secondaryRendered;
		this.secondaryIconsName = name;
		const box = new Container();
		await this.fillTypeIcons(box, name);
		if (!this.running || !this.secondarySprite || this.secondaryIconsName !== name) {
			box.destroy({ children: true });
			return;
		}
		this.secondaryTypeIcons?.destroy({ children: true });
		this.secondaryTypeIcons = box;
		this.app.stage.addChild(box);
		this.positionSecondaryTypeIcons();
	}

	/** Tear down the D2 follower and its overlays when the slot empties. */
	private teardownSecondary(): void {
		this.secondarySprite?.destroy();
		this.secondaryLabel?.destroy();
		this.secondaryTypeIcons?.destroy({ children: true });
		this.secondarySprite = undefined;
		this.secondaryLabel = undefined;
		this.secondaryTypeIcons = undefined;
		this.secondaryRendered = '';
		this.secondaryIconsName = '';
		this.secondaryLoading = '';
		this.secondaryFailed = '';
	}

	/** Boot Pixi, load the grass tiles, and start scrolling immediately. */
	async start(): Promise<void> {
		await this.app.init({
			width: this.containerWidth(),
			height: this.containerHeight(),
			background: '#1d232a',
			antialias: false,
			autoDensity: true,
			resolution: window.devicePixelRatio || 1
		});

		// The canvas is a centred square; it carries the field's frame (the bare
		// flex container no longer does), matching the old bordered look.
		this.app.canvas.className = 'rounded-box border border-base-300 shadow-inner';
		this.container.appendChild(this.app.canvas);
		this.app.stage.addChild(this.world);

		await this.loadTiles();
		this.buildGrid();
		await this.buildPlayer();

		this.resizeObserver = new ResizeObserver(() => this.handleResize());
		this.resizeObserver.observe(this.container);

		this.app.ticker.add(this.tick, this);
		this.running = true;
	}

	/** Tear everything down — safe to call multiple times. */
	destroy(): void {
		this.running = false;
		this.resizeObserver?.disconnect();
		// Removes the ticker, stage and canvas; frees GPU textures.
		this.app.destroy(true, { children: true, texture: true });
	}

	// --- asset loading -------------------------------------------------------

	private async loadTiles(): Promise<void> {
		const load = (url: string) =>
			this.loadImage(url).then((img) => {
				const tex = Texture.from(img);
				tex.source.scaleMode = 'nearest';
				return tex;
			});
		[this.grass, this.water, this.flowers] = await Promise.all([
			Promise.all(GRASS_TILES.map(load)),
			Promise.all(WATER_TILES.map(load)),
			Promise.all(FLOWER_TILES.map(load))
		]);
	}

	/**
	 * Return a wild species' four walk cycles (Down, Left, Right, Up) if they are
	 * already sliced, else kick off a one-time background slice of its follower
	 * sheet and return null for now — the next spawn tick will pick it up once the
	 * sheet has loaded. A sheet that fails to load (missing asset) is simply never
	 * cached, so that species quietly drops out of the rotation.
	 */
	private ensureWildFrames(name: string): Texture[][] | null {
		const cached = this.wildFrames[name];
		if (cached) return cached;
		if (!this.wildFrameLoads.has(name)) {
			this.wildFrameLoads.add(name);
			const url = `/assets/Characters/Followers/${spriteStem(name)}.png`;
			Promise.all(
				[WILD_DOWN_ROW, WILD_LEFT_ROW, WILD_RIGHT_ROW, WILD_UP_ROW].map((row) =>
					this.sliceRow(url, FOLLOWER_FRAME, FOLLOWER_FRAME, row, 4)
				)
			)
				.then((rows) => {
					this.wildFrames[name] = rows;
				})
				.catch(() => {
					/* missing/!256² sheet — leave uncached so the species is skipped */
				})
				.finally(() => this.wildFrameLoads.delete(name));
		}
		return null;
	}

	/** Build Bulbasaur and the boy trainer, walking down side by side. */
	private async buildPlayer(): Promise<void> {
		const [bulbaFrames, trainerFrames] = await Promise.all([
			this.sliceRow(FOLLOWER, FOLLOWER_FRAME, FOLLOWER_FRAME, FOLLOWER_DOWN_ROW, 4),
			this.sliceRow(
				TRAINER_SHEETS[this.trainerCharacter],
				TRAINER_FRAME_W,
				TRAINER_FRAME_H,
				TRAINER_DOWN_ROW,
				4
			)
		]);

		// Anchored at their centre so they sit centred — horizontally and
		// vertically — within their board cell (see positionPlayer).
		this.player = new AnimatedSprite(bulbaFrames);
		this.player.anchor.set(0.5, 0.5);
		this.player.animationSpeed = 0.12; // ~7fps, matching the followers page walk

		this.trainer = new AnimatedSprite(trainerFrames);
		this.trainer.anchor.set(0.5, 0.5);
		this.trainer.animationSpeed = 0.12;

		// The pair render in front of the scrolling grass world. `positionPlayer`
		// scales and places them; whether the sprites animate is decided by the
		// current pause state.
		this.app.stage.addChild(this.player);
		this.app.stage.addChild(this.trainer);

		// Bulbasaur's level tag rides above its head — anchored from its bottom edge
		// so it sits over the sprite, the opposite of the wild followers' tags.
		this.playerLabel = this.makeLevelLabel(this.playerName(), this.playerLevel());
		this.playerLabel.anchor.set(0.5, 1);
		this.app.stage.addChild(this.playerLabel);

		// The player's distinct seen/caught counters ride above the trainer's head,
		// the same way the level tag rides above the follower.
		this.statsLabel = this.makeTag(this.statsText(this.seenCount(), this.caughtCount()));
		this.statsLabel.anchor.set(0.5, 1);
		this.app.stage.addChild(this.statsLabel);

		this.positionPlayer();
		this.refreshAnimations();
		// Hang the follower's elemental type icons beneath its feet (async: textures
		// load in the background, then the strip is swapped in and positioned).
		void this.refreshPlayerTypeIcons();
	}

	/**
	 * Resume or pause the walk. While paused, the pair stand still, the field
	 * stops scrolling, and no wild Pokémon spawn (see `tick`). Safe to call
	 * before the sprites are built — the state is applied once they exist.
	 */
	setPaused(paused: boolean): void {
		if (this.paused === paused) return;
		this.paused = paused;
		this.refreshAnimations();
	}

	/** Play or stop every walk-cycle sprite to match the current pause state. */
	private refreshAnimations(): void {
		const apply = (sprite?: AnimatedSprite) => {
			if (!sprite) return;
			// Pausing freezes the walk on the neutral standing frame (index 0) rather
			// than halting mid-stride, so the pair reset to an idle pose on pause.
			if (this.paused) sprite.gotoAndStop(0);
			else sprite.play();
		};
		apply(this.player);
		apply(this.trainer);
		apply(this.secondarySprite);
		for (const mon of this.wild) apply(mon.sprite);
	}

	/**
	 * Swap the trainer walking beside Bulbasaur between the boy (Red) and girl
	 * charsets — both 128×192 / 32×48-frame walk sheets. Safe to call before the
	 * trainer is built (the choice is applied on creation) or after teardown.
	 */
	async setTrainerCharacter(character: TrainerCharacter): Promise<void> {
		if (this.trainerCharacter === character) return;
		this.trainerCharacter = character;
		if (!this.running || !this.trainer) return;
		const frames = await this.sliceRow(
			TRAINER_SHEETS[character],
			TRAINER_FRAME_W,
			TRAINER_FRAME_H,
			TRAINER_DOWN_ROW,
			4
		);
		// The async slice may straddle a teardown or a later switch; re-check.
		if (!this.running || !this.trainer || this.trainerCharacter !== character) return;
		this.trainer.textures = frames;
		this.trainer.animationSpeed = 0.12;
		if (!this.paused) this.trainer.play();
	}

	/**
	 * Swap Bulbasaur's walking sprite for an evolved form's follower sheet
	 * (same 256×256 / 64px-frame layout). Called by the host page when Bulbasaur
	 * evolves. Safe to call before the player exists or after teardown.
	 */
	async setPlayerSprite(spriteUrl: string): Promise<void> {
		if (!this.running || !this.player) return;
		const frames = await this.sliceRow(spriteUrl, FOLLOWER_FRAME, FOLLOWER_FRAME, FOLLOWER_DOWN_ROW, 4);
		// The async slice may straddle a teardown; re-check before mutating.
		if (!this.running || !this.player) return;
		this.player.textures = frames;
		this.player.animationSpeed = 0.12;
		if (!this.paused) this.player.play();
	}

	/**
	 * Slice a horizontal strip of `count` frames from one row of a sprite sheet,
	 * keeping the pixel art crisp.
	 */
	private async sliceRow(
		url: string,
		frameW: number,
		frameH: number,
		row: number,
		count: number
	): Promise<Texture[]> {
		const sheet = Texture.from(await this.loadImage(url));
		sheet.source.scaleMode = 'nearest';

		const frames: Texture[] = [];
		for (let i = 0; i < count; i++) {
			frames.push(
				new Texture({
					source: sheet.source,
					frame: new Rectangle(i * frameW, row * frameH, frameW, frameH)
				})
			);
		}
		return frames;
	}

	/**
	 * Place Bulbasaur at B2 and the trainer at C2, scaled to fit a cell and centred
	 * within it, then (re)draw the lattice, labels and cell highlight.
	 */
	private positionPlayer(): void {
		if (!this.player || !this.trainer) return;
		const cs = this.cellSize();

		// Scale each sprite so it sits comfortably inside a single cell, whatever
		// the board's measured size.
		this.player.scale.set((cs * SPRITE_CELL_FILL) / FOLLOWER_FRAME);
		this.trainer.scale.set((cs * SPRITE_CELL_FILL) / TRAINER_FRAME_H);

		// Centre each sprite in its home cell (both are anchored at 0.5, 0.5).
		const pokemon = this.cellCentre(POKEMON_CELL);
		const trainer = this.cellCentre(TRAINER_CELL);
		this.player.x = pokemon.x;
		this.player.y = pokemon.y;
		this.trainer.x = trainer.x;
		this.trainer.y = trainer.y;

		// Pin the level tag just above Bulbasaur's head (sprite anchors at its centre).
		if (this.playerLabel) {
			this.playerLabel.x = this.player.x;
			this.playerLabel.y = this.player.y - this.player.height / 2 - 4;
		}

		this.positionPlayerTypeIcons();

		// Pin the seen/caught counters just above the trainer's head.
		if (this.statsLabel) {
			this.statsLabel.x = this.trainer.x;
			this.statsLabel.y = this.trainer.y - this.trainer.height / 2 - 4;
		}

		this.positionSecondary();
	}

	/** Canvas coordinates of the centre of a board cell. */
	private cellCentre(cell: Cell): { x: number; y: number } {
		const cs = this.cellSize();
		const o = this.origin();
		return { x: o + (cell.col + 0.5) * cs, y: o + (cell.row + 0.5) * cs };
	}

	/**
	 * Distance from a point to the nearest edge of a board cell — the yellow square
	 * the wild mon collides with. Returns 0 once the point is inside the cell.
	 */
	private distanceToCell(x: number, y: number, cell: Cell): number {
		const cs = this.cellSize();
		const o = this.origin();
		const left = o + cell.col * cs;
		const top = o + cell.row * cs;
		const ddx = Math.max(left - x, 0, x - (left + cs));
		const ddy = Math.max(top - y, 0, y - (top + cs));
		return Math.hypot(ddx, ddy);
	}

	/**
	 * Decode an image up front so we control the `scaleMode` before the texture
	 * is first uploaded — avoids a blurry first frame on the pixel art.
	 */
	private loadImage(url: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load ${url}`));
			img.src = url;
		});
	}

	// --- scene construction --------------------------------------------------

	/** (Re)build the recycling tile grid sized to the current viewport. */
	private buildGrid(): void {
		this.world.removeChildren();
		this.tiles = [];
		this.flowerTiles = [];

		// One spare row/column beyond the viewport so a tile is always ready to
		// slide in as the world scrolls.
		this.cols = Math.ceil(this.containerWidth() / DISPLAY) + 1;
		this.rows = Math.ceil(this.containerHeight() / DISPLAY) + 2;

		// Centre the tile grid horizontally so the columns (and thus the water bands
		// down each side) sit symmetrically: the grid is one-plus columns wider than
		// the canvas, so we split that overflow evenly across both edges. Without this
		// the whole grid starts at x=0 and overflows only on the right, leaving the
		// green walkable corridor between the water bands displaced rightward.
		// `world.y` carries the vertical scroll; this `x` stays fixed.
		this.world.x = Math.round((this.containerWidth() - this.cols * DISPLAY) / 2);

		for (let c = 0; c < this.cols; c++) {
			const column: Sprite[] = [];
			for (let r = 0; r < this.rows; r++) {
				const sprite = new Sprite(this.grass[0]);
				sprite.width = DISPLAY;
				sprite.height = DISPLAY;
				sprite.x = c * DISPLAY;
				sprite.y = r * DISPLAY;
				this.world.addChild(sprite);
				column.push(sprite);
			}
			this.tiles.push(column);
		}

		// Overlay a purple lattice on the grass, one line per tile boundary, so the
		// 16px (×SCALE) grass cells the field is built from are visible. It lives in
		// `world` (added after the tiles, so it draws on top of them) and therefore
		// scrolls with the grass; the lines repeat every DISPLAY, so the sub-tile
		// `world.y` slide stays seamless.
		const grassGrid = new Graphics();
		for (let c = 0; c <= this.cols; c++) {
			grassGrid.moveTo(c * DISPLAY, 0).lineTo(c * DISPLAY, this.rows * DISPLAY);
		}
		for (let r = 0; r <= this.rows; r++) {
			grassGrid.moveTo(0, r * DISPLAY).lineTo(this.cols * DISPLAY, r * DISPLAY);
		}
		grassGrid.stroke({ color: GRASS_GRID_COLOR, width: 1, alpha: 0.5 });
		this.world.addChild(grassGrid);

		// A parallel grid of flower sprites, one per cell, layered above the grass
		// (and its lattice — added last) and recycled in lockstep with it. Each is
		// shown only on the cells the deterministic scatter picks (see `paintRows`);
		// the rest stay hidden. Living in `world`, they scroll with the grass.
		for (let c = 0; c < this.cols; c++) {
			const column: Sprite[] = [];
			for (let r = 0; r < this.rows; r++) {
				const sprite = new Sprite(this.flowers[0]);
				sprite.width = DISPLAY;
				sprite.height = DISPLAY;
				sprite.x = c * DISPLAY;
				sprite.y = r * DISPLAY;
				sprite.visible = false;
				this.world.addChild(sprite);
				column.push(sprite);
			}
			this.flowerTiles.push(column);
		}

		// Force an initial paint for the starting world position.
		this.baseRow = Math.floor(this.offset / DISPLAY);
		this.paintRows();
	}

	/**
	 * Assign each cell the grass variant for its *world* coordinates. Mixing the
	 * world column and row indices yields a diagonal, evenly-distributed
	 * alternation across all four tiles that stays continuous as we scroll.
	 */
	private paintRows(): void {
		const waterTex = this.water[this.waterFrame];
		const flowerTex = this.flowers[this.flowerFrame];
		for (let c = 0; c < this.cols; c++) {
			// The WATER_BAND outermost columns on each side edge are water, not grass —
			// and carry no flowers.
			if (this.isWaterCol(c)) {
				for (let r = 0; r < this.rows; r++) {
					this.tiles[c][r].texture = waterTex;
					this.flowerTiles[c][r].visible = false;
				}
				continue;
			}
			for (let r = 0; r < this.rows; r++) {
				// Rows further down (larger r) hold larger world-rows; the field
				// scrolls up away from the viewer as `baseRow` climbs.
				const worldRow = this.baseRow + r;
				const variant = (((c + worldRow) % this.grass.length) + this.grass.length) % this.grass.length;
				this.tiles[c][r].texture = this.grass[variant];

				// Sprout a flower patch on the cells the scatter picks, keyed off the
				// cell's *world* coordinates so a patch reappears at the same spot when
				// its row recycles back into view; bare cells hide their flower sprite.
				const flower = this.flowerTiles[c][r];
				if (this.flowerAt(c, worldRow)) {
					flower.visible = true;
					flower.texture = flowerTex;
				} else {
					flower.visible = false;
				}
			}
		}
	}

	/**
	 * Whether the grass cell at the given world coordinates sprouts a flower patch.
	 * A stable hash of the world cell yields a uniform value; the lowest
	 * FLOWER_DENSITY fraction sprouts flowers. Deterministic, so a patch stays put
	 * at its world cell as the field scrolls and its row recycles.
	 */
	private flowerAt(col: number, worldRow: number): boolean {
		const h = Math.sin(col * 127.1 + worldRow * 311.7) * 43758.5453;
		return h - Math.floor(h) < FLOWER_DENSITY;
	}

	/** Re-stamp every visible flower patch with the current flower-loop frame. */
	private paintFlowers(): void {
		const tex = this.flowers[this.flowerFrame];
		for (let c = 0; c < this.cols; c++) {
			if (this.isWaterCol(c)) continue;
			const column = this.flowerTiles[c];
			for (let r = 0; r < this.rows; r++) {
				if (column[r].visible) column[r].texture = tex;
			}
		}
	}

	/** True for the WATER_BAND tile columns on each side edge of the field. */
	private isWaterCol(c: number): boolean {
		return c < WATER_BAND || c >= this.cols - WATER_BAND;
	}

	/** Re-stamp just the side water columns with the current water-loop frame. */
	private paintWater(): void {
		const waterTex = this.water[this.waterFrame];
		for (let c = 0; c < this.cols; c++) {
			if (!this.isWaterCol(c)) continue;
			for (let r = 0; r < this.rows; r++) this.tiles[c][r].texture = waterTex;
		}
	}

	// --- main loop -----------------------------------------------------------

	private tick(ticker: Ticker): void {
		if (!this.running) return;
		// While paused the world is frozen: no scroll, no spawns, no movement.
		// Sprite walk-cycles are halted separately via refreshAnimations().
		if (this.paused) return;

		// Normalise to a 60fps baseline so the scroll is frame-rate independent.
		const dt = Math.min(ticker.deltaTime, 2.5);
		this.offset += SPEED * dt;

		// Repaint only when a whole new row has scrolled into view.
		const newBaseRow = Math.floor(this.offset / DISPLAY);
		if (newBaseRow !== this.baseRow) {
			this.baseRow = newBaseRow;
			this.paintRows();
		}

		// Slide the grid up by the sub-tile remainder; the row recycling above
		// handles every whole-tile step, so this stays within (-DISPLAY, 0].
		this.world.y = -(this.offset % DISPLAY);

		// Advance the water-loop on its own ms timer (every side-band tile shares
		// the frame), re-stamping the water columns whenever it ticks over.
		this.waterElapsed += ticker.deltaMS;
		if (this.waterElapsed >= WATER_FRAME_MS) {
			const steps = Math.floor(this.waterElapsed / WATER_FRAME_MS);
			this.waterElapsed -= steps * WATER_FRAME_MS;
			this.waterFrame = (this.waterFrame + steps) % this.water.length;
			this.paintWater();
		}

		// Advance the flower-loop on its own ms timer (every patch shares the frame),
		// re-stamping the scattered flower sprites whenever it ticks over so the beds
		// sway in sync, matching the /map-assets preview.
		this.flowerElapsed += ticker.deltaMS;
		if (this.flowerElapsed >= FLOWER_FRAME_MS) {
			const steps = Math.floor(this.flowerElapsed / FLOWER_FRAME_MS);
			this.flowerElapsed -= steps * FLOWER_FRAME_MS;
			this.flowerFrame = (this.flowerFrame + steps) % this.flowers.length;
			this.paintFlowers();
		}

		// Keep Bulbasaur's tag in step with its live name and level (both change on
		// encounters: the level climbs and the species can evolve).
		const tag = this.levelText(this.playerName(), this.playerLevel());
		if (this.playerLabel.text !== tag) {
			this.playerLabel.text = tag;
			// The tag's width shifts with the level/name, so re-butt the strip to it.
			this.positionPlayerTypeIcons();
		}

		// Re-roll the type-icon strip when the follower evolves into a new species.
		if (this.playerIconsName !== this.playerName()) void this.refreshPlayerTypeIcons();

		// Keep the trainer's seen/caught counters live as new mon are sighted/caught.
		const stats = this.statsText(this.seenCount(), this.caughtCount());
		if (this.statsLabel.text !== stats) this.statsLabel.text = stats;

		// Spawn, swap, retag or tear down the D2 follower to match the secondary slot.
		this.syncSecondary();

		this.updateWild(dt);
		this.updateFloatingTexts(dt);
	}

	// --- wild followers ------------------------------------------------------

	/** Drive spawns and advance every wild follower through its encounter. */
	private updateWild(dt: number): void {
		this.spawnTimer -= dt;
		// Spawn when the random timer elapses, or immediately whenever the field has
		// fallen below WILD_MIN so there's always at least one mon on the road. A
		// spawn can no-op while a species' frames are still loading (or the pool is
		// momentarily empty), so below the floor we keep retrying every tick — the
		// timer is only reset once a mon actually lands or we've hit the cap.
		if (this.wild.length < WILD_MIN || this.spawnTimer <= 0) {
			if (this.spawnWild() || this.wild.length >= WILD_MAX) {
				this.spawnTimer = WILD_SPAWN_MIN + Math.random() * (WILD_SPAWN_MAX - WILD_SPAWN_MIN);
			}
		}

		// Walk backwards so removals don't disturb the iteration.
		for (let i = this.wild.length - 1; i >= 0; i--) {
			const mon = this.wild[i];
			switch (mon.phase) {
				case 'approach': {
					// Walk in a straight line from the spawn edge toward the pair, and
					// collide when the mon's feet reach the target's yellow cell rather
					// than a fixed radius around the sprite's centre.
					const dx = mon.tx - mon.sprite.x;
					const dy = mon.ty - mon.sprite.y;
					const dist = Math.hypot(dx, dy);
					if (this.distanceToCell(mon.sprite.x, mon.sprite.y, mon.cell) <= 0 || dist <= 0) {
						mon.phase = 'fade';
						// Impact: the mon has reached its target. A trainer-bound mon is
						// caught (no XP); a follower- or secondary-bound one is battled for
						// XP, floated as "+N EXP" above that slot. Either way it dissolves.
						if (mon.target === 'trainer') {
							this.options.onCapture?.(mon.name);
							this.spawnCaughtText();
						} else if (mon.target === 'secondary') {
							const award = this.options.onSecondaryEncounter?.(mon.name);
							if (award) {
								this.spawnExpText(award, this.secondarySprite, this.secondaryLabel);
							}
						} else {
							const award = this.options.onEncounter?.(mon.name);
							if (award) {
								this.spawnExpText(award, this.player, this.playerLabel);
							}
						}
					} else {
						const step = mon.speed * dt;
						mon.sprite.x += (dx / dist) * step;
						mon.sprite.y += (dy / dist) * step;
					}
					break;
				}
				case 'fade':
					// Dissolve in place once it has reached the pair.
					mon.sprite.alpha -= dt / WILD_FADE;
					if (mon.sprite.alpha <= 0) {
						mon.sprite.destroy();
						mon.label.destroy();
						mon.typeIcons.destroy({ children: true });
						this.wild.splice(i, 1);
						continue;
					}
					break;
			}
			// Keep the level tag pinned just below the mon's feet and fading with it.
			// The sprite anchors at its bottom (0.5, 1), so sprite.y is the feet line.
			mon.label.x = mon.sprite.x;
			mon.label.y = mon.sprite.y + 4;
			mon.label.alpha = mon.sprite.alpha;
			// Pin the type-icon strip on the same row as the level tag, to its left,
			// fading in lockstep with the sprite.
			this.placeIconsLeftOfLabel(mon.typeIcons, mon.label);
			mon.typeIcons.alpha = mon.sprite.alpha;
			// Lift the tag and icons above every sprite so a later spawn can't draw over them.
			this.app.stage.addChild(mon.typeIcons);
			this.app.stage.addChild(mon.label);
		}
	}

	/**
	 * Spawn one wild follower just off the bottom of the field — "row 6", one cell
	 * below the bottom edge — on column B, C or D (never the A or E edges), and
	 * send it walking up toward Bulbasaur or the trainer. It mostly walks straight up
	 * (facing up); if it has to drift sideways to reach its target cell it turns to
	 * face that way instead. Returns true when a mon actually landed on the canvas,
	 * false when the spawn no-ops (cap reached, empty pool, or frames still loading).
	 */
	private spawnWild(): boolean {
		if (this.wild.length >= WILD_MAX) return false;

		// The pool is any Gen-I species whose base SR is within the follower's reach
		// — its current SR's next step up the dex-wide ladder. Rolled fresh on every
		// spawn so the field widens as the follower's SR climbs (e.g. an SR-5 mon
		// draws SR ≤ 8 foes). Frames load lazily; skip this tick if not ready yet.
		const pool = gen1WildPool(this.playerSr());
		if (pool.length === 0) return false;

		const species = pool[Math.floor(Math.random() * pool.length)];
		const frames = this.ensureWildFrames(species.name);
		if (!frames) return false;

		const name = species.name;
		const cs = this.cellSize();
		const o = this.origin();

		// Emerge from row 6 (one row below the grid, off-screen) on column B, C or D
		// (indices 1–3) so they never come up the A or E edges.
		const col = 1 + Math.floor(Math.random() * 3); // B (1), C (2) or D (3)
		const row = GRID; // row index 5 == "row 6", below the visible board
		const startX = o + (col + 0.5) * cs;
		const startY = o + (row + 0.5) * cs;

		// Approach whichever slot we roll for: the primary follower and the trainer
		// are always in play, the secondary follower only while its D2 slot is
		// filled. Each is equally likely. It walks mostly up; if the target sits to
		// one side it turns to face that way, else it faces up.
		const slots: WildMon['target'][] = ['primary', 'trainer'];
		if (this.secondarySprite) slots.push('secondary');
		const slot = slots[Math.floor(Math.random() * slots.length)];
		const target =
			slot === 'primary' ? this.player : slot === 'secondary' ? this.secondarySprite! : this.trainer;
		const targetCell =
			slot === 'primary' ? POKEMON_CELL : slot === 'secondary' ? SECONDARY_CELL : TRAINER_CELL;
		const dxToTarget = target.x - startX;
		const facing =
			Math.abs(dxToTarget) < cs * 0.25
				? WILD_UP_ROW
				: dxToTarget < 0
					? WILD_LEFT_ROW
					: WILD_RIGHT_ROW;

		const sprite = new AnimatedSprite(frames[facing]);
		sprite.anchor.set(0.5, 1);
		sprite.scale.set((cs * SPRITE_CELL_FILL) / FOLLOWER_FRAME);
		sprite.animationSpeed = 0.12;
		sprite.x = startX;
		sprite.y = startY;
		sprite.play();
		this.app.stage.addChild(sprite);

		// The mon has stepped onto the canvas — count it toward the distinct "seen" tally.
		this.options.onSeen?.(name);

		// The wild mon rolls a random level somewhere between the primary and
		// secondary follower levels (inclusive) — tag it with its (already
		// display-cased) species name so that's visible on the road.
		const primaryLevel = this.playerLevel();
		const secondaryLevel = this.secondaryLevel();
		const minLevel = Math.min(primaryLevel, secondaryLevel);
		const maxLevel = Math.max(primaryLevel, secondaryLevel);
		const encounterLevel = minLevel + Math.floor(Math.random() * (maxLevel - minLevel + 1));
		const label = this.makeLevelLabel(name, encounterLevel);
		// Anchored from its top edge so it hangs just beneath the mon's feet.
		label.anchor.set(0.5, 0);
		this.app.stage.addChild(label);

		// The mon's elemental type icons sit beside its level tag. The container is
		// added now and filled in the background; `updateWild` scales and pins it.
		const typeIcons = new Container();
		this.app.stage.addChild(typeIcons);
		void this.fillTypeIcons(typeIcons, name);

		// Pace the walk so the whole approach lands in the fixed window: cover the
		// spawn-to-cell distance over WILD_APPROACH_FRAMES, whatever its length.
		const journey = this.distanceToCell(startX, startY, targetCell);

		this.wild.push({
			name,
			sprite,
			label,
			typeIcons,
			speed: journey / WILD_APPROACH_FRAMES,
			tx: target.x,
			ty: target.y,
			cell: targetCell,
			target: slot,
			phase: 'approach'
		});
		return true;
	}

	// --- floating XP awards --------------------------------------------------

	/**
	 * Float a "+N EXP" award above a battling follower on impact. It spawns just
	 * over that follower's level tag (the primary or the secondary), then drifts up
	 * and fades in `updateFloatingTexts`.
	 */
	private spawnExpText(award: EncounterAward, sprite?: AnimatedSprite, label?: Text): void {
		if (!sprite) return;
		// Start just above the follower's level tag when present, else over its head.
		const above = label
			? label.y - label.height - 2
			: sprite.y - sprite.height / 2 - 4;
		// Lead with the type multiplier on its own row whenever it isn't neutral, so a
		// super-effective (×2/×4) or resisted (×½/×¼) hit reads at a glance above the
		// EXP line; an immune (×0) hit shows the multiplier with no XP. Colour tracks
		// the outcome: green when boosted, grey when resisted/immune, yellow at neutral.
		const { amount, multiplier } = award;
		const expLine = amount > 0 ? `+${amount} EXP` : 'No effect';
		const content = multiplier === 1 ? expLine : `${formatMultiplier(multiplier)}\n${expLine}`;
		const color = multiplier > 1 ? '#4ade80' : multiplier < 1 ? '#cbd5e1' : '#fde047';
		this.floatText(content, color, sprite.x, above); // green-400 / slate-300 / yellow-300
	}

	/**
	 * Float a "Caught!" award above the *trainer* when a wild mon walks up to it and
	 * is caught — the capture counterpart of the follower's "+N EXP" battle award.
	 */
	private spawnCaughtText(): void {
		if (!this.trainer) return;
		// Start just above the trainer's seen/caught counters, else over its head.
		const above = this.statsLabel
			? this.statsLabel.y - this.statsLabel.height - 2
			: this.trainer.y - this.trainer.height / 2 - 4;
		this.floatText('Caught!', '#4ade80', this.trainer.x, above); // tailwind green-400
	}

	/**
	 * Spawn a bottom-anchored award label at (x, startY) that drifts up and fades
	 * out in `updateFloatingTexts` — shared by the EXP and capture awards.
	 */
	private floatText(content: string, color: string, x: number, startY: number): void {
		const text = new Text({
			text: content,
			style: {
				fontFamily: 'monospace',
				fontSize: 22,
				fill: color,
				fontWeight: 'bold',
				align: 'center',
				stroke: { color: '#1d232a', width: 6 }
			}
		});
		// Anchored at its bottom-centre so it sits over the sprite and rises away.
		text.anchor.set(0.5, 1);
		text.x = x;
		text.y = startY;
		this.app.stage.addChild(text);
		this.floatingTexts.push({ text, elapsed: 0, startY });
	}

	/** Drift every floating XP award up, fade it over its tail, and reap the dead. */
	private updateFloatingTexts(dt: number): void {
		const fadeStart = EXP_TEXT_FRAMES * EXP_TEXT_HOLD;
		for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
			const ft = this.floatingTexts[i];
			ft.elapsed += dt;
			const progress = Math.min(ft.elapsed / EXP_TEXT_FRAMES, 1);
			ft.text.y = ft.startY - EXP_TEXT_RISE * progress;
			ft.text.alpha =
				ft.elapsed <= fadeStart
					? 1
					: Math.max(0, 1 - (ft.elapsed - fadeStart) / (EXP_TEXT_FRAMES - fadeStart));
			if (ft.elapsed >= EXP_TEXT_FRAMES) {
				ft.text.destroy();
				this.floatingTexts.splice(i, 1);
			}
		}
	}

	// --- helpers -------------------------------------------------------------

	private handleResize(): void {
		this.app.renderer.resize(this.containerWidth(), this.containerHeight());
		this.buildGrid();
		this.positionPlayer();
	}

	/**
	 * Side length of the square canvas — the smaller of the container's measured
	 * width and height, floored to a minimum. Everything in the engine works in
	 * this square space, so width and height both resolve to it.
	 */
	private side(): number {
		const measured = Math.min(this.container.clientWidth, this.container.clientHeight);
		return Math.max(MIN_HEIGHT, Math.floor(measured));
	}

	/**
	 * Top-left origin of the cell system. It spans the whole canvas (no gutter), so
	 * the line-up's cells align with the scrolling grass — the only visible grid.
	 */
	private origin(): number {
		return 0;
	}

	/** Side length of the cell system — the full square canvas. */
	private boardSize(): number {
		return this.side();
	}

	/** Edge length of one of the GRID×GRID cells. */
	private cellSize(): number {
		return this.boardSize() / GRID;
	}

	private containerWidth(): number {
		return this.side();
	}

	private containerHeight(): number {
		return this.side();
	}
}
