<script lang="ts">
	import classNames from 'classnames';
	import { onDestroy } from 'svelte';
	import manifest from '$data/sfx.json';
	import { sfxFlags, flagSound, unflagSound } from '$services/sfx-flags.service';

	// Each entry describes one sound effect extracted from the FireRed/LeafGreen
	// sound rip and copied into `static/sfx/` (see src/data/sfx.json).
	interface SoundEffect {
		id: string;
		name: string;
		file: string;
	}

	const sounds = manifest as SoundEffect[];

	// A single shared <audio> element so only one sound plays at a time; reusing
	// it (instead of one element per card) keeps memory flat across 250+ clips.
	let player: HTMLAudioElement | undefined;
	let playingId: string | null = null;

	function play(sound: SoundEffect) {
		if (!player) player = new Audio();
		if (player.src.endsWith(sound.file) && !player.paused) {
			player.pause();
			player.currentTime = 0;
			playingId = null;
			return;
		}
		player.src = sound.file;
		playingId = sound.id;
		player.currentTime = 0;
		player.onended = () => (playingId = null);
		void player.play();
	}

	onDestroy(() => {
		player?.pause();
		player = undefined;
	});

	let query: string = '';

	// Search by id or name so a specific clip is quick to find.
	$: needle = query.trim().toLowerCase();
	$: filtered = sounds.filter((s) => {
		if (!needle) return true;
		return s.id.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle);
	});

	// Sounds the player has pinned under a custom name, surfaced in their own grid
	// above the full list. Driven by the persisted `sfxFlags` store.
	$: flagged = sounds
		.filter((s) => $sfxFlags[s.id] !== undefined)
		.map((s) => ({ ...s, label: $sfxFlags[s.id] }));

	// Prompt for a custom name and flag the sound (pre-filled with any existing
	// label or the original name).
	function promptFlag(sound: SoundEffect) {
		const current = $sfxFlags[sound.id] ?? sound.name;
		const name = window.prompt(`Custom name for "${sound.name}"`, current);
		if (name !== null) flagSound(sound.id, name);
	}
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<div>
		<h1 class="text-2xl font-bold">Sound Effects</h1>
		<p class="text-sm opacity-70">
			{sounds.length} clips from Pokémon FireRed / LeafGreen
		</p>
	</div>
	<input
		class="input input-bordered input-sm w-full sm:w-64"
		type="search"
		placeholder="Search by id or name…"
		bind:value={query}
	/>
</div>

{#if flagged.length > 0}
	<section class="mb-6">
		<h2 class="mb-2 text-lg font-semibold">Flagged</h2>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
			{#each flagged as sound (sound.id)}
				<div
					class={classNames(
						'card relative flex-row items-center gap-2 bg-base-300 p-3 text-left shadow-sm transition-transform hover:scale-105',
						{ 'ring-2 ring-primary': playingId === sound.id }
					)}
				>
					<button
						type="button"
						class={classNames('btn btn-circle btn-sm', {
							'btn-primary': playingId === sound.id,
							'btn-ghost': playingId !== sound.id
						})}
						aria-label={playingId === sound.id ? 'Stop' : 'Play'}
						on:click={() => play(sound)}
					>
						{playingId === sound.id ? '◼' : '▶'}
					</button>
					<span class="flex flex-col overflow-hidden">
						<span class="truncate text-sm font-medium">{sound.label}</span>
						<span class="truncate text-xs opacity-60">{sound.name} · #{sound.id}</span>
					</span>
					<button
						type="button"
						class="btn btn-ghost btn-xs btn-circle absolute right-1 top-1"
						aria-label="Remove flag"
						title="Remove flag"
						on:click={() => unflagSound(sound.id)}
					>
						✕
					</button>
				</div>
			{/each}
		</div>
	</section>
{/if}

{#if filtered.length === 0}
	<div class="alert">
		<span>No sounds match “{query}”.</span>
	</div>
{:else}
	<h2 class="mb-2 text-lg font-semibold">All sounds</h2>
	<div class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
		{#each filtered as sound (sound.id)}
			<div
				class={classNames(
					'card relative flex-row items-center gap-2 bg-base-300 p-3 text-left shadow-sm transition-transform hover:scale-105',
					{ 'ring-2 ring-primary': playingId === sound.id }
				)}
			>
				<button
					type="button"
					class={classNames('btn btn-circle btn-sm', {
						'btn-primary': playingId === sound.id,
						'btn-ghost': playingId !== sound.id
					})}
					aria-label={playingId === sound.id ? 'Stop' : 'Play'}
					on:click={() => play(sound)}
				>
					{playingId === sound.id ? '◼' : '▶'}
				</button>
				<span class="flex flex-col overflow-hidden">
					<span class="truncate text-sm font-medium">{sound.name}</span>
					<span class="badge badge-ghost badge-sm">#{sound.id}</span>
				</span>
				<button
					type="button"
					class={classNames('btn btn-ghost btn-xs btn-circle absolute right-1 top-1', {
						'text-primary': $sfxFlags[sound.id] !== undefined
					})}
					aria-label={$sfxFlags[sound.id] !== undefined ? 'Edit flag name' : 'Flag with custom name'}
					title={$sfxFlags[sound.id] !== undefined ? 'Edit flag name' : 'Flag with custom name'}
					on:click={() => promptFlag(sound)}
				>
					{$sfxFlags[sound.id] !== undefined ? '★' : '☆'}
				</button>
			</div>
		{/each}
	</div>
{/if}
