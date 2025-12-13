import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [registry] = yield* Effect.all([InteractionsRegistry]);

	const blueskyCommand = Ix.global(
		{
			name: 'bluesky',
			description: 'Allow management of BlueSky integration',
		},
		Effect.succeed(
			Ix.response({
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					content: 'BlueSky integration is coming soon! Stay tuned for updates.',
					flags: Discord.MessageFlags.Ephemeral,
				},
			})
		)
	);

	const ix = Ix.builder.add(blueskyCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('BlueSky', 'Interactions registered and running.')),
	]);
});

export const BlueSkyLive = Layer.scopedDiscard(make);
