<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import Button from '$components/core/Button.svelte';
	import { ThemeColors } from '$types/core.type';
	import { ROAD_START_LEVEL } from '$services/road-progress.service';
	import { STARTER_NAMES, type StarterName } from '$services/game.service';
	import { frontSpriteUrl, MISSING_SPRITE_URL } from '$utils/pokemon/sprite';
	import type { TrainerCharacter } from '$utils/game/road-game';

	// Emits the player's picks; the /road page seeds a fresh game from them.
	const dispatch = createEventDispatcher<{
		start: { starter: StarterName; trainer: TrainerCharacter };
	}>();

	// A handful of species (notably Gen 9) ship no front sprite; fall back to the
	// blank placeholder rather than showing a broken image.
	function onArtError(event: Event): void {
		(event.currentTarget as HTMLImageElement).src = MISSING_SPRITE_URL;
	}

	// Trainer charsets shown as a static portrait: the first (down-facing) frame of
	// the 128×192 / 32×48 walk sheet. At 2× that's a 64×96 window onto a 256×384
	// background, top-left aligned. Sprite classes are literals so Tailwind can
	// statically emit the arbitrary background-image utilities.
	const trainers: { id: TrainerCharacter; label: string; spriteClass: string }[] = [
		{ id: 'boy', label: 'Boy', spriteClass: 'bg-[url(/assets/trainer/boy_walk.png)]' },
		{ id: 'girl', label: 'Girl', spriteClass: 'bg-[url(/assets/trainer/girl_walk.png)]' }
	];

	let trainer: TrainerCharacter = 'boy';
	let starter: StarterName = 'Bulbasaur';

	function confirm(): void {
		dispatch('start', { starter, trainer });
	}
</script>

<div class="modal modal-open" role="dialog" aria-modal="true" aria-label="Start a new journey">
	<div class="modal-box max-w-lg">
		<h2 class="text-xl font-bold">Begin your journey</h2>
		<p class="text-base-content/70 mt-1 text-sm">
			Choose your trainer and your first partner. Every starter sets out at level {ROAD_START_LEVEL}.
		</p>

		<section class="mt-5">
			<h3 class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">Trainer</h3>
			<div class="mt-2 flex gap-3">
				{#each trainers as option (option.id)}
					<button
						type="button"
						aria-pressed={trainer === option.id}
						class={classNames('card flex-1 items-center gap-2 border-2 p-3 transition', {
							'border-primary bg-primary/10': trainer === option.id,
							'border-base-300 hover:border-base-content/30': trainer !== option.id
						})}
						on:click={() => (trainer = option.id)}
					>
						<div
							class={classNames(
								'h-24 w-16 bg-no-repeat bg-[length:256px_384px] bg-left-top [image-rendering:pixelated]',
								option.spriteClass
							)}
							role="img"
							aria-label={`${option.label} trainer`}
						></div>
						<span class="text-sm font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</section>

		<section class="mt-4">
			<h3 class="text-base-content/60 text-xs font-semibold tracking-wide uppercase">
				Starter Pokémon
				<span class="text-base-content/40 font-normal normal-case">
					· {STARTER_NAMES.length} available (SR ≤ 1)
				</span>
			</h3>
			<div
				class="border-base-300 mt-2 grid max-h-72 grid-cols-3 gap-3 overflow-y-auto rounded-lg border p-2 sm:grid-cols-4"
			>
				{#each STARTER_NAMES as name (name)}
					<button
						type="button"
						aria-pressed={starter === name}
						class={classNames('card items-center gap-1 border-2 p-2 transition', {
							'border-primary bg-primary/10': starter === name,
							'border-base-300 hover:border-base-content/30': starter !== name
						})}
						on:click={() => (starter = name)}
					>
						<img
							src={frontSpriteUrl(name)}
							alt={name}
							class="h-16 w-16 object-contain [image-rendering:pixelated]"
							on:error={onArtError}
						/>
						<span class="text-center text-xs font-medium">{name}</span>
						<span class="badge badge-ghost badge-sm">Lv {ROAD_START_LEVEL}</span>
					</button>
				{/each}
			</div>
		</section>

		<div class="modal-action">
			<Button label="Start journey" color={ThemeColors.Primary} on:click={confirm} />
		</div>
	</div>
</div>
