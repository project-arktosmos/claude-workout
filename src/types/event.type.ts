import type { ID } from '$types/core.type';

/**
 * Raw payload as emitted by the Tauri backend's `claude-hook` event — this
 * mirrors the JSON Claude Code sends to a hook command on stdin. Only the
 * fields we consume are typed; hooks may include more.
 */
export interface ClaudeHookPayload {
	hook_event_name: 'UserPromptSubmit' | 'Stop' | 'StopFailure' | string;
	session_id: string;
	cwd?: string;
	prompt?: string;
	error_type?: string;
	transcript_path?: string;
}

export enum PromptStatus {
	Running = 'running',
	Completed = 'completed',
	Failed = 'failed'
}

/**
 * A single Claude Code prompt turn, from launch (UserPromptSubmit) to end
 * (Stop / StopFailure). Start and end hooks are correlated by `sessionId`.
 */
export interface PromptEvent {
	id: ID;
	sessionId: string;
	prompt: string;
	cwd: string;
	status: PromptStatus;
	startedAt: number;
	endedAt: number | null;
	durationMs: number | null;
	errorType: string | null;
}
