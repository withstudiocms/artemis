import { DiscordGateway } from 'dfx/DiscordGateway';
import { DiscordREST } from 'dfx/DiscordREST';
import type { GatewayMessageCreateDispatchData } from 'dfx/types';
import { Effect } from 'effect';
import { GroqAiHelpers } from '../core/groq.ts';
import { formattedLog } from './log.ts';

/**
 * Creates a response using Groq's Compound agent with personality
 */
const createFunResponse = (userInput: string, username: string) =>
	Effect.gen(function* () {
		const { makeCompletion } = yield* GroqAiHelpers;

		const systemPrompt = `You are a fun, slightly chaotic Discord bot with personality named Artemis.
You respond with humor, wit, and creativity. Keep responses concise (1-3 sentences usually)
since this is Discord chat. Be playful and engaging, but never mean or offensive.
Occasionally use Discord/internet culture references naturally.
The user's name is ${username}.`;

		const completion = yield* makeCompletion('compound-beta', [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userInput },
		]);

		const response = completion.choices[0]?.message?.content ?? '*crickets* 🦗';

		return response;
	});

export const handleMessage = (message: GatewayMessageCreateDispatchData) =>
	Effect.gen(function* () {
		const [rest, gateway] = yield* Effect.all([DiscordREST, DiscordGateway]);

		const reply = (content: string) =>
			rest
				.createMessage(message.channel_id, {
					content,
					allowed_mentions: {
						users: [message.author.id],
					},
					message_reference: {
						message_id: message.id,
					},
				})
				.pipe(
					Effect.catchAll((error) =>
						Effect.logError(formattedLog('PingReply', `Failed to send reply: ${String(error)}`))
					)
				);

		// Log the reply action
		yield* Effect.logDebug(
			formattedLog('PingReply', `Replying to mention from ${message.author.id}`)
		);

		// Track rate limiting per user (simple cooldown)
		const userCooldowns = new Map<string, number>();
		const COOLDOWN_MS = 10000; // 10 seconds between requests per user

		const isOnCooldown = (userId: string): boolean => {
			const lastUsed = userCooldowns.get(userId);
			if (!lastUsed) return false;
			return Date.now() - lastUsed < COOLDOWN_MS;
		};

		const setCooldown = (userId: string) => {
			userCooldowns.set(userId, Date.now());
		};

		// Check cooldown
		if (isOnCooldown(message.author.id)) {
			yield* Effect.logDebug(
				formattedLog('PingReply', `User ${message.author.id} is on cooldown.`)
			);
			yield* reply('⏱️ Please wait a moment before sending another message.');
			return;
		}

		// Extract the actual message content
		let userInput = message.content;
		userInput = message.content.replace(/<@!?\d+>/g, '').trim();

		if (!userInput || userInput.trim().length === 0) {
			yield* reply('Yes? 🤔');
			return;
		}

		yield* Effect.logDebug(formattedLog('PingReply', `User ${message.author.id}: ${userInput}`));

		// Show typing indicator
		yield* gateway.send({
			op: 3,
			// @ts-expect-error typing indicator not yet typed
			d: {
				channel_id: message.channel_id,
			},
		});

		// Set cooldown
		setCooldown(message.author.id);

		// Generate response
		const response = yield* createFunResponse(userInput, message.author.username);

		yield* Effect.logDebug(formattedLog('PingReply', `Bot: ${response}`));

		// Send reply
		yield* reply(response);
	});
