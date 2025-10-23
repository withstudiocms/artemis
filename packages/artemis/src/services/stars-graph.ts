import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { formattedLog } from '../utils/log.ts';
import { fetchStarHistoryPng, parseRepository, StarHistoryError } from '../utils/star-history.ts';

/**
 * Initializes and registers the "/stars-graph" interaction command.
 *
 * This Effect:
 * - Resolves the InteractionsRegistry
 * - Builds a global "stars-graph" interaction that:
 *   - Accepts a repository parameter (format: owner/repo)
 *   - Fetches the star history chart from star-history.com API
 *   - Converts it to PNG
 *   - Responds with the chart attached as a file
 * - Handles errors gracefully with user-friendly messages
 * - Registers the built interaction in the registry
 *
 * @returns An Effect that, when executed, registers the "stars-graph" interaction.
 */
const make = Effect.gen(function* () {
	const registry = yield* InteractionsRegistry;

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

			// Fetch star history PNG from star-history.com API
			const result = yield* Effect.matchEffect(
				fetchStarHistoryPng(repository),
				{
					onFailure: (error) =>
						Effect.succeed({
							type: 'error' as const,
							message:
								error instanceof StarHistoryError
									? `❌ ${error.message}`
									: `❌ An error occurred while fetching star history: ${String(error)}`,
						}),
					onSuccess: (buffer) =>
						Effect.succeed({
							type: 'success' as const,
							buffer,
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

			yield* Effect.logDebug(formattedLog('StarsGraph', `Generated chart for ${repository}`));

			const filename = `${parsed.owner}-${parsed.repo}-star-history.png`;

			return Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					content: `📊 **Star History for ${repository}**`,
					attachments: [
						{
							id: '0',
							filename,
						},
					],
				},
				files: [new File([new Uint8Array(result.buffer)], filename, { type: 'image/png' })],
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
