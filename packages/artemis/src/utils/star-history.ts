import { Data, Effect } from 'effect';

/**
 * Parses and validates a GitHub repository string.
 *
 * @param repo - Repository string in format: owner/repo
 * @returns Parsed repository object with owner and repo, or null if invalid
 *
 * @example
 * ```ts
 * parseRepository('facebook/react') // => { owner: 'facebook', repo: 'react' }
 * parseRepository('invalid') // => null
 * ```
 */
export function parseRepository(repo: string): { owner: string; repo: string } | null {
	const parts = repo.split('/');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return null;
	}
	return { owner: parts[0], repo: parts[1] };
}

/**
 * Represents an error specific to star history URL generation.
 *
 * This error extends from `Data.TaggedError` with the tag `'utils/StarHistoryError'`
 * and includes a `cause` property to provide additional context about the underlying issue.
 *
 * @example
 * ```typescript
 * throw new StarHistoryError({ cause: originalError });
 * ```
 *
 * @property cause - The underlying cause of the error, can be any value.
 */
export class StarHistoryError extends Data.TaggedError('utils/StarHistoryError')<{
	cause: unknown;
}> {}

/**
 * Generates the star history SVG URL for a given GitHub repository.
 *
 * @param pathParts - An array containing the path parts, where the owner is at index 2 and the repo at index 3.
 * @returns An Effect that yields the star history SVG URL or fails with a StarHistoryError.
 *
 * @example
 * ```ts
 * const urlEffect = getStarHistorySvgUrl(['api', 'star-history', 'facebook', 'react']);
 * // urlEffect yields: 'https://api.star-history.com/svg?repos=facebook/react&type=Date'
 * ```
 */
export const getStarHistorySvgUrl = Effect.fn('utils/getStarHistorySvgUrl')((repository: string) =>
	Effect.try({
		try: () => `https://api.star-history.com/svg?repos=${repository}&type=Date`,
		catch: (cause) => new StarHistoryError({ cause }),
	})
);
