<script lang="ts">
	import classNames from 'classnames';
	import { onMount, onDestroy } from 'svelte';
	import manifest from '$data/map-assets.json';

	// Each entry describes one sprite/tile extracted from the source sheet by
	// scripts/extract-map-assets.py. Position/size are in source-sheet pixels.
	interface MapAsset {
		id: number;
		file: string;
		x: number;
		y: number;
		width: number;
		height: number;
	}

	const assets = manifest as MapAsset[];

	// "Enabled" animations: named sprite sequences played on a loop. Each loop is
	// a contiguous run of pieces from the sheet, advanced together by one shared
	// timer (a single tick counter keeps reactivity simple).
	interface SpriteLoop {
		name: string;
		frames: MapAsset[];
	}

	const range = (from: number, to: number) => assets.filter((a) => a.id >= from && a.id <= to);

	const loops: SpriteLoop[] = [
		{ name: 'water-loop', frames: range(1, 8) },
		{ name: 'water-rock', frames: range(25, 29) },
		{ name: 'flowers', frames: range(42, 46) },
		{ name: 'big-tree', frames: range(30, 30) },
		{ name: 'grass', frames: range(87, 87) },
		{ name: 'bush', frames: range(88, 88) },
		{ name: 'tree-small', frames: range(89, 89) },
		{ name: 'tree-tall', frames: range(178, 178) },
		{ name: 'pokeball', frames: range(194, 194) },
		{ name: 'pokecenter', frames: range(210, 210) },
		{ name: 'grass-1', frames: range(66, 66) },
		{ name: 'grass-2', frames: range(67, 67) },
		{ name: 'grass-3', frames: range(68, 68) },
		{ name: 'grass-4', frames: range(69, 69) }
	];

	const FRAME_MS = 150;
	let tick = 0;
	let loopTimer: ReturnType<typeof setInterval> | undefined;

	onMount(() => {
		loopTimer = setInterval(() => {
			tick += 1;
		}, FRAME_MS);
	});
	onDestroy(() => clearInterval(loopTimer));

	let query: string = '';

	// Search by id or by a "WxH" size string so users can find a piece quickly.
	$: needle = query.trim().toLowerCase();
	$: filtered = assets.filter((a) => {
		if (!needle) return true;
		return (
			String(a.id).includes(needle) ||
			`${a.width}x${a.height}`.includes(needle) ||
			`${a.width}×${a.height}`.includes(needle)
		);
	});
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<div>
		<h1 class="text-2xl font-bold">Map Assets</h1>
		<p class="text-sm opacity-70">
			{assets.length} pieces extracted from the tileset
		</p>
	</div>
	<input
		class="input input-bordered input-sm w-full sm:w-64"
		type="search"
		placeholder="Search by id or size (e.g. 16x16)…"
		bind:value={query}
	/>
</div>

<figure class="card mb-6 w-fit bg-base-200 p-3 shadow-sm">
	<img src="/maps/3870.png" alt="Source tileset" class="max-h-64 w-auto" />
	<figcaption class="mt-1 text-center text-xs opacity-60">Source sheet</figcaption>
</figure>

<section class="mb-6">
	<h2 class="mb-2 text-lg font-semibold">Enabled</h2>
	<div class="flex flex-wrap gap-4">
		{#each loops as loop (loop.name)}
			<figure class="card w-fit bg-base-300 shadow-sm">
				<div class="flex items-center justify-center p-4">
					<img
						src={loop.frames[tick % loop.frames.length].file}
						alt={loop.name}
						class="h-24 w-24 object-contain [image-rendering:pixelated]"
					/>
				</div>
				<figcaption class="card-body items-center gap-0 p-2 pt-0 text-center">
					<span class="text-xs font-medium opacity-80">{loop.name}</span>
					<span class="badge badge-ghost badge-sm">
					{loop.frames.length === 1 ? 'static' : `${loop.frames.length} frames`}
				</span>
				</figcaption>
			</figure>
		{/each}
	</div>
</section>

{#if filtered.length === 0}
	<div class="alert">
		<span>No pieces match “{query}”.</span>
	</div>
{:else}
	<div
		class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
	>
		{#each filtered as asset (asset.id)}
			<figure
				class={classNames(
					'card bg-base-300 shadow-sm transition-transform hover:scale-105'
				)}
			>
				<div class="flex items-center justify-center p-2">
					<img
						src={asset.file}
						alt={`Piece ${asset.id}`}
						class="h-auto w-full object-contain [image-rendering:pixelated]"
						loading="lazy"
					/>
				</div>
				<figcaption class="card-body items-center gap-0 p-1 pt-0 text-center">
					<span class="text-xs font-medium opacity-80">#{asset.id}</span>
					<span class="badge badge-ghost badge-sm">{asset.width}×{asset.height}</span>
				</figcaption>
			</figure>
		{/each}
	</div>
{/if}
