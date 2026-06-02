<script lang="ts">
	import classNames from 'classnames';

	// The trainer sprites live in `static/assets/trainer`, so they're served from
	// the site root at `/assets/trainer/<file>.png`. Keep this catalog as plain
	// UI data — there's no persistence or transformation to push into a service.
	interface TrainerSprite {
		id: string;
		character: 'boy' | 'girl';
		activity: 'bike' | 'fish' | 'run' | 'surf';
		src: string;
	}

	const FILES: Record<string, TrainerSprite['activity']> = {
		boy_bike: 'bike',
		boy_fish_offset: 'fish',
		boy_run: 'run',
		boy_surf: 'surf',
		girl_bike: 'bike',
		girl_fish_offset: 'fish',
		girl_run: 'run',
		girl_surf: 'surf'
	};

	const sprites: TrainerSprite[] = Object.keys(FILES).map((file) => ({
		id: file,
		character: file.startsWith('girl') ? 'girl' : 'boy',
		activity: FILES[file],
		src: `/assets/trainer/${file}.png`
	}));

	// Each activity gets its own looping "fake motion" keyframe (defined in app.css).
	const activityAnimation: Record<TrainerSprite['activity'], string> = {
		bike: 'animate-trainer-bike',
		fish: 'animate-trainer-fish',
		run: 'animate-trainer-run',
		surf: 'animate-trainer-surf'
	};

	const characters = ['all', 'boy', 'girl'] as const;
	type CharacterFilter = (typeof characters)[number];

	let activeCharacter: CharacterFilter = 'all';

	$: filtered = sprites.filter(
		(sprite) => activeCharacter === 'all' || sprite.character === activeCharacter
	);

	function toLabel(value: string): string {
		return value.charAt(0).toUpperCase() + value.slice(1);
	}
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<h1 class="text-2xl font-bold">Trainer</h1>
	<div role="tablist" class="tabs tabs-boxed w-fit">
		{#each characters as character (character)}
			<button
				role="tab"
				class={classNames('tab', { 'tab-active': character === activeCharacter })}
				on:click={() => (activeCharacter = character)}
			>
				{toLabel(character)}
			</button>
		{/each}
	</div>
</div>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
	{#each filtered as sprite (sprite.id)}
		<figure
			class="card items-center gap-2 bg-base-100 p-4 shadow-sm transition-transform hover:scale-105"
		>
			<img
				src={sprite.src}
				alt={`${toLabel(sprite.character)} ${sprite.activity}`}
				class={classNames(
					'h-24 w-24 object-contain [image-rendering:pixelated]',
					activityAnimation[sprite.activity]
				)}
			/>
			<figcaption class="flex flex-col items-center gap-1">
				<span class="font-semibold">{toLabel(sprite.activity)}</span>
				<span class="badge badge-sm badge-ghost">{toLabel(sprite.character)}</span>
			</figcaption>
		</figure>
	{/each}
</div>
