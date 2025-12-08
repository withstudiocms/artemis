import { DiscordGateway } from 'dfx/DiscordGateway';
import { Effect, Layer } from 'effect';
import { DiscordApplication } from '../core/discord-rest.ts';
import { spacedOnceSecond } from '../static/schedules.ts';
import { handleMessage } from '../utils/groq-fun.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [gateway, app] = yield* Effect.all([DiscordGateway, DiscordApplication]);

	const handlePing = gateway
		.handleDispatch('MESSAGE_CREATE', (message) =>
			Effect.gen(function* () {
				// Ignore messages from bots
				if (message.author.bot) return;

				// Ignore messages without mentions
				if (!message.mentions || message.mentions.length === 0) return;

				// Ignore messages that do not mention the bot
				if (!message.mentions.some(({ id }) => id === app.id)) return;

				yield* Effect.logDebug(
					formattedLog(
						'PingReply',
						`Received mention from ${message.author.id} in channel ${message.channel_id}`
					)
				);

				yield* handleMessage(message);
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// Setup the listeners
	yield* Effect.all([
		Effect.forkScoped(handlePing),
		Effect.logDebug(formattedLog('PingReply', 'Interactions registered and running.')),
	]);
});

export const PingReplyLive = Layer.scopedDiscard(make);
