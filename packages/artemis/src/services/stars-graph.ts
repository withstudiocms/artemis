import { DiscordREST } from 'dfx';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Cause, Effect, FiberMap, Layer } from 'effect';
import { DiscordApplication } from '../core/discord-rest.ts';
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
	const [registry, rest, application, fiberMap] = yield* Effect.all([
		InteractionsRegistry,
		DiscordREST,
		DiscordApplication,
		FiberMap.make<Discord.Snowflake>(),
	]);

	const starsGraphFollowup = (
		context: Discord.APIInteraction,
		repository: string,
		parsed: { owner: string; repo: string }
	) =>
		Effect.gen(function* () {
			yield* Effect.logDebug(formattedLog('StarsGraph', `Generating star history for ${repository}`));

			// Get the public domain to construct our own URL
			const domain = yield* httpPublicDomain;
			const svgUrl = `https://${domain}/api/star-history/${parsed.owner}/${parsed.repo}`;

			const embed = new DiscordEmbedBuilder()
				.setTitle(`⭐ Star History: ${repository}`)
				.setColor(0x3b82f6) // Blue color
				.setImage(svgUrl)
				.setFooter(`Data from star-history.com • ${parsed.owner}/${parsed.repo}`)
				.setTimestamp()
				.build();

			return yield* rest.updateOriginalWebhookMessage(application.id, context.token, {
				payload: {
					content: '',
					embeds: [embed],
				},
			});
		}).pipe(
			Effect.tapErrorCause(Effect.logError),
			Effect.catchAllCause((cause) =>
				rest
					.updateOriginalWebhookMessage(application.id, context.token, {
						payload: {
							content: `❌ An error occurred while generating the star history chart.\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
						},
					})
					.pipe(
						Effect.zipLeft(Effect.sleep('1 minutes')),
						Effect.zipRight(rest.deleteOriginalWebhookMessage(application.id, context.token, {}))
					)
			),
			Effect.withSpan('StarsGraph.followup')
		);

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
			const context = yield* Ix.Interaction;
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

			// Start async work
			yield* starsGraphFollowup(context, repository, parsed).pipe(
				Effect.annotateLogs('repository', repository),
				FiberMap.run(fiberMap, context.id)
			);

			// Defer response since this will take a while
			return Ix.response({
				type: Discord.InteractionCallbackTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
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
