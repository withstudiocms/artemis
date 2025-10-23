import { Effect } from 'effect';
import sharp from 'sharp';

/**
 * Error for star history operations
 */
export class StarHistoryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'StarHistoryError';
	}
}

/**
 * Fetches star history SVG from star-history.com API and converts to PNG.
 *
 * This function:
 * - Uses star-history.com's API to generate the chart (offloading the work)
 * - Converts the SVG response to PNG using sharp
 * - Returns a Buffer containing the PNG image
 *
 * @param repo - Full repository name in format: owner/repo
 * @param width - Optional width for the PNG (default: 1200)
 * @param height - Optional height for the PNG (default: 600)
 * @returns Effect that produces a Buffer containing the PNG image
 */
export const fetchStarHistoryPng = (
	repo: string,
	width = 1200,
	height = 600
): Effect.Effect<Buffer, StarHistoryError> =>
	Effect.gen(function* () {
		// Validate repo format
		if (!repo.includes('/')) {
			return yield* Effect.fail(
				new StarHistoryError(`Invalid repository format: ${repo}. Expected format: owner/repo`)
			);
		}

		// Fetch SVG from star-history API
		const svgBuffer = yield* Effect.tryPromise({
			try: async () => {
				const apiUrl = `https://api.star-history.com/svg?repos=${repo}&type=Date`;
				const response = await fetch(apiUrl);

				if (!response.ok) {
					throw new Error(`Failed to fetch star history: ${response.statusText}`);
				}

				return Buffer.from(await response.arrayBuffer());
			},
			catch: (error) =>
				new StarHistoryError(
					`Failed to fetch star history: ${error instanceof Error ? error.message : String(error)}`
				),
		});

		// Convert SVG to PNG using sharp
		const pngBuffer = yield* Effect.tryPromise({
			try: async () => {
				return await sharp(svgBuffer)
					.resize(width, height, {
						fit: 'contain',
						background: { r: 255, g: 255, b: 255, alpha: 1 },
					})
					.png()
					.toBuffer();
			},
			catch: (error) =>
				new StarHistoryError(
					`Failed to convert SVG to PNG: ${error instanceof Error ? error.message : String(error)}`
				),
		});

		return pngBuffer;
	});

/**
 * Validates a repository string in the format "owner/repo"
 *
 * @param repository - The repository string to validate
 * @returns Object with owner and repo if valid, or null if invalid
 */
export function parseRepository(repository: string): { owner: string; repo: string } | null {
	const parts = repository.trim().split('/');
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return null;
	}
	return { owner: parts[0], repo: parts[1] };
}
