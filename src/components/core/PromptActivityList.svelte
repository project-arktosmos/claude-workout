<script lang="ts">
	import classNames from 'classnames';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { PromptStatus, type PromptEvent } from '$types/event.type';

	// The per-prompt activity log: one row per prompt turn (text, start time,
	// duration, status), newest first. Shared by the /events directory cards and
	// the /road session panel so both render prompt activity identically.
	export let prompts: PromptEvent[] = [];

	const statusBadge: Record<PromptStatus, string> = {
		[PromptStatus.Running]: 'badge-info',
		[PromptStatus.Completed]: 'badge-success',
		[PromptStatus.Failed]: 'badge-error'
	};

	// Live clock so a still-running prompt's elapsed time counts up each second.
	let now = browser ? Date.now() : 0;
	const ticker = browser ? setInterval(() => (now = Date.now()), 1000) : undefined;
	onDestroy(() => clearInterval(ticker));

	function formatTime(ts: number): string {
		return new Date(ts).toLocaleTimeString();
	}

	/** The project driving a prompt — the basename of its working directory. */
	function projectName(cwd: string): string {
		return cwd.split('/').filter(Boolean).at(-1) ?? '—';
	}

	function formatElapsed(ms: number): string {
		const total = Math.max(0, Math.floor(ms / 1000));
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const seconds = total % 60;
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	}

	function formatDuration(durationMs: number | null): string {
		if (!durationMs || durationMs <= 0) return '—';
		return formatElapsed(durationMs);
	}
</script>

<ul class="divide-base-300 divide-y">
	{#each prompts as prompt (prompt.id)}
		<li class="flex items-start gap-2 px-3 py-2">
			<span class={classNames('badge badge-xs mt-0.5 shrink-0', statusBadge[prompt.status])}></span>
			<div class="min-w-0 flex-1">
				<p class="truncate text-xs font-semibold" title={prompt.cwd}>
					{projectName(prompt.cwd)}
				</p>
				<p class="truncate text-xs opacity-80" title={prompt.prompt}>
					{prompt.prompt || '—'}
				</p>
				<div class="flex flex-wrap gap-x-3 text-[0.65rem] opacity-60">
					<span>{formatTime(prompt.startedAt)}</span>
					<span>
						{#if prompt.status === PromptStatus.Running}
							<span class="text-info">{formatElapsed(now - prompt.startedAt)}</span>
						{:else}
							{formatDuration(prompt.durationMs)}
						{/if}
					</span>
					{#if prompt.errorType}
						<span class="text-error">{prompt.errorType}</span>
					{/if}
				</div>
			</div>
		</li>
	{/each}
</ul>
