<script lang="ts" context="module">
	/** One caught Pokémon as the panel renders it (resolved by the host page). */
	export interface CaughtEntry {
		id: string;
		name: string;
		dexNumber: number;
		level: number;
		spriteUrl: string;
		/** True for the primary map follower (B2) — shown as a badge, not a button. */
		primary: boolean;
		/** True for the secondary map follower (D2) — shown as a badge, not a button. */
		secondary: boolean;
	}
</script>

<script lang="ts">
	import classNames from 'classnames';
	import { createEventDispatcher } from 'svelte';
	import { MISSING_SPRITE_URL } from '$utils/pokemon/sprite';

	// The resolved roster to display and any extra classes from the parent. The
	// panel is purely presentational: it renders the list and dispatches `primary`
	// when a mon's button is pressed; the page owns the store and the action.
	export let mons: CaughtEntry[] = [];
	export let classes: string = '';

	const dispatch = createEventDispatcher<{
		primary: { id: string };
		secondary: { id: string };
	}>();

	/** Fall back to the blank silhouette when a species has no bundled sprite. */
	function handleMissing(event: Event): void {
		(event.currentTarget as HTMLImageElement).src = MISSING_SPRITE_URL;
	}
</script>

<div
	class={classNames(
		'card bg-base-100/95 border-base-300 w-64 border shadow-xl backdrop-blur',
		classes
	)}
>
	<div class="card-body gap-2 p-3">
		<h2 class="card-title text-sm leading-none">Caught Pokémon</h2>

		{#if mons.length === 0}
			<p class="text-base-content/50 text-xs">
				Lead a wild Pokémon to your trainer to catch it.
			</p>
		{:else}
			<ul class="flex max-h-64 flex-col gap-1 overflow-y-auto">
				{#each mons as mon (mon.id)}
					<li class="bg-base-200 flex items-center gap-2 rounded p-1">
						<img
							src={mon.spriteUrl}
							alt={mon.name}
							on:error={handleMissing}
							class="h-10 w-10 shrink-0 object-contain [image-rendering:pixelated]"
						/>
						<div class="flex min-w-0 flex-1 flex-col leading-tight">
							<span class="truncate text-xs font-semibold">{mon.name}</span>
							<span class="text-base-content/60 text-[0.65rem]">Lv {mon.level}</span>
						</div>
						{#if mon.primary}
							<span class="badge badge-success badge-xs shrink-0">Primary</span>
						{:else if mon.secondary}
							<span class="badge badge-info badge-xs shrink-0">Secondary</span>
						{:else}
							<div class="flex shrink-0 flex-col gap-1">
								<button
									type="button"
									class="btn btn-primary btn-xs"
									on:click={() => dispatch('primary', { id: mon.id })}
								>
									Primary
								</button>
								<button
									type="button"
									class="btn btn-info btn-xs"
									on:click={() => dispatch('secondary', { id: mon.id })}
								>
									Secondary
								</button>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
