import { DiscordGateway } from 'dfx/DiscordGateway';
import { DiscordREST } from 'dfx/DiscordREST';
import { Effect, Layer } from 'effect';
import { DiscordApplication } from '../core/discord-rest.ts';
import { spacedOnceSecond } from '../static/schedules.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [gateway, app, rest] = yield* Effect.all([DiscordGateway, DiscordApplication, DiscordREST]);

	const handlePing = gateway
		.handleDispatch('MESSAGE_CREATE', (message) =>
			Effect.gen(function* () {
				// Ignore messages from bots
				if (message.author.bot) return;

				// Ignore messages without mentions
				if (!message.mentions || message.mentions.length === 0) return;

				// Ignore messages that do not mention the bot
				if (!message.mentions.some(({ id }) => id === app.id)) return;

				// Temporary reply content
				const replyContent = `Hello <@${message.author.id}>! This is a test reply.`;

				// Log the reply action
				yield* Effect.logDebug(
					formattedLog('PingReply', `Replying to mention from ${message.author.id}`)
				);

				// Send the reply message
				yield* rest.createMessage(message.channel_id, {
					content: replyContent,
					allowed_mentions: {
						parse: ['users'],
						users: [message.author.id],
					},
					message_reference: {
						message_id: message.id,
						channel_id: message.channel_id,
						guild_id: message.guild_id,
					},
				});
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
