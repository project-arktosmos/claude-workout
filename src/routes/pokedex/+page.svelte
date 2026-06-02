<script lang="ts">
	import classNames from 'classnames';
	import SpeciesInfoCard from '$components/pokemon/SpeciesInfoCard.svelte';
	import { pokemonCompendium } from '$data/pokemon-compendium.data';

	// The pokedex is a thin browse-and-filter shell over the full compendium: it
	// owns no state beyond the search/filter inputs and delegates the per-species
	// rendering to <SpeciesInfoCard>, the same card the road page uses.

	// Distinct elemental types and generations, derived once for the filter chips.
	const allTypes = [...new Set(pokemonCompendium.flatMap((p) => p.types))].sort();
	const allGenerations = [
		...new Set(pokemonCompendium.map((p) => p.generation).filter((g): g is number => g !== null))
	].sort((a, b) => a - b);

	// Filter inputs.
	let query = '';
	let selectedType: string | null = null;
	let selectedGeneration: number | null = null;

	// How many of the (potentially 1000+) matches to paint at once; "Show more"
	// raises it so the initial render stays cheap.
	const PAGE_SIZE = 60;
	let visibleCount = PAGE_SIZE;

	$: normalizedQuery = query.trim().toLowerCase();

	$: filtered = pokemonCompendium.filter((p) => {
		if (selectedType && !p.types.includes(selectedType)) return false;
		if (selectedGeneration !== null && p.generation !== selectedGeneration) return false;
		if (normalizedQuery) {
			const dex = String(p.dexNumber);
			const matches =
				p.name.toLowerCase().includes(normalizedQuery) ||
				(p.category?.toLowerCase().includes(normalizedQuery) ?? false) ||
				dex === normalizedQuery ||
				dex.padStart(3, '0') === normalizedQuery;
			if (!matches) return false;
		}
		return true;
	});

	// Reset the paging window whenever the filter set changes.
	$: normalizedQuery, selectedType, selectedGeneration, (visibleCount = PAGE_SIZE);

	$: visible = filtered.slice(0, visibleCount);

	function clearFilters() {
		query = '';
		selectedType = null;
		selectedGeneration = null;
	}

	function toggleType(type: string) {
		selectedType = selectedType === type ? null : type;
	}

	function toggleGeneration(gen: number) {
		selectedGeneration = selectedGeneration === gen ? null : gen;
	}
</script>

<div class="mx-auto flex max-w-[120rem] flex-col gap-4">
	<!-- Header -->
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h1 class="text-2xl font-bold">Pokédex</h1>
		<span class="text-base-content/60 text-sm">
			{filtered.length} of {pokemonCompendium.length} species
		</span>
	</div>

	<!-- Filters -->
	<div class="flex flex-col gap-3">
		<label class="input input-bordered flex items-center gap-2">
			<input
				type="text"
				class="grow"
				placeholder="Search by name, category, or dex number…"
				bind:value={query}
			/>
			{#if query}
				<button class="btn btn-ghost btn-xs" on:click={() => (query = '')} aria-label="Clear search">
					✕
				</button>
			{/if}
		</label>

		<div class="flex flex-wrap gap-1">
			{#each allTypes as type (type)}
				<button
					class={classNames('badge cursor-pointer', {
						'badge-primary': selectedType === type,
						'badge-ghost': selectedType !== type
					})}
					on:click={() => toggleType(type)}
				>
					{type}
				</button>
			{/each}
		</div>

		<div class="flex flex-wrap items-center gap-1">
			<span class="text-base-content/60 mr-1 text-xs">Gen</span>
			{#each allGenerations as gen (gen)}
				<button
					class={classNames('badge cursor-pointer', {
						'badge-secondary': selectedGeneration === gen,
						'badge-ghost': selectedGeneration !== gen
					})}
					on:click={() => toggleGeneration(gen)}
				>
					{gen}
				</button>
			{/each}
			{#if selectedType || selectedGeneration !== null || query}
				<button class="btn btn-ghost btn-xs ml-2" on:click={clearFilters}>Clear all</button>
			{/if}
		</div>
	</div>

	<!-- Results grid -->
	{#if filtered.length === 0}
		<div class="text-base-content/60 py-16 text-center">No Pokémon match these filters.</div>
	{:else}
		<div
			class="grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
		>
			{#each visible as species (species.id)}
				<SpeciesInfoCard {species} level={1} classes="w-full max-w-72" />
			{/each}
		</div>

		{#if visibleCount < filtered.length}
			<div class="flex justify-center py-4">
				<button class="btn btn-primary" on:click={() => (visibleCount += PAGE_SIZE)}>
					Show more ({filtered.length - visibleCount} remaining)
				</button>
			</div>
		{/if}
	{/if}
</div>
