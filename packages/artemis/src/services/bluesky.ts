import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { BSkyAPIClient } from '../core/bsky.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { formattedLog } from '../utils/log.ts';

/*

Commands:

 - bluesky list
 - bluesky subscribe <account> --top-level true|false --replies true|false --reposts true|false
 - bluesky unsubscribe <account> (autocomplete from tracked accounts for current guild)
 - bluesky settings post-channel <channel>
 - bluesky settings ping-role <role> --enable true|false

Functionalities:

 - List tracked BlueSky accounts in the server
 - Subscribe a channel to a BlueSky account with tracking options
 - Unsubscribe a channel from a BlueSky account
 - View or modify BlueSky tracking settings
 - Polling service to check for new posts from tracked accounts and post them in the designated channels

TODO:
- [x] Setup basic command structure
- [x] Implement list tracked accounts
- [x] Implement subscribe to account
- [x] Implement unsubscribe from account
- [x] Implement settings sub-commands (post channel, ping role)
- [x] Implement view settings
- [x] Add unsubscribe autocomplete
- [ ] Implement polling service for new posts

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

/**
 * Make Autocomplete Response
 */
function makeAutocompleteResponse(
	choices: {
		name: string;
		value: string;
	}[]
) {
	return Ix.response({
		type: Discord.InteractionCallbackTypes.APPLICATION_COMMAND_AUTOCOMPLETE_RESULT,
		data: {
			choices: choices.slice(0, 25), // Discord allows max 25 choices
		},
	});
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

	const initConfig = (guildId: string) =>
		database.execute((db) =>
			db.insert(database.schema.blueSkyConfig).values({
				guild: guildId,
				ping_role_id: '',
				ping_role_enabled: 0,
				post_channel_id: '',
			})
		);

	const getGuildConfig = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyConfig)
				.where(eq(database.schema.blueSkyConfig.guild, guildId))
				.get()
		);

	const setPingRole = (guildId: string, roleId: string | null, enable: boolean | null) =>
		Effect.gen(function* () {
			const currentConfig = yield* getGuildConfig(guildId);

			if (!roleId && enable === null) {
				// Nothing to update
				console.log('No changes provided for ping role settings.');
				return false;
			}

			if (!currentConfig) {
				// No existing config, create new one
				yield* initConfig(guildId);
			}

			const updatedRoleId = roleId !== null ? roleId : currentConfig?.ping_role_id || '';
			const updatedEnable =
				enable !== null ? (enable ? 1 : 0) : currentConfig ? currentConfig.ping_role_enabled : 0;

			// Update existing config
			yield* database.execute((db) =>
				db
					.update(database.schema.blueSkyConfig)
					.set({
						ping_role_id: updatedRoleId,
						ping_role_enabled: updatedEnable,
					})
					.where(eq(database.schema.blueSkyConfig.guild, guildId))
			);

			return true;
		});

	const setPostChannel = (guildId: string, channelId: string) =>
		Effect.gen(function* () {
			const currentConfig = yield* getGuildConfig(guildId);

			if (!currentConfig) {
				// No existing config, create new one
				yield* initConfig(guildId);
			}

			// Update existing config
			yield* database.execute((db) =>
				db
					.update(database.schema.blueSkyConfig)
					.set({
						post_channel_id: channelId,
					})
					.where(eq(database.schema.blueSkyConfig.guild, guildId))
			);

			return true;
		});

	const getTrackedAccountSubscriptions = (guildId: string) =>
		database.execute((db) =>
			db
				.select()
				.from(database.schema.blueSkyChannelSubscriptions)
				.where(eq(database.schema.blueSkyChannelSubscriptions.guild, guildId))
				.all()
		);

	const createNewTrackedAccountSubscription = (
		guildId: string,
		did: string,
		opts: {
			track_top_level: boolean;
			track_replies: boolean;
			track_reposts: boolean;
		}
	) =>
		database
			.execute((db) =>
				db
					.insert(database.schema.blueSkyChannelSubscriptions)
					.values({
						guild: guildId,
						did,
						track_top_level: opts.track_top_level ? 1 : 0,
						track_replies: opts.track_replies ? 1 : 0,
						track_reposts: opts.track_reposts ? 1 : 0,
					})
					.onConflictDoUpdate({
						target: database.schema.blueSkyChannelSubscriptions.did,
						set: {
							track_top_level: opts.track_top_level ? 1 : 0,
							track_replies: opts.track_replies ? 1 : 0,
							track_reposts: opts.track_reposts ? 1 : 0,
						},
					})
			)
			.pipe(
				Effect.flatMap(() =>
					database.execute((db) =>
						db
							.insert(database.schema.blueSkyTrackedAccounts)
							.values({
								did,
								guild: guildId,
								last_checked_at: new Date().toISOString(),
							})
							.onConflictDoUpdate({
								target: database.schema.blueSkyTrackedAccounts.did,
								set: {
									guild: guildId,
								},
							})
					)
				)
			);

	const clearTrackingAccountSubscription = (guildId: string, did: string) =>
		database
			.execute((db) =>
				db
					.delete(database.schema.blueSkyChannelSubscriptions)
					.where(
						and(
							eq(database.schema.blueSkyChannelSubscriptions.guild, guildId),
							eq(database.schema.blueSkyChannelSubscriptions.did, did)
						)
					)
			)
			.pipe(
				Effect.flatMap(() =>
					database.execute((db) =>
						db
							.delete(database.schema.blueSkyTrackedAccounts)
							.where(
								and(
									eq(database.schema.blueSkyTrackedAccounts.guild, guildId),
									eq(database.schema.blueSkyTrackedAccounts.did, did)
								)
							)
					)
				)
			);

	const updateLastChecked = (guildId: string, did: string) =>
		database.execute((db) =>
			db
				.update(database.schema.blueSkyTrackedAccounts)
				.set({ last_checked_at: new Date().toISOString() })
				.where(
					and(
						eq(database.schema.blueSkyTrackedAccounts.guild, guildId),
						eq(database.schema.blueSkyTrackedAccounts.did, did)
					)
				)
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
							autocomplete: true,
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
						{
							name: 'view',
							description: 'View current BlueSky tracking settings',
							type: Discord.ApplicationCommandOptionType.SUB_COMMAND,
							options: [],
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
			if (!guildId)
				return ErrorResponse(
					'Guild-Only Command',
					'The /bluesky command can only be used within a server (guild).'
				);

			// get guild config
			const config = yield* getGuildConfig(guildId);

			// If no config, prompt to set up
			if (!config)
				return ErrorResponse(
					'No BlueSky Configuration Found',
					'Please set up BlueSky tracking settings using the /bluesky settings command.'
				);

			// Handle sub-commands
			return yield* ix.subCommands({
				// ======================
				// main sub-commands
				// ======================
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
					// TODO: Paginate (Somehow?) if too many accounts for a single embed?
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
				subscribe: Effect.gen(function* () {
					const accountOption = ix.optionValue('account');
					const topLevelOption = ix.optionValue('top_level');
					const repliesOption = ix.optionValue('replies');
					const repostsOption = ix.optionValue('reposts');

					// Get BlueSky account details
					const blueskyAccount = yield* Effect.tryPromise({
						try: () => BSky.getBlueskyAccount(accountOption),
						catch: () => new FetchingError(),
					}).pipe(Effect.catchTag('FetchingError', () => Effect.succeed(null)));

					if (!blueskyAccount) {
						return ErrorResponse(
							'Account Not Found',
							'The specified BlueSky account could not be found. Please check the DID or handle and try again.'
						);
					}

					// Create new tracked account subscription
					yield* createNewTrackedAccountSubscription(guildId, blueskyAccount.did, {
						track_top_level: topLevelOption,
						track_replies: repliesOption,
						track_reposts: repostsOption,
					});

					return SuccessResponse(
						'Subscription Created',
						`Now tracking @${blueskyAccount.handle} (${blueskyAccount.did}) with options: [top-level: ${topLevelOption}, replies: ${repliesOption}, reposts: ${repostsOption}]`
					);
				}),
				unsubscribe: Effect.gen(function* () {
					const accountOption = ix.optionValue('account');

					// Get BlueSky account details
					const blueskyAccount = yield* Effect.tryPromise({
						try: () => BSky.getBlueskyAccount(accountOption),
						catch: () => new FetchingError(),
					}).pipe(Effect.catchTag('FetchingError', () => Effect.succeed(null)));

					if (!blueskyAccount) {
						return ErrorResponse(
							'Account Not Found',
							'The specified BlueSky account could not be found. Please check the DID or handle and try again.'
						);
					}

					// Clear tracking account subscription
					yield* clearTrackingAccountSubscription(guildId, blueskyAccount.did);

					return SuccessResponse(
						'Unsubscribed',
						`Stopped tracking @${blueskyAccount.handle} (${blueskyAccount.did}).`
					);
				}),

				// ======================
				// settings sub-commands
				// ======================
				post_channel: Effect.gen(function* () {
					const channelOption = yield* ix.option('channel');
					if (channelOption.type !== Discord.ApplicationCommandOptionType.CHANNEL) {
						return ErrorResponse('Invalid Channel', 'The provided channel is not valid.');
					}
					const channelId = channelOption.value;
					const updated = yield* setPostChannel(guildId, channelId);
					if (!updated) {
						return ErrorResponse(
							'No Changes Made',
							'The post channel was already set to the specified channel.'
						);
					}
					return SuccessResponse(
						'Post Channel Updated',
						`BlueSky updates will now be posted in <#${channelId}>.`
					);
				}),
				ping_role: Effect.gen(function* () {
					const roleOption = yield* ix.option('role');
					const enableOption = yield* ix.option('enable');

					let roleId: string | null = null;
					let enable: boolean | null = null;

					if (roleOption) {
						if (roleOption.type !== Discord.ApplicationCommandOptionType.ROLE) {
							return ErrorResponse('Invalid Role', 'The provided role is not valid.');
						}
						roleId = roleOption.value;
					}

					if (enableOption) {
						if (enableOption.type !== Discord.ApplicationCommandOptionType.BOOLEAN) {
							return ErrorResponse(
								'Invalid Enable Value',
								'The enable value must be true or false.'
							);
						}
						enable = enableOption.value;
					}

					const updated = yield* setPingRole(guildId, roleId, enable);
					if (!updated) {
						return ErrorResponse(
							'No Changes Made',
							'No changes were made to the ping role settings.'
						);
					}

					return SuccessResponse(
						'Ping Role Updated',
						'BlueSky ping role settings have been updated.'
					);
				}),
				view: Effect.gen(function* () {
					const config = yield* getGuildConfig(guildId);
					if (!config)
						return ErrorResponse(
							'No BlueSky Configuration Found',
							'Please set up BlueSky tracking settings using the /bluesky settings command.'
						);

					const postChannelMention = `<#${config.post_channel_id}>`;
					const pingRoleMention = config.ping_role_id ? `<@&${config.ping_role_id}>` : 'None';
					const pingRoleEnabled = numberToBoolean(config.ping_role_enabled) ? 'Yes' : 'No';

					return SuccessResponse(
						'Current BlueSky Settings',
						`- **Post Channel:** ${postChannelMention}\n- **Ping Role:** ${pingRoleMention}\n- **Ping Enabled:** ${pingRoleEnabled}`
					);
				}),
			});
		})
	);

	const unsubscribeAutocomplete = Ix.autocomplete(
		Ix.option('bluesky', 'unsubscribe'),
		Effect.gen(function* () {
			const context = yield* Ix.Interaction;
			const query = String(yield* Ix.focusedOptionValue);

			// biome-ignore lint/style/noNonNullAssertion: allowed here
			const guildId = context.guild_id!;

			const helpfulChoices = yield* getTrackedAccountSubscriptions(guildId).pipe(
				Effect.flatMap((trackedAccounts) =>
					Effect.tryPromise({
						try: () =>
							Promise.all(
								trackedAccounts.map(async (acc) => {
									const did = acc.did;
									const display = await BSky.getBlueskyAccount(did);
									const handle = display ? display.handle : 'unknown';
									return {
										name: `@${handle} (${did})`,
										value: did,
									};
								})
							),
						catch: () => new FetchingError(),
					})
				),
				Effect.catchTag('FetchingError', () => Effect.succeed([]))
			);

			if (query.length > 0) {
				const filtered = helpfulChoices.filter((choice) =>
					choice.name.toLowerCase().includes(query.toLowerCase())
				);
				return makeAutocompleteResponse(filtered);
			}

			return makeAutocompleteResponse(helpfulChoices);
		})
	);

	const ix = Ix.builder
		.add(blueskyCommand)
		.add(unsubscribeAutocomplete)
		.catchAllCause(Effect.logError);

	yield* Effect.all([
		registry.register(ix),
		Effect.logDebug(formattedLog('BlueSky', 'Interactions registered and running.')),
	]);
});

export const BlueSkyLive = Layer.scopedDiscard(make);
