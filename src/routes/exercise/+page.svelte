<script lang="ts">
	import classNames from 'classnames';
	import { ExerciseCategory, type ExerciseImage } from '$types/exercise.type';
	import { exercisesService, exercisesCatalog } from '$services/exercises.service';
	import { exerciseFlagsService } from '$services/exercise-flags.service';
	import { ExerciseFlag } from '$types/exercise-flag.type';

	// The catalog is backed by the SQLite `exercises` table (the source of
	// truth), loaded once on app start. The store seeds from the build-time
	// fallback so the page renders during prerender too.
	const catalog = exercisesService.store;

	// Personal Favorite/Banned marks, persisted to localStorage. Rebuild a
	// reactive id → flag lookup whenever the flag store changes.
	const flags = exerciseFlagsService.store;
	$: flagById = new Map($flags.map((entry) => [entry.id, entry.flag]));

	$: collections = [
		{
			category: ExerciseCategory.Exercise,
			label: 'Exercises',
			images: $catalog.filter((image) => image.category === ExerciseCategory.Exercise)
		},
		{
			category: ExerciseCategory.Yoga,
			label: 'Yoga Poses',
			images: $catalog.filter((image) => image.category === ExerciseCategory.Yoga)
		}
	];

	let activeCategory: ExerciseCategory = ExerciseCategory.Exercise;
	let query: string = '';

	$: active = collections.find((c) => c.category === activeCategory) ?? collections[0];
	$: filtered = active.images.filter((image: ExerciseImage) =>
		image.name.toLowerCase().includes(query.trim().toLowerCase())
	);
</script>

<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
	<h1 class="text-2xl font-bold">Exercises</h1>
	<input
		class="input input-bordered input-sm w-full sm:w-64"
		type="search"
		placeholder="Search…"
		bind:value={query}
	/>
</div>

<div role="tablist" class="tabs tabs-boxed mb-6 w-fit">
	{#each collections as collection (collection.category)}
		<button
			role="tab"
			class={classNames('tab', { 'tab-active': collection.category === activeCategory })}
			on:click={() => (activeCategory = collection.category)}
		>
			{collection.label}
			<span class="badge badge-sm badge-ghost ml-2">{collection.images.length}</span>
		</button>
	{/each}
</div>

{#if filtered.length === 0}
	<div class="alert">
		<span>No matches for “{query}”.</span>
	</div>
{:else}
	<div
		class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
	>
		{#each filtered as image (image.id)}
			<figure
				class={classNames('card relative bg-base-100 shadow-sm transition-transform hover:scale-105', {
					'opacity-40 grayscale': flagById.get(image.id) === ExerciseFlag.Banned
				})}
			>
				<div class="absolute right-1 top-1 z-10 flex gap-1">
					<button
						type="button"
						aria-label={`Favorite ${image.name}`}
						aria-pressed={flagById.get(image.id) === ExerciseFlag.Favorite}
						class={classNames('btn btn-circle btn-xs', {
							'btn-warning': flagById.get(image.id) === ExerciseFlag.Favorite,
							'btn-ghost': flagById.get(image.id) !== ExerciseFlag.Favorite
						})}
						on:click={() => exerciseFlagsService.toggle(image.id, ExerciseFlag.Favorite)}
					>
						★
					</button>
					<button
						type="button"
						aria-label={`Ban ${image.name}`}
						aria-pressed={flagById.get(image.id) === ExerciseFlag.Banned}
						class={classNames('btn btn-circle btn-xs', {
							'btn-error': flagById.get(image.id) === ExerciseFlag.Banned,
							'btn-ghost': flagById.get(image.id) !== ExerciseFlag.Banned
						})}
						on:click={() => exerciseFlagsService.toggle(image.id, ExerciseFlag.Banned)}
					>
						⊘
					</button>
				</div>
				<div
					role="img"
					aria-label={image.name}
					class="flex aspect-square items-center justify-center p-3 [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-current"
				>
					{@html exercisesCatalog.inlineSvg(image.id)}
				</div>
				<figcaption class="card-body p-2 pt-0 text-center text-xs font-medium opacity-80">
					{image.name}
				</figcaption>
			</figure>
		{/each}
	</div>
{/if}
