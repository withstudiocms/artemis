import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { Github } from '../core/github.ts';
import { generateStarHistoryChart } from '../utils/chart-generator.ts';
import { formattedLog } from '../utils/log.ts';
import { fetchStarHistory, parseRepository, StarHistoryError } from '../utils/star-history.ts';

/**
 * Initializes and registers the "/stars-graph" interaction command.
 *
 * This Effect:
 * - Resolves the InteractionsRegistry and Github service.
 * - Builds a global "stars-graph" interaction that:
 *   - Accepts a repository parameter (format: owner/repo)
 *   - Fetches the star history from GitHub API
 *   - Generates a PNG chart image
 *   - Responds with the chart attached as a file
 * - Handles errors gracefully with user-friendly messages
 * - Registers the built interaction in the registry
 *
 * @returns An Effect that, when executed, registers the "stars-graph" interaction.
 */
const make = Effect.gen(function* () {
	const [registry, github] = yield* Effect.all([InteractionsRegistry, Github]);
	
	const getStarHistory = (owner: string, repo: string) =>
		fetchStarHistory(owner, repo).pipe(Effect.provide(Layer.succeed(Github, github)));

	const starsGraphCommand = Ix.global(
		{
			name: 'stars-graph',
			description: 'Generate a star history graph for a GitHub repository',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'repository',
					description: 'Repository in format: owner/repo (e.g., facebook/react)',
					required: true,
				},
			],
		},
		Effect.fn('StarsGraphCommand')(function* (ix) {
			// Get the repository parameter
			const repository = ix.optionValue('repository');

			// Validate repository format
			const parsed = parseRepository(repository);
			if (!parsed) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: '❌ Invalid repository format. Please use: owner/repo (e.g., facebook/react)',
						flags: Discord.MessageFlags.Ephemeral,
					},
				});
			}

			yield* Effect.logDebug(formattedLog('StarsGraph', `Fetching star history for ${repository}`));

			// Fetch star history and generate chart
			const result = yield* Effect.matchEffect(
				Effect.gen(function* () {
					const starHistory = yield* getStarHistory(parsed.owner, parsed.repo);

					if (starHistory.length === 0) {
						return yield* Effect.fail({ notFound: true });
					}

					const chartBuffer = yield* Effect.tryPromise({
						try: () => generateStarHistoryChart(starHistory, repository),
						catch: (error) =>
							new Error(
								`Failed to generate chart: ${error instanceof Error ? error.message : String(error)}`
							),
					});

					return { buffer: chartBuffer, starCount: starHistory[starHistory.length - 1].count };
				}),
				{
					onFailure: (error) =>
						Effect.succeed({
							type: 'error' as const,
							message:
								error instanceof StarHistoryError
									? error.message
									: String(error).includes('404') || String(error).includes('Not Found')
										? `❌ Repository ${repository} not found. Please check the owner and repo name.`
										: `❌ An error occurred while fetching star history: ${String(error)}`,
						}),
					onSuccess: (data) =>
						Effect.succeed({
							type: 'success' as const,
							buffer: data.buffer,
							starCount: data.starCount,
						}),
				}
			);

			// Handle errors
			if (result.type === 'error') {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: result.message,
						flags: Discord.MessageFlags.Ephemeral,
					},
				});
			}

			yield* Effect.logDebug(
				formattedLog('StarsGraph', `Generated chart for ${repository} (${result.starCount} stars)`)
			);

			const filename = `${parsed.owner}-${parsed.repo}-star-history.png`;

			return Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					content: `📊 **Star History for ${repository}**\nTotal Stars: **${result.starCount.toLocaleString()}** ⭐`,
					attachments: [
						{
							id: '0',
							filename,
						},
					],
				},
				files: [
					new File([new Uint8Array(result.buffer)], filename, { type: 'image/png' }),
				],
			});
		})
	);

	const ix = Ix.builder.add(starsGraphCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('StarsGraph', 'Interactions registered and running.')),
	]);
});

/**
 * Live layer for the Stars Graph service.
 */
export const StarsGraphLive = Layer.scopedDiscard(make);
