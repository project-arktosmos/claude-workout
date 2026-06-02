/**
 * Return up to `count` items chosen at random from `items`, without repeats.
 * If `count` meets or exceeds the pool size, every item is returned (shuffled).
 */
export function pickRandom<T>(items: T[], count: number): T[] {
	const pool = [...items];
	const picked: T[] = [];
	while (picked.length < count && pool.length > 0) {
		const index = Math.floor(Math.random() * pool.length);
		picked.push(pool.splice(index, 1)[0]);
	}
	return picked;
}
