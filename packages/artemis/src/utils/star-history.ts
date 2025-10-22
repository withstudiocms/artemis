import { Effect } from 'effect';
import { Github } from '../core/github.ts';

/**
 * Represents a data point in the star history
 */
export interface StarDataPoint {
	readonly date: Date;
	readonly count: number;
}

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
 * Fetches the complete star history for a GitHub repository.
 * 
 * This function:
 * - Fetches all stargazers with their starred_at timestamps using pagination
 * - Aggregates the data into cumulative star counts over time
 * - Returns an array of {date, count} data points suitable for charting
 * 
 * @param owner - The repository owner (username or organization)
 * @param repo - The repository name
 * @returns Effect that produces an array of StarDataPoint objects
 */
export const fetchStarHistory = (
	owner: string,
	repo: string
): Effect.Effect<Array<StarDataPoint>, Error, Github> =>
	Effect.gen(function* () {
		const github = yield* Github;

		// Fetch all stargazers with pagination using request instead of stream
		const allStargazers: Array<{ starred_at: string }> = [];
		let page = 1;
		let hasMore = true;

		while (hasMore) {
			const response = yield* github.request((rest) =>
				rest.activity.listStargazersForRepo({
					owner,
					repo,
					per_page: 100,
					page,
					headers: {
						accept: 'application/vnd.github.v3.star+json',
					},
				})
			).pipe(
				Effect.catchAll((error) =>
					Effect.fail(
						new StarHistoryError(
							`Failed to fetch stargazers: ${error instanceof Error ? error.message : String(error)}`
						)
					)
				)
			);

			const data = response.data as Array<{ starred_at: string }>;
			allStargazers.push(...data);
			hasMore = data.length === 100;
			page++;
		}

		// If no stars, return empty array
		if (allStargazers.length === 0) {
			return [];
		}

		// Sort by starred_at to ensure chronological order
		const sortedStargazers = allStargazers.sort(
			(a, b) => new Date(a.starred_at).getTime() - new Date(b.starred_at).getTime()
		);

		// Create data points with cumulative counts
		const dataPoints: StarDataPoint[] = sortedStargazers.map((stargazer, index) => ({
			date: new Date(stargazer.starred_at),
			count: index + 1,
		}));

		// Sample the data points to keep the chart manageable
		// For repos with many stars, we'll sample to ~100 points max
		const sampledPoints = sampleDataPoints(dataPoints, 100);

		return sampledPoints;
	});

/**
 * Samples data points to reduce the number of points while preserving the shape of the curve.
 * Always includes the first and last points.
 * 
 * @param points - Array of data points to sample
 * @param maxPoints - Maximum number of points to keep
 * @returns Sampled array of data points
 */
function sampleDataPoints(
	points: StarDataPoint[],
	maxPoints: number
): StarDataPoint[] {
	if (points.length <= maxPoints) {
		return points;
	}

	const sampledPoints: StarDataPoint[] = [];
	const step = (points.length - 1) / (maxPoints - 1);

	for (let i = 0; i < maxPoints; i++) {
		const index = Math.round(i * step);
		sampledPoints.push(points[index]);
	}

	return sampledPoints;
}

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

