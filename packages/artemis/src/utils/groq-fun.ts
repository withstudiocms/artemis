import { DiscordREST } from 'dfx/DiscordREST';
import type { GatewayMessageCreateDispatchData } from 'dfx/types';
import { Effect } from 'effect';
import { GroqAiHelpers } from '../core/groq.ts';
import { formattedLog } from './log.ts';

/**
 * Reference materials for Artemis bot
 */
const BOT_RESOURCES = {
	quickLinks: [
		{ label: 'Documentation', url: 'https://docs.studiocms.dev' },
		{ label: 'Website', url: 'https://studiocms.dev' },
		{ label: 'GitHub', url: 'https://github.com/withstudiocms/studiocms' },
	],
	quickFacts: [
		'The StudioCMS project is built for Astro with Astro and the community in mind. You can be sure that any of our projects will be focused on improving the ecosystem and giving back to developers.',
		`StudioCMS isn't a closed-off project or organization - it is made up of Astro community members like you! Anyone can make suggestions and contribute in whichever way they like.`,
		'We believe in open source software and the power of community collaboration to create better tools for everyone.',
		'StudioCMS projects are designed to be modular and flexible, allowing developers to pick and choose the components that best fit their needs.',
		'We prioritize performance and developer experience in all our projects, ensuring that our tools are not only powerful but also easy and enjoyable to use.',
	],
	techDetails: [
		'StudioCMS is built with Astro, TypeScript, and Effect-TS, leveraging modern web technologies for optimal performance and developer experience.',
		'Our architecture follows a modular design, allowing for easy integration and feature expansion through the use of plugins.',
		'We utilize CI/CD pipelines to ensure that all contributions are tested and deployed efficiently, maintaining high code quality across our projects.',
		'StudioCMS is designed with a focus on developer experience, providing intuitive APIs and comprehensive documentation to streamline the development process.',
		'Security is a top priority for us; we implement best practices to protect user data and ensure the integrity of our applications.',
	],
	commonQuestions: [
		{
			question: 'How do I install StudioCMS?',
			answer:
				'You can install StudioCMS by following the instructions in our documentation at https://docs.studiocms.dev/en/start-here/getting-started/.',
		},
		{
			question: 'Where can I find the documentation?',
			answer: 'You can find the documentation at https://docs.studiocms.dev.',
		},
		{
			question: 'How can I contribute to StudioCMS?',
			answer: `We welcome contributions! Please check out the following resources to get started:
- 🌱 Good First Issues: [Browse good first issues](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
- 🙋 Help Wanted: [Browse help wanted issues](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)
- 📚 Getting Started:
  - [Contributing Guide](https://github.com/withstudiocms/studiocms?tab=contributing-ov-file)
  - [Development Setup](https://github.com/withstudiocms/studiocms?tab=readme-ov-file#getting-started-with-our-development-playground)`,
		},
		{
			question: 'How do I report a bug or request a feature?',
			answer:
				'You can report a bug or request a feature by opening an issue on our GitHub repository at https://github.com/withstudiocms/studiocms/issues.',
		},
	],
} as const;

const needsContext = (userInput: string): boolean => {
	const supportKeywords = [
		'help',
		'how',
		'docs',
		'documentation',
		'guide',
		'tutorial',
		'support',
		'command',
		'feature',
		'install',
		'setup',
		'configure',
	];

	const lowerInput = userInput.toLowerCase();
	return supportKeywords.some((keyword) => lowerInput.includes(keyword));
};

/**
 * Fetches relevant context based on user query
 */
const getRelevantContext = (userInput: string) =>
	Effect.gen(function* () {
		if (!needsContext(userInput)) {
			return null; // Don't load context for casual chat
		}

		const resourceContext = `
## Quick Links:
${BOT_RESOURCES.quickLinks.map((link) => `- [${link.label}](${link.url})`).join('\n')}

## Quick Facts:
${BOT_RESOURCES.quickFacts.map((fact, i) => `${i + 1}. ${fact}`).join('\n')}

## Common Questions:
${BOT_RESOURCES.commonQuestions
	.map((qa, i) => `${i + 1}. Q: ${qa.question}\n   A: ${qa.answer.replace(/\n/g, '\n      ')}`)
	.join('\n')}

## Technical Details:
${BOT_RESOURCES.techDetails.map((detail, i) => `${i + 1}. ${detail}`).join('\n')}
`;

		// Optionally: parse and filter context based on query
		// For now, return all context for support questions
		return resourceContext;
	});

/**
 * Creates a response using Groq's Compound agent with personality
 */
const createFunResponse = (userInput: string, username: string) =>
	Effect.gen(function* () {
		const { makeCompletion } = yield* GroqAiHelpers;

		const basePrompt = `You are a fun, slightly chaotic Discord bot with personality named Artemis, created to assist users with StudioCMS-related questions and engage in light-hearted conversation.
You respond with humor, wit, and creativity. Keep responses concise (1-3 sentences usually)
since this is Discord chat. Be playful and engaging, but never mean or offensive.
Occasionally use Discord/internet culture references naturally.
The user's name is ${username}.`;

		// Only load context if needed
		const context = yield* getRelevantContext(userInput);

		const systemPrompt = context
			? `${basePrompt}\n\n# Reference Materials\n${context}\n\nUse these resources to help answer the user's question accurately while keeping your fun personality!`
			: basePrompt;

		const completion = yield* makeCompletion('compound-beta', [
			{ role: 'system', content: systemPrompt },
			{ role: 'user', content: userInput },
		]);

		const response = completion.choices[0]?.message?.content ?? '*crickets* 🦗';

		return response;
	});

export const handleMessage = (message: GatewayMessageCreateDispatchData) =>
	Effect.gen(function* () {
		const rest = yield* DiscordREST;

		const sendThinking = () =>
			rest.createMessage(message.channel_id, {
				content: '🤔 Thinking...',
				allowed_mentions: {
					users: [message.author.id],
				},
				message_reference: {
					message_id: message.id,
				},
			});

		const updateMessage = (msgId: string, newContent: string) =>
			rest
				.updateMessage(message.channel_id, msgId, {
					content: newContent,
				})
				.pipe(
					Effect.catchAll((error) =>
						Effect.logError(formattedLog('PingReply', `Failed to update message: ${String(error)}`))
					)
				);

		// Log the reply action
		yield* Effect.logDebug(
			formattedLog('PingReply', `Replying to mention from ${message.author.id}`)
		);

		const thinkingMessage = yield* sendThinking().pipe(
			Effect.flatMap((msg) => Effect.sleep('2 seconds').pipe(Effect.as(msg)))
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
			yield* updateMessage(
				thinkingMessage.id,
				'⏱️ Please wait a moment before sending another message.'
			);
			return;
		}

		// Extract the actual message content
		let userInput = message.content;
		userInput = message.content.replace(/<@!?\d+>/g, '').trim();

		if (!userInput || userInput.trim().length === 0) {
			yield* updateMessage(thinkingMessage.id, 'Yes? 🤔');
			return;
		}

		yield* Effect.logDebug(formattedLog('PingReply', `User ${message.author.id}: ${userInput}`));

		// Set cooldown
		setCooldown(message.author.id);

		// Generate response
		const response = yield* createFunResponse(
			userInput,
			message.author.global_name || message.author.username
		);

		yield* Effect.logDebug(formattedLog('PingReply', `Bot: ${response}`));

		// Update the thinking message and send reply
		yield* updateMessage(thinkingMessage.id, response);
	});
