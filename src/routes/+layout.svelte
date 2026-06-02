<script lang="ts">
	import { onMount } from 'svelte';
	import '../css/app.css';
	import '$services/i18n';
	import { browser } from '$app/environment';
	import { eventsService } from '$services/events.service';
	import { exercisesService } from '$services/exercises.service';
	import { theme, daisyTheme } from '$services/theme.service';
	import { setupAppMenu } from '$utils/tauriMenu';
	import TopControls from '$components/core/TopControls.svelte';

	let { children } = $props();

	// Apply the active theme to <html data-theme> so DaisyUI restyles the whole
	// app whenever the toggle (or the hydrated saved choice) changes.
	$effect(() => {
		if (browser) document.documentElement.setAttribute('data-theme', daisyTheme($theme));
	});

	// Subscribe app-wide so prompt history is captured regardless of route, and
	// load the exercise catalog from the database (the source of truth).
	onMount(() => {
		exercisesService.init();
		eventsService.init();
		// Page navigation lives in the native window menu, not the navbar.
		void setupAppMenu();
	});
</script>

<TopControls />

<main class="p-4">
	{@render children?.()}
</main>
