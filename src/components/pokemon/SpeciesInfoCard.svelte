<script lang="ts">
	import classNames from 'classnames';
	import type { PokemonSpecies } from '$types/pokemon.type';
	import { pokemonSrTiers } from '$data/pokemon-compendium.data';
	import {
		clampLevel,
		expForLevel,
		expAtNextLevel,
		expForLevelBar,
		expIntoLevel
	} from '$utils/pokemon/exp-system';

	// The species to describe and the level it is currently at. All numbers shown
	// are *derived* for display via the pure exp-system util — no state is held.
	export let species: PokemonSpecies;
	export let level: number = 1;
	/**
	 * Total accumulated EXP, when the host tracks it (e.g. the road page awards XP
	 * on encounters). Falls back to the level's floor so a static card still shows
	 * a sensible bar.
	 */
	export let currentExp: number | null = null;
	export let classes: string = '';

	$: lvl = clampLevel(level);
	$: rate = species.growthRate;
	$: floorExp = rate ? expForLevel(rate, lvl) : null;
	$: nextExp = rate ? expAtNextLevel(rate, lvl) : null;
	$: barExp = rate ? expForLevelBar(rate, lvl) : null;
	// Shown total: the host's tracked EXP if provided, else this level's floor.
	$: totalExp = currentExp ?? floorExp;
	$: intoLevel = rate && totalExp !== null ? expIntoLevel(rate, lvl, totalExp) : 0;
	$: dexLabel = `#${String(species.dexNumber).padStart(3, '0')}`;
	// The full SR ladder for the dex, with this species' own rank marked so the
	// host can see where the current follower sits among every distinct SR tier.
	$: srTiers = pokemonSrTiers;
</script>

<div
	class={classNames(
		'card bg-base-100/95 border-base-300 w-72 border shadow-xl backdrop-blur',
		classes
	)}
>
	<div class="card-body gap-3 p-4">
		<!-- Header: name, dex number, current level -->
		<div class="flex items-baseline justify-between gap-2">
			<h2 class="card-title text-lg leading-none">{species.name}</h2>
			<span class="text-base-content/60 font-mono text-sm">{dexLabel}</span>
		</div>
		<div class="flex items-center gap-2">
			<span class="badge badge-primary badge-sm">Lv {lvl}</span>
			{#if species.category}
				<span class="text-base-content/70 text-xs">{species.category} Pokémon</span>
			{/if}
		</div>

		<!-- Types: circular type icon + label per elemental type -->
		<div class="flex flex-wrap gap-1">
			{#each species.types as type (type)}
				<span
					class="badge badge-ghost badge-sm gap-1 pl-1"
					title={type}
					aria-label={type}
				>
					<img
						src={`/types/Pokemon_Type_Icon_${type}.svg`}
						alt=""
						class="h-4 w-4 object-contain"
					/>
					{type}
				</span>
			{/each}
		</div>

		<!-- Core stats grid -->
		<div class="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
			<span class="text-base-content/60">Base SR</span>
			<span class="text-right font-semibold">{species.sr ?? '—'}</span>

			<span class="text-base-content/60">Growth</span>
			<span class="text-right font-semibold capitalize">{rate ?? '—'}</span>

			<span class="text-base-content/60">Base EXP</span>
			<span class="text-right font-semibold">{species.baseExp ?? '—'}</span>
		</div>

		<!-- SR ladder: every distinct base SR in the dex, current mon highlighted -->
		<div class="border-base-300 border-t pt-2 text-xs">
			<div class="text-base-content/60 mb-1 flex justify-between">
				<span>SR ladder</span>
				<span class="font-mono">{srTiers.length} tiers</span>
			</div>
			<div class="border-base-300 max-h-40 overflow-y-auto rounded border">
				<table class="table-xs table">
					<thead class="bg-base-200 sticky top-0">
						<tr>
							<th>SR</th>
							<th class="text-right">Species</th>
						</tr>
					</thead>
					<tbody>
						{#each srTiers as tier (tier.sr)}
							{@const current = tier.sr === species.sr}
							<tr class={classNames({ 'bg-primary/20 font-semibold': current })}>
								<td>
									{tier.sr}
									{#if current}
										<span class="badge badge-primary badge-xs ml-1">{species.name}</span>
									{/if}
								</td>
								<td class="text-right font-mono">{tier.count}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<!-- EXP for the current level, derived from the growth curve -->
		{#if rate && totalExp !== null}
			<div class="text-xs">
				<div class="text-base-content/60 mb-1 flex justify-between">
					<span>EXP at Lv {lvl}</span>
					<span class="font-mono">{totalExp.toLocaleString()}</span>
				</div>
				{#if nextExp !== null && barExp !== null}
					<progress class="progress progress-primary h-2 w-full" value={intoLevel} max={barExp}
					></progress>
					<div class="text-base-content/50 mt-1 flex justify-between">
						<span>Next: Lv {lvl + 1}</span>
						<span class="font-mono">{nextExp.toLocaleString()}</span>
					</div>
				{:else}
					<div class="text-base-content/50">Max level</div>
				{/if}
			</div>
		{/if}

		<!-- Evolution(s) with their level/trigger -->
		{#if species.evolvesTo.length > 0}
			<div class="border-base-300 border-t pt-2 text-xs">
				<div class="text-base-content/60 mb-1">Evolves into</div>
				<ul class="space-y-0.5">
					{#each species.evolvesTo as evo (evo.toId)}
						<li class="flex items-center justify-between gap-2">
							<span class="font-medium">{evo.toName ?? 'Unknown'}</span>
							<span
								class={classNames('badge badge-xs', {
									'badge-success': evo.level !== null && lvl >= evo.level,
									'badge-ghost': !(evo.level !== null && lvl >= evo.level)
								})}
							>
								{evo.trigger}
							</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
