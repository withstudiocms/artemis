import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { contributing } from '../static/embeds.ts';
import { httpPublicDomain } from '../static/env.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [registry, botDomain] = yield* Effect.all([InteractionsRegistry, httpPublicDomain]);

	const contributeCommand = Ix.global(
		{
			name: 'contribute',
			description: 'Creates a contributing guide for the current channel',
		},
		Effect.succeed(
			Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					embeds: [contributing(botDomain)],
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
