<script lang="ts">
	import classNames from 'classnames';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { eventsService } from '$services/events.service';
	import { exercisesCatalog } from '$services/exercises.service';
	import { settingsService } from '$services/settings.service';
	import PromptActivityList from '$components/core/PromptActivityList.svelte';
	import { PromptStatus, type ExerciseRound } from '$types/event.type';
	import { ExerciseMode } from '$types/exercise.type';

	// History load + live subscription are initialized app-wide in +layout.svelte.
	// `byDirectory` collapses the raw per-turn feed into one row per directory.
	const directories = eventsService.byDirectory;
	const settings = settingsService.store;

	const modes: { value: ExerciseMode; label: string }[] = [
		{ value: ExerciseMode.Workout, label: 'Workout' },
		{ value: ExerciseMode.Yoga, label: 'Yoga' },
		{ value: ExerciseMode.Mix, label: 'Mix' }
	];

	function setMode(mode: ExerciseMode): void {
		settingsService.set({ ...$settings, mode });
	}

	const statusBadge: Record<PromptStatus, string> = {
		[PromptStatus.Running]: 'badge-info',
		[PromptStatus.Completed]: 'badge-success',
		[PromptStatus.Failed]: 'badge-error'
	};

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString();
	}

	function formatDuration(durationMs: number | null): string {
		if (!durationMs || durationMs <= 0) return '—';
		return formatElapsed(durationMs);
	}

	// Live clock: ticks every second while running turns are on screen so their
	// elapsed time counts up. `now` is reactive, so any expression that reads it
	// re-renders on each tick.
	let now = browser ? Date.now() : 0;
	const ticker = browser ? setInterval(() => (now = Date.now()), 1000) : undefined;
	onDestroy(() => clearInterval(ticker));

	function formatElapsed(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = total % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	}

	// A round's timer is the sum of its prompts' durations: completed prompts
	// contribute a fixed duration, still-running ones count up live off `now`.
	function roundElapsed(round: ExerciseRound): number {
		const live = round.runningSince.reduce((sum, since) => sum + Math.max(0, now - since), 0);
		return round.completedDurationMs + live;
	}
</script>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-2xl font-bold">Events</h1>
	<button
		class="btn btn-sm btn-ghost"
		on:click={() => eventsService.clear()}
		disabled={$directories.length === 0}
	>
		Clear
	</button>
</div>

<p class="mb-4 text-sm opacity-70">
	Live Claude Code prompt activity from every session on this machine, grouped by directory. The
	first prompt in an idle directory draws a random exercise from the selected pool; prompts that
	start while it's still running share that same exercise and add their time to its timer. A fresh
	exercise is drawn only once the directory goes idle again.
</p>

<div class="mb-4 flex items-center gap-3">
	<span class="text-sm font-medium opacity-70">Pool</span>
	<div role="tablist" class="tabs tabs-boxed w-fit">
		{#each modes as mode (mode.value)}
			<button
				role="tab"
				class={classNames('tab', { 'tab-active': $settings.mode === mode.value })}
				on:click={() => setMode(mode.value)}
			>
				{mode.label}
			</button>
		{/each}
	</div>
</div>

{#if $directories.length === 0}
	<div class="alert">
		<span>No prompts yet. Launch a prompt in any Claude Code session to see it appear here.</span>
	</div>
{:else}
	<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
		{#each $directories as directory (directory.cwd)}
			<div class="card bg-base-100 shadow-md">
				<div class="card-body gap-3 p-4">
					<div class="flex items-start justify-between gap-2">
						<h2
							class="min-w-0 flex-1 truncate font-mono text-sm font-medium"
							title={directory.cwd}
						>
							{directory.cwd || '—'}
						</h2>
						<span class={classNames('badge badge-sm shrink-0', statusBadge[directory.status])}>
							{directory.status}
						</span>
					</div>

					<div class="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-70">
						<span>
							{directory.promptCount} prompts
							{#if directory.runningCount > 0}
								<span class="opacity-80">({directory.runningCount} running)</span>
							{/if}
						</span>
						<span>First seen {formatTime(directory.startedAt)}</span>
						<span>
							{formatDuration(directory.totalDurationMs)} total
							{#if directory.errorType}
								<span class="text-error">({directory.errorType})</span>
							{/if}
						</span>
					</div>

					{#if directory.rounds.length}
						<div class="overflow-x-auto">
							<table class="table table-sm">
								<thead>
									<tr>
										<th>Round</th>
										<th>Exercises</th>
										<th class="text-right">Time</th>
									</tr>
								</thead>
								<tbody>
									{#each directory.rounds as round (round.id)}
										<tr>
											<td class="align-top">
												<span class={classNames('badge badge-xs', statusBadge[round.status])}>
													{formatTime(round.startedAt)}
												</span>
												{#if round.promptCount > 1}
													<span class="mt-1 block text-[0.65rem] opacity-60">
														{round.promptCount} prompts
													</span>
												{/if}
											</td>
											<td>
												{#if round.exercises.length}
													<div class="flex flex-wrap gap-1">
														<!-- Key by position: a round is a timed sequence, so the same exercise can
												legitimately repeat once the pool is exhausted — keying by id would throw
												each_key_duplicate and crash the whole page render. -->
											{#each exercisesCatalog.resolve(round.exercises.map((segment) => segment.id)) as image, i (i)}
															<span
																aria-label={image.name}
																class="tooltip flex h-9 w-9 items-center justify-center rounded bg-base-200 p-1 [&_svg]:h-full [&_svg]:w-full [&_svg]:fill-current"
																data-tip={image.name}
															>
																{@html exercisesCatalog.inlineSvg(image.id)}
															</span>
														{/each}
													</div>
												{:else}
													<span class="opacity-50">—</span>
												{/if}
											</td>
											<td class="align-top text-right text-xs whitespace-nowrap tabular-nums">
												{#if round.status === PromptStatus.Running}
													<span class="text-info">{formatElapsed(roundElapsed(round))}</span>
												{:else}
													{formatDuration(round.completedDurationMs)}
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else}
						<p class="text-sm opacity-60">No prompt rounds yet.</p>
					{/if}

					{#if directory.prompts.length}
						<details class="collapse collapse-arrow bg-base-200">
							<summary class="collapse-title min-h-0 px-3 py-2 text-xs font-medium opacity-80">
								Prompts ({directory.prompts.length})
							</summary>
							<div class="collapse-content px-0">
								<PromptActivityList prompts={directory.prompts} />
							</div>
						</details>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
