import { DiscordGateway } from 'dfx/DiscordGateway';
import { Effect, Layer } from 'effect';
import { DiscordApplication } from '../core/discord-rest.ts';
import { spacedOnceSecond } from '../static/schedules.ts';
import { handleMessage } from '../utils/groq-reply.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Creates a Discord ping reply service that listens for and responds to bot mentions.
 *
 * This service:
 * - Listens to MESSAGE_CREATE events from the Discord gateway
 * - Filters out bot messages and messages without mentions
 * - Processes messages that mention the bot
 * - Logs debug information for received mentions
 * - Retries failed operations with a one-second spacing
 * - Forks the message handler in a scoped effect for concurrent execution
 *
 * @returns An Effect that sets up message listeners and handlers for bot mentions
 *
 * @remarks
 * The service requires both `DiscordGateway` and `DiscordApplication` to be available in the Effect context.
 * Message handling is performed asynchronously in a forked scope to avoid blocking the main event loop.
 */
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

				// Log the mention
				yield* Effect.logDebug(
					formattedLog(
						'PingReply',
						`Received mention from ${message.author.id} in channel ${message.channel_id}. Processing...`
					)
				);

				// Handle the message in a forked scope
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

/**
 * A scoped layer that provides the PingReply service.
 *
 * @remarks
 * This layer is created using `Layer.scopedDiscard` which means the service
 * will be acquired when the layer is used and automatically cleaned up when
 * the scope ends, with the cleanup result being discarded.
 *
 * @see {@link make} for the underlying service implementation
 */
export const PingReplyLive = Layer.scopedDiscard(make);
