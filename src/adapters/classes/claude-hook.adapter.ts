import { AdapterClass } from '$adapters/classes/adapter.class';
import { PromptStatus, type ClaudeHookPayload, type PromptEvent } from '$types/event.type';

/**
 * Transforms raw Claude Code hook payloads into internal `PromptEvent`s.
 * Pure mapping only — correlating a launch with its end lives in the service.
 */
export class ClaudeHookAdapter extends AdapterClass {
	constructor() {
		super('claude-hook');
	}

	/** Build a fresh, in-progress event from a UserPromptSubmit payload. */
	toPromptEvent(payload: ClaudeHookPayload, startedAt: number): PromptEvent {
		return {
			id: crypto.randomUUID(),
			sessionId: payload.session_id ?? 'unknown',
			prompt: payload.prompt ?? '',
			cwd: payload.cwd ?? '',
			status: PromptStatus.Running,
			startedAt,
			endedAt: null,
			durationMs: null,
			errorType: null
		};
	}

	/** Apply an end payload (Stop / StopFailure) to a running event. */
	applyEnd(event: PromptEvent, payload: ClaudeHookPayload, endedAt: number): PromptEvent {
		const failed = payload.hook_event_name === 'StopFailure';
		return {
			...event,
			status: failed ? PromptStatus.Failed : PromptStatus.Completed,
			endedAt,
			durationMs: endedAt - event.startedAt,
			errorType: failed ? (payload.error_type ?? 'unknown') : null
		};
	}
}

export const claudeHookAdapter = new ClaudeHookAdapter();
