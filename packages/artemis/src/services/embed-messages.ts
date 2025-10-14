import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { httpPublicDomain } from '../static/env.ts';
import { DiscordEmbedBuilder, EMBED_BRAND_COLOR } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [registry, botDomain] = yield* Effect.all([InteractionsRegistry, httpPublicDomain]);

	const contributeCommand = Ix.global(
		{
			name: 'contribute',
			description: 'Creates an Embed message for contributing to StudioCMS',
		},
		Effect.succeed(
			Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					embeds: [
						new DiscordEmbedBuilder()
							.setTitle('Contributing to StudioCMS')
							.setDescription(
								'Help make StudioCMS better! Here are some ways to get started with contributing:'
							)
							.setThumbnail(`https://${botDomain}/studiocms.png`)
							.addFields([
								{
									name: '🌱 Good First Issues',
									value:
										'[Browse all good first issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)',
								},
								{
									name: '🙋 Help Wanted',
									value:
										'[Browse all help wanted issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)',
								},
								{
									name: '📚 Getting Started',
									value:
										'• [Contributing Guide](https://github.com/withstudiocms/studiocms?tab=contributing-ov-file)\n• [Development Setup](https://github.com/withstudiocms/studiocms?tab=readme-ov-file#getting-started-with-our-development-playground)',
								},
							])
							.setColor(EMBED_BRAND_COLOR)
							.setFooter('Apollo, we have another contributor! 🚀')
							.build(),
					],
				},
			})
		)
	);

	const ix = Ix.builder.add(contributeCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('EmbedMessages', 'Interactions registered and running.')),
	]);
});

export const EmbedMessagesLive = Layer.scopedDiscard(make);
