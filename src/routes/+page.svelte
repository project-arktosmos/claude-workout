<script lang="ts">
	// Navigation targets for every page in the app. Kept as data so the grid of
	// links below stays declarative — add a route here and a button appears.
	const routes: { href: string; label: string }[] = [
		{ href: '/trainer', label: 'Trainer' },
		{ href: '/exercise', label: 'Exercise' },
		{ href: '/road', label: 'Road' },
		{ href: '/pokedex', label: 'Pokedex' },
		{ href: '/followers', label: 'Followers' },
		{ href: '/events', label: 'Events' },
		{ href: '/map-assets', label: 'Map Assets' },
		{ href: '/settings', label: 'Settings' }
	];
</script>

<section class="mx-auto flex max-w-2xl flex-col gap-8 p-6">
	<header class="text-center">
		<h1 class="text-3xl font-bold">Welcome to Arktosmos</h1>
		<p class="text-base-content/70 mt-2">Pick a section to get started</p>
	</header>

	<nav class="grid grid-cols-2 gap-4 sm:grid-cols-3">
		{#each routes as route}
			<a href={route.href} class="btn btn-primary btn-lg">{route.label}</a>
		{/each}
	</nav>
</section>
