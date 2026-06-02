<script lang="ts">
	import { soundEnabled } from '$services/sound-enabled.service';
	import { theme } from '$services/theme.service';

	// App-wide quick toggles, floated top-right over the page: mute/unmute the
	// sound cues and switch between the light and dark DaisyUI themes. Both write
	// through their persistent services, so the choices survive across sessions.

	$: soundOn = $soundEnabled;
	$: isDark = $theme === 'dark';
</script>

<div class="fixed top-0 right-0 z-50 flex items-center gap-4 p-3">
	<label class="flex cursor-pointer items-center gap-2">
		<span class="text-base-content/70 text-xs font-medium">Sound</span>
		<input
			type="checkbox"
			class="toggle toggle-sm toggle-primary"
			aria-label="Enable sounds"
			checked={soundOn}
			on:change={(event) => soundEnabled.set(event.currentTarget.checked)}
		/>
	</label>
	<label class="flex cursor-pointer items-center gap-2">
		<span class="text-base-content/70 text-xs font-medium">Dark</span>
		<input
			type="checkbox"
			class="toggle toggle-sm toggle-primary"
			aria-label="Use dark theme"
			checked={isDark}
			on:change={(event) => theme.set(event.currentTarget.checked ? 'dark' : 'light')}
		/>
	</label>
</div>
