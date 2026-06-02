<script lang="ts">
	import { onMount } from 'svelte';
	import '../css/app.css';
	import '$services/i18n';
	import { eventsService } from '$services/events.service';
	import { exercisesService } from '$services/exercises.service';
	import { setupAppMenu } from '$utils/tauriMenu';

	let { children } = $props();

	// Subscribe app-wide so prompt history is captured regardless of route, and
	// load the exercise catalog from the database (the source of truth).
	onMount(() => {
		exercisesService.init();
		eventsService.init();
		// Page navigation lives in the native window menu, not the navbar.
		void setupAppMenu();
	});
</script>

<main class="p-4">
	{@render children?.()}
</main>
