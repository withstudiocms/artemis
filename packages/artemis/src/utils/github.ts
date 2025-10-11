import type { Discord } from 'dfx/index';

interface DiscordMessage {
	author: {
		username: string;
	};
	content: string;
	timestamp?: Date;
}

interface SummaryOptions {
	includeTimestamps?: boolean;
	includeParticipants?: boolean;
	title?: string;
}

/**
 * Converts Discord messages to a formatted GitHub issue summary
 * @param messages - Array of Discord messages
 * @param options - Formatting options
 * @returns Markdown-formatted string for GitHub
 */
export function createGitHubSummary(
	messages: DiscordMessage[],
	channel: Discord.ThreadResponse,
	options: SummaryOptions = {}
): string {
	const {
		includeTimestamps = true,
		includeParticipants = true,
		title = 'Discord Discussion Summary',
	} = options;

	if (messages.length === 0) {
		return '## No messages to summarize';
	}

	let markdown = `## ${title}\n\n`;

	// Add participants list
	if (includeParticipants) {
		const participants = [...new Set(messages.map((msg) => msg.author.username))];
		markdown += `**Participants:** ${participants.map((p) => `@${p}`).join(', ')}\n\n`;
	}

	markdown += '---\n\n';
	markdown += '### Conversation\n\n';

	// Format each message
	messages.forEach((msg) => {
		markdown += `**@${msg.author.username}**`;

		if (includeTimestamps && msg.timestamp) {
			const formattedTime = msg.timestamp.toLocaleString();
			markdown += ` _(${formattedTime})_`;
		}

		markdown += `:\n> ${msg.content.replace(/\n/g, '\n> ')}\n\n`;
	});

	markdown += '---\n\n';
	markdown += `_Extracted from Discord conversation: https://discord.com/channels/${channel.guild_id}/${channel.id}_\n';`;

	return markdown;
}

/**
 * Parses raw Discord bot output into message objects
 * @param rawOutput - Raw text in format "@username: message"
 * @returns Array of DiscordMessage objects
 */
export function parseDiscordBotOutput(rawOutput: string): DiscordMessage[] {
	const lines = rawOutput.trim().split('\n');
	const messages: DiscordMessage[] = [];
	let currentMessage: DiscordMessage | null = null;

	for (const line of lines) {
		// Match format: @username: message
		const match = line.match(/^@([^:]+):\s*(.*)$/);

		if (match) {
			// Save previous message if exists
			if (currentMessage) {
				messages.push(currentMessage);
			}

			// Start new message
			currentMessage = {
				author: {
					username: match[1].trim(),
				},
				content: match[2].trim(),
			};
		} else if (currentMessage && line.trim()) {
			// Continue multi-line message
			currentMessage.content += `\n${line.trim()}`;
		}
	}

	// Don't forget the last message
	if (currentMessage) {
		messages.push(currentMessage);
	}

	return messages;
}

// // Example usage:
// const exampleRawOutput = `@user1: Hey, I found a bug in the login system
// @user2: What's happening exactly?
// @user1: When I try to login with special characters in the password, it fails
// The error appears immediately
// @user3: I can reproduce this. Looks like we're not handling URL encoding properly`;

// const messages = parseDiscordBotOutput(exampleRawOutput);
// const summary = createGitHubSummary(messages, {
// 	includeTimestamps: false,
// 	title: 'Bug Report: Login System Issue',
// });

// console.log(summary);
