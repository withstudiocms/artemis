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
