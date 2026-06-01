<script lang="ts">
	import { onMount } from 'svelte';
	import classNames from 'classnames';
	import { eventsService } from '$services/events.service';
	import { PromptStatus, type PromptEvent } from '$types/event.type';

	const events = eventsService.store;

	onMount(() => {
		eventsService.init();
	});

	const statusBadge: Record<PromptStatus, string> = {
		[PromptStatus.Running]: 'badge-info',
		[PromptStatus.Completed]: 'badge-success',
		[PromptStatus.Failed]: 'badge-error'
	};

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString();
	}

	function formatDuration(event: PromptEvent): string {
		if (event.durationMs == null) return '—';
		if (event.durationMs < 1000) return `${event.durationMs} ms`;
		return `${(event.durationMs / 1000).toFixed(1)} s`;
	}
</script>

<div class="mb-4 flex items-center justify-between">
	<h1 class="text-2xl font-bold">Events</h1>
	<button
		class="btn btn-sm btn-ghost"
		on:click={() => eventsService.clear()}
		disabled={$events.length === 0}
	>
		Clear
	</button>
</div>

<p class="mb-4 text-sm opacity-70">
	Live Claude Code prompt activity from every session on this machine.
</p>

{#if $events.length === 0}
	<div class="alert">
		<span>No prompts yet. Launch a prompt in any Claude Code session to see it appear here.</span>
	</div>
{:else}
	<div class="overflow-x-auto">
		<table class="table table-zebra">
			<thead>
				<tr>
					<th>Status</th>
					<th>Prompt</th>
					<th>Directory</th>
					<th>Started</th>
					<th>Duration</th>
				</tr>
			</thead>
			<tbody>
				{#each $events as event (event.id)}
					<tr>
						<td>
							<span class={classNames('badge', statusBadge[event.status])}>
								{event.status}
							</span>
						</td>
						<td class="max-w-md truncate" title={event.prompt}>
							{event.prompt || '—'}
						</td>
						<td class="font-mono text-xs opacity-70" title={event.cwd}>
							{event.cwd || '—'}
						</td>
						<td class="whitespace-nowrap text-sm">{formatTime(event.startedAt)}</td>
						<td class="whitespace-nowrap text-sm">
							{formatDuration(event)}
							{#if event.errorType}
								<span class="text-error">({event.errorType})</span>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
