<script lang="ts">
	import classNames from 'classnames';

	// Display name shown beneath the sprite.
	export let name: string = '';
	// Tailwind class carrying the sprite-sheet background-image, e.g.
	// `bg-[url(/assets/Characters/Followers/BULBASAUR.png)]`. Passed as a literal
	// so Tailwind can statically generate the arbitrary url utility.
	export let spriteClass: string = '';
	// Tailwind class selecting the facing row via background-position-y.
	export let dirClass: string = '';
	// Pause the walk cycle (freezes on the current frame).
	export let paused: boolean = false;
	// Allow parents to extend the wrapper classes.
	export let classes: string = '';

	$: frameClasses = classNames(
		// 128×128 box rendered from a 512×512 (2×) sheet, top-left aligned.
		'h-32 w-32 bg-no-repeat bg-[length:512px_512px] bg-left-top',
		// Keep the pixel art crisp when upscaled.
		'[image-rendering:pixelated]',
		spriteClass,
		dirClass,
		{ 'animate-follower-walk': !paused }
	);
</script>

<figure class={classNames('flex flex-col items-center gap-2', classes)}>
	<div
		class="border-base-300 bg-base-200 rounded-box flex items-center justify-center border p-2 shadow-inner"
	>
		<div class={frameClasses} role="img" aria-label={`${name} walking animation`}></div>
	</div>
	{#if name}
		<figcaption class="text-base-content/80 text-sm font-medium">{name}</figcaption>
	{/if}
</figure>
