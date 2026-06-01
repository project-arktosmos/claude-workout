<script lang="ts">
	import '../css/app.css';
	import '$services/i18n';
	import Navbar from '$components/core/Navbar.svelte';

	let { children } = $props();
</script>

<Navbar />

<main class="p-4">
	{@render children?.()}
</main>
