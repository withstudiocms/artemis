import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { BSkyAPIClient } from '../core/bsky.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';

/*

Intended API:

Commands:

 - bluesky list
 - bluesky subscribe <account> --top-level true|false --replies true|false --reposts true|false
 - bluesky unsubscribe <account> (autocomplete from tracked accounts for current guild)
 - bluesky settings post-channel <channel>
 - bluesky settings ping-role <role> --enable true|false

TODO:

 - [ ] Implement command handlers to manage BlueSky subscriptions and settings.
 - [ ] Implement complete logic for tracking BlueSky accounts and posting updates to Discord channels.
 - [ ] Implement periodic checks for new BlueSky posts from tracked accounts.

*/

/**
 * Helper function to create an error embed message.
 */
const makeErrorEmbed = (title: string, description: string) =>
	new DiscordEmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(0xff0000)
		.setTimestamp(new Date())
		.build();

/**
 * Helper function to create a success embed message.
 */
const makeSuccessEmbed = (title: string, description: string) =>
	new DiscordEmbedBuilder()
		.setTitle(title)
		.setDescription(description)
		.setColor(0x00ff00)
		.setTimestamp(new Date())
		.build();

/**
 * Error Response
 */
const ErrorResponse = (title: string, description: string) =>
	Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			embeds: [makeErrorEmbed(title, description)],
			flags: Discord.MessageFlags.Ephemeral,
		},
	});

/**
 * Success Response
 */
const SuccessResponse = (title: string, description: string) =>
	Ix.response({
		type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
		data: {
			embeds: [makeSuccessEmbed(title, description)],
			flags: Discord.MessageFlags.Ephemeral,
		},
	});

/**
 * Convert number to boolean
 */
function numberToBoolean(num: number): boolean {
	return num !== 0;
}

// Custom Effect Error Types

/**
 * Error when no tracked accounts are found
 */
class NoTrackedAccounts {
	readonly _tag = 'NoTrackedAccounts';
}

/**
 * Error when fetching BlueSky account details fails
 */
class FetchingError {
	readonly _tag = 'FetchingError';
}

const make = Effect.gen(function* () {
	const [registry, database] = yield* Effect.all([InteractionsRegistry, DatabaseLive]);

	const BSky = new BSkyAPIClient({ serviceUrl: 'https://bsky.social' });

	const getGuildConfig = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyConfig)
				.where(eq(database.schema.blueSkyConfig.guild, guildId))
				.get()
		);

	const getTrackedAccountSubscriptions = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyChannelSubscriptions)
				.where(eq(database.schema.blueSkyChannelSubscriptions.guild, guildId))
				.all()
		);

	const blueskyCommand = Ix.global(
		{
			name: 'bluesky',
			description: 'Allow management of BlueSky subscriptions and settings',
			default_member_permissions: 0,
			options: [
				{
					name: 'list',
					description: 'List BlueSky accounts tracked in this server',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [],
				},
				{
					name: 'subscribe',
					description: 'Subscribe a channel to a BlueSky account',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [
						{
							name: 'account',
							description: 'The DID or account of the BlueSky account to track',
							type: Discord.ApplicationCommandOptionType.STRING,
							required: true,
						},
						{
							name: 'top_level',
							description: 'Track top-level posts',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
						{
							name: 'replies',
							description: 'Track replies',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
						{
							name: 'reposts',
							description: 'Track reposts',
							type: Discord.ApplicationCommandOptionType.BOOLEAN,
							required: true,
						},
					],
				},
				{
					name: 'unsubscribe',
					description: 'Unsubscribe a channel from a BlueSky account',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
					options: [
						{
							name: 'account',
							description: 'The DID or account of the BlueSky account to stop tracking',
							type: Discord.ApplicationCommandOptionType.STRING,
							required: true,
						},
					],
				},
				{
					name: 'settings',
					description: 'View or modify BlueSky tracking settings',
					type: Discord.ApplicationCommandOptionType.SUB_COMMAND_GROUP,
					options: [
						{
							name: 'post_channel',
							description: 'The channel to post BlueSky updates in',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [
								{
									name: 'channel',
									description: 'The channel to post updates in',
									type: Discord.ApplicationCommandOptionType.CHANNEL,
									required: true,
								},
							],
						},
						{
							name: 'ping_role',
							description: 'The role to ping for BlueSky updates',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [
								{
									name: 'role',
									description: 'The role to ping',
									type: Discord.ApplicationCommandOptionType.ROLE,
									required: false,
								},
								{
									name: 'enable',
									description: 'Whether to enable or disable pinging this role',
									type: Discord.ApplicationCommandOptionType.BOOLEAN,
									required: false,
								},
							],
						},
					],
				},
			],
		},
		Effect.fn(function* (ix) {
			// Check if the guild has a BlueSky configuration
			const context = yield* Ix.Interaction;

			// get guild ID
			const guildId = context.guild_id;

			// Ensure this command is used within a guild
			if (!guildId) {
				return ErrorResponse(
					'Guild-Only Command',
					'The /bluesky command can only be used within a server (guild).'
				);
			}

			// get guild config
			const config = yield* getGuildConfig(guildId);

			// If no config, prompt to set up
			if (!config)
				return ErrorResponse(
					'No BlueSky Configuration Found',
					'Please set up BlueSky tracking settings using the /bluesky settings command.'
				);

			// Placeholder response for unimplemented commands
			const placeholderResponse = Effect.succeed(
				ErrorResponse('Not Implemented', 'This command is not yet implemented.')
			);

			return yield* ix.subCommands({
				// Main sub-commands
				list: getTrackedAccountSubscriptions(guildId).pipe(
					Effect.flatMap((accounts) =>
						accounts.length === 0 ? Effect.fail(new NoTrackedAccounts()) : Effect.succeed(accounts)
					),
					Effect.flatMap((accounts) =>
						Effect.tryPromise({
							try: () =>
								Promise.all(
									accounts.map(async (acc) => {
										const did = acc.did;
										const profile = await BSky.getBlueskyAccount(did);
										const handle = profile ? profile.handle : 'unknown';
										return `- @${handle} (${did}) [top-level: ${numberToBoolean(acc.track_top_level)}, replies: ${numberToBoolean(acc.track_replies)}, reposts: ${numberToBoolean(acc.track_reposts)}]`;
									})
								),
							catch: () => new FetchingError(),
						})
					),
					Effect.map((formattedAccountList) =>
						SuccessResponse('Currently Followed BlueSky Accounts', formattedAccountList.join('\n'))
					),
					Effect.catchTag('NoTrackedAccounts', () =>
						Effect.succeed(
							SuccessResponse(
								'No Tracked BlueSky Accounts',
								'There are currently no BlueSky accounts being tracked in this server.'
							)
						)
					),
					Effect.catchTag('FetchingError', () =>
						Effect.succeed(
							ErrorResponse(
								'Error Fetching Accounts',
								'There was an error fetching the BlueSky account details. Please try again later.'
							)
						)
					)
				),
				subscribe: placeholderResponse,
				unsubscribe: placeholderResponse,

				// Settings sub-commands
				post_channel: placeholderResponse,
				ping_role: placeholderResponse,
			});
		})
	);

	const ix = Ix.builder.add(blueskyCommand).catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('BlueSky', 'Interactions registered and running.')),
	]);
});

export const BlueSkyLive = Layer.scopedDiscard(make);
