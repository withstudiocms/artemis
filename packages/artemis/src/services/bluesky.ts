import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Effect, Layer } from 'effect';
import { formattedLog } from '../utils/log.ts';

/*

Intended API:

Commands:

 - bluesky list
 - bluesky subscribe <account> --top-level true|false --replies true|false --reposts true|false
 - bluesky unsubscribe <account> (autocomplete from tracked accounts for current guild)
 - bluesky settings post-channel <channel>
 - bluesky settings ping-role <role> --enable true|false

*/

const make = Effect.gen(function* () {
	const [registry] = yield* Effect.all([InteractionsRegistry]);

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
