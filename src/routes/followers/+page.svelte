<script lang="ts">
	import classNames from 'classnames';
	import FollowerWalker from '$components/core/FollowerWalker.svelte';

	// Kanto starters. Each sprite class is a literal so Tailwind can statically
	// emit the arbitrary background-image url utility; sheets live under
	// static/assets (served from the site root).
	const starters = [
		{ name: 'Bulbasaur', spriteClass: 'bg-[url(/assets/Characters/Followers/BULBASAUR.png)]' },
		{ name: 'Charmander', spriteClass: 'bg-[url(/assets/Characters/Followers/CHARMANDER.png)]' },
		{ name: 'Squirtle', spriteClass: 'bg-[url(/assets/Characters/Followers/SQUIRTLE.png)]' }
	];

	// Each sheet row is a facing direction; select it via background-position-y
	// (128px per frame at the 2× display scale).
	const directions = [
		{ label: 'Down', dirClass: '[background-position-y:0px]' },
		{ label: 'Left', dirClass: '[background-position-y:-128px]' },
		{ label: 'Right', dirClass: '[background-position-y:-256px]' },
		{ label: 'Up', dirClass: '[background-position-y:-384px]' }
	];

	let direction = directions[0];
	let paused = false;

	$: dirClass = direction.dirClass;
</script>

<svelte:head>
	<title>Followers — Kanto Starters</title>
</svelte:head>

<section class="mx-auto flex max-w-4xl flex-col gap-6">
	<header>
		<h1 class="text-2xl font-bold">Followers</h1>
		<p class="text-base-content/70 text-sm">
			Walking animations of the Kanto starter Pokémon, rendered from their follower sprite sheets.
		</p>
	</header>

	<div class="flex flex-wrap items-center gap-4">
		<div class="join">
			{#each directions as dir (dir.label)}
				<button
					class={classNames('btn join-item btn-sm', {
						'btn-primary': direction.label === dir.label
					})}
					on:click={() => (direction = dir)}
				>
					{dir.label}
				</button>
			{/each}
		</div>

		<button class="btn btn-sm btn-ghost" on:click={() => (paused = !paused)}>
			{paused ? 'Play' : 'Pause'}
		</button>
	</div>

	<div class="flex flex-wrap justify-center gap-6 sm:justify-start">
		{#each starters as starter (starter.name)}
			<FollowerWalker
				name={starter.name}
				spriteClass={starter.spriteClass}
				{dirClass}
				{paused}
			/>
		{/each}
	</div>
</section>
