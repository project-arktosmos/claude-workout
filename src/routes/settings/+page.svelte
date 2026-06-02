<script lang="ts">
	import Button from '$components/core/Button.svelte';
	import { ThemeColors } from '$types/core.type';
	import { resetGame } from '$services/game.service';
	import { eventsService } from '$services/events.service';

	// Two-step confirm so a stray click can't wipe a long run. The first press
	// arms the reset; the second actually clears the persisted road state.
	let confirming = false;
	let done = false;

	// Clears every Tauri-Store value the road game persists, returning to a "no
	// game" state. The /road page rehydrates from these stores on mount, so it
	// shows the starter-selection modal next time it's opened. Also wipes the
	// recorded Claude Code prompt activity — the same clear the events page does.
	function reset() {
		resetGame();
		eventsService.clear();
		confirming = false;
		done = true;
	}

	function arm() {
		done = false;
		confirming = true;
	}

	function cancel() {
		confirming = false;
	}
</script>

<section class="mx-auto flex max-w-xl flex-col gap-6">
	<header class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold">Settings</h1>
		<p class="text-base-content/70">Manage your saved game progress.</p>
	</header>

	<div class="card bg-base-100 shadow-sm">
		<div class="card-body gap-4">
			<div class="flex flex-col gap-1">
				<h2 class="card-title">Reset game progress</h2>
				<p class="text-sm text-base-content/70">
					Clears your saved road progression — the follower's species, level and EXP, plus the
					trainer choice — so the journey starts over from the beginning. This cannot be undone.
				</p>
			</div>

			{#if done}
				<div role="status" class="alert alert-success">
					<span>Progress cleared. Open the road to start a fresh journey.</span>
				</div>
			{/if}

			<div class="card-actions justify-end">
				{#if confirming}
					<Button label="Cancel" color={ThemeColors.Neutral} outline on:click={cancel} />
					<Button label="Yes, reset everything" color={ThemeColors.Error} on:click={reset} />
				{:else}
					<Button label="Reset game progress" color={ThemeColors.Error} outline on:click={arm} />
				{/if}
			</div>
		</div>
	</div>
</section>
