import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer, pipe } from 'effect';
import { httpPublicDomain } from '../static/env.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';
import { parseRepository } from '../utils/star-history.ts';

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
			const repository = ix.optionValue('repository');

			yield* Effect.logDebug(
				formattedLog('StarsGraph', `Command received for repository: ${repository}`)
			);

			// Validate repository format
			const parsed = parseRepository(repository);
			if (!parsed) {
				yield* Effect.logDebug(
					formattedLog('StarsGraph', `Invalid repository format: ${repository}`)
				);
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: '❌ Invalid repository format. Please use: owner/repo (e.g., facebook/react)',
						flags: Discord.MessageFlags.Ephemeral,
					},
				});
			}

			yield* Effect.logDebug(
				formattedLog('StarsGraph', `Starting star history generation for ${repository}`)
			);

			const svgUrl = yield* pipe(
				httpPublicDomain,
				Effect.flatMap((val) =>
					Effect.succeed(
						`https://${val}/api/star-history/${parsed.owner}/${parsed.repo}?=t=${Date.now()}`
					)
				)
			);
			yield* Effect.logDebug(formattedLog('StarsGraph', `Constructed SVG URL: ${svgUrl}`));

			const embed = new DiscordEmbedBuilder()
				.setTitle(`⭐ Star History: ${repository}`)
				.setColor(0x3b82f6) // Blue color
				.setImage(svgUrl)
				.setURL(svgUrl)
				.setFooter('Data generated using star-history.com')
				.setTimestamp()
				.setAuthor({
					icon_url: 'https://www.star-history.com/assets/icon.png',
					name: 'Star History',
					url: 'https://www.star-history.com/',
				})
				.build();

			// Defer response since this will take a while
			return Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					embeds: [embed],
				},
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
