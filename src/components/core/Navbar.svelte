<script lang="ts">
	import classNames from 'classnames';
	import { page } from '$app/state';
	import { routes } from 'virtual:routes';

	// Brand text shown on the left of the navbar.
	export let brand: string = 'Arktosmos';
	// Optional href for the brand (defaults to home).
	export let brandHref: string = '/';
	// Allow parents to extend the navbar's classes.
	export let classes: string = '';

	$: navbarClasses = classNames('navbar', 'bg-base-100', 'shadow-sm', classes);

	function isActive(path: string): boolean {
		return page.url.pathname === path;
	}
</script>

<nav class={navbarClasses}>
	<div class="navbar-start">
		<a href={brandHref} class="btn btn-ghost text-xl">{brand}</a>
	</div>

	<div class="navbar-end">
		<ul class="menu menu-horizontal gap-1 px-1">
			{#each routes as route (route.path)}
				<li>
					<a
						href={route.path}
						class={classNames('btn btn-ghost btn-sm', {
							'btn-active': isActive(route.path)
						})}
						aria-current={isActive(route.path) ? 'page' : undefined}
					>
						{route.label}
					</a>
				</li>
			{/each}
		</ul>
	</div>
</nav>
