/** biome-ignore-all lint/style/noNonNullAssertion: There should be no question these exist */
import { DiscordREST } from 'dfx/DiscordREST';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix, Perms, UI } from 'dfx/index';
import { Cause, Effect, FiberMap, Layer, pipe } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { Github } from '../core/github.ts';

/**
 * Represents the possible types of issues that can be created or tracked.
 *
 * - `'Bug'`: Indicates a defect or problem in the system.
 * - `'Feature'`: Represents a new feature request or enhancement.
 * - `'Task'`: Denotes a general task or work item.
 */
type PossibleIssueTypes = 'Bug' | 'Feature' | 'Task';

const make = Effect.gen(function* () {
	const rest = yield* DiscordREST;
	const channels = yield* ChannelsCache;
	const registry = yield* InteractionsRegistry;
	const github = yield* Github;
	const fiberMap = yield* FiberMap.make<Discord.Snowflake>();
	const application = yield* DiscordApplication;
	const db = yield* DatabaseLive;

	/**
	 * Creates a new GitHub issue using the wrapped GitHub API client.
	 *
	 * @remarks
	 * This function is a wrapper around the GitHub API's `issues.create` method,
	 * allowing for the creation of issues in a specified repository.
	 *
	 * @param params - The parameters required to create a GitHub issue, such as
	 *   repository owner, repository name, issue title, and body.
	 * @returns A promise that resolves with the response from the GitHub API,
	 *   containing details of the created issue.
	 *
	 * @example
	 * ```typescript
	 * await createGithubIssue({
	 *   owner: 'octocat',
	 *   repo: 'Hello-World',
	 *   title: 'Found a bug',
	 *   body: 'I\'m having a problem with this.'
	 * });
	 * ```
	 */
	const createGithubIssue = github.wrap((_) => _.issues.create);

	const createIssue = Effect.fn('create-issue.create')(function* (
		data: Parameters<typeof createGithubIssue>[0]
	) {
		return yield* createGithubIssue(data);
	});

	const createIssueSubmitFollowup = (
		context: Discord.APIInteraction,
		data: Parameters<typeof createGithubIssue>[0]
	) =>
		pipe(
			createIssue(data),
			Effect.tap((issue) =>
				rest.updateOriginalWebhookMessage(application.id, context.token, {
					payload: {
						embeds: [
							{
								title: '✅ New Issue Created',
								description:
									'This thread is now being tracked in a GitHub issue. Please continue the discussion there using the link below.',
								color: 5763719,
								fields: [
									{
										name: 'Repository',
										value: `${issue.repository?.full_name}`,
										inline: true,
									},
									{
										name: 'Issue Number',
										value: `#${issue.number}`,
										inline: true,
									},
								],
							},
						],
						components: [
							{
								type: Discord.MessageComponentTypes.ACTION_ROW,
								components: [
									{
										type: Discord.MessageComponentTypes.BUTTON,
										style: Discord.ButtonStyleTypes.LINK,
										emoji: { name: 'github', id: '1329780197385441340' },
										label: 'View Issue',
										url: issue.html_url,
									},
								],
							},
						],
					},
				})
			),
			Effect.tapErrorCause(Effect.logError),
			Effect.catchAllCause((cause) =>
				rest
					.updateOriginalWebhookMessage(application.id, context.token, {
						payload: {
							content: `❌ Failed to create issue:\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
						},
					})
					.pipe(
						Effect.zipLeft(Effect.sleep('1 minutes')),
						Effect.zipRight(rest.deleteOriginalWebhookMessage(application.id, context.token, {}))
					)
			),
			Effect.withSpan('create-issue.followup')
		);

	const issueFromMessage = Ix.global(
		{
			type: Discord.ApplicationCommandType.MESSAGE,
			name: 'Create Issue from Message',
			default_member_permissions: 0,
		},
		Effect.gen(function* () {
			const context = yield* Ix.Interaction;

			const hasPermission = Perms.has(Discord.Permissions.ModerateMembers);
			const canExecute = hasPermission(context.member?.permissions!);

			if (!canExecute) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'You do not have permission to use this command.',
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			yield* Effect.logDebug('Registering interaction');

			const rawRepos = yield* db.execute((c) => c.select().from(db.schema.repos));
			const githubRepos = rawRepos.map((r) => ({
				label: r.label,
				owner: r.owner,
				repo: r.repo,
			}));

			const issueTypes: PossibleIssueTypes[] = ['Bug', 'Feature', 'Task'];

			return Ix.response({
				type: Discord.InteractionCallbackTypes.MODAL,
				data: {
					custom_id: 'create-issue-modal',
					title: 'Create GitHub Issue',
					components: [
						// {
						// 	type: 18, // Label Component
						// 	label: 'Repository (owner/repo)',
						// 	component: UI.select({
						// 		custom_id: 'issue-repo',
						// 		options: githubRepos.map((r) => ({
						// 			label: r.label,
						// 			value: `${r.owner}/${r.repo}`,
						// 		})),
						// 		placeholder: 'Select a repository',
						// 		min_values: 1,
						// 		max_values: 1,
						// 		required: true,
						// 	}),
						// },
						// {
						// 	type: 18, // Label Component
						// 	label: 'Issue Type',
						// 	component: UI.select({
						// 		custom_id: 'issue-type',
						// 		options: issueTypes.map((type) => ({
						// 			label: type,
						// 			value: type,
						// 		})),
						// 		placeholder: 'Select issue type',
						// 		min_values: 1,
						// 		max_values: 1,
						// 		required: true,
						// 	}),
						// },
						{
							type: 1, // Action Row
							components: [
								UI.textInput({
									custom_id: 'issue-title',
									label: 'Issue Title',
									style: Discord.TextInputStyleTypes.SHORT,
									required: true,
									min_length: 5,
									max_length: 100,
									placeholder: 'A brief title for the issue',
								}),
								UI.textInput({
									custom_id: 'issue-body',
									label: 'Issue Description',
									style: Discord.TextInputStyleTypes.PARAGRAPH,
									required: false,
									placeholder: 'Detailed description of the issue',
								}),
							],
						},
					],
				},
			});
		})
	);

	const issueFromMessageSubmit = Ix.modalSubmit(
		Ix.id('create-issue-modal'),
		Effect.gen(function* () {
			const context = yield* Ix.Interaction;
			const issueRepo = yield* Ix.modalValue('issue-repo');
			const issueType = yield* Ix.modalValue('issue-type');
			const issueTitle = yield* Ix.modalValue('issue-title');
			const issueBody = yield* Ix.modalValue('issue-body');
			const [owner, repo] = issueRepo.split('/');

			// Fetch the original message content
			const channelId = context.channel?.id;
			const messageId = context.message?.id;
			if (!channelId || !messageId) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'Error: Unable to retrieve the original message.',
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			const channel = yield* channels.get(context.guild?.id!, channelId);

			if (!channel || channel.type !== Discord.ChannelTypes.GUILD_TEXT) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'Error: Invalid channel type.',
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			const originalMessage = yield* rest.getMessage(channel.id, messageId!);

			if (!originalMessage) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'Error: Original message not found.',
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			const data: Parameters<typeof createGithubIssue>[0] = {
				owner,
				repo,
				title: `From Discord: ${issueTitle}`,
				type: issueType,
				labels: ['from: discord', 'triage'],
				body: `**Issue created from Discord message**\n\n**Message Content:**\n${issueBody || originalMessage.content}\n\n**Original Message Link:** [Jump to message](https://discord.com/channels/${context.guild?.id}/${channel.id}/${originalMessage.id})`,
			};

			yield* createIssueSubmitFollowup(context, data).pipe(
				Effect.annotateLogs('repo', repo),
				Effect.annotateLogs('owner', owner),
				Effect.annotateLogs('issueTitle', issueTitle),
				Effect.annotateLogs('issueType', issueType),
				FiberMap.run(fiberMap, context.id)
			);

			// Acknowledge the interaction and inform the user that the issue is being created
			return Ix.response({
				type: Discord.InteractionCallbackTypes.DEFERRED_UPDATE_MESSAGE,
			});
		})
	);

	const ix = Ix.builder
		.add(issueFromMessage)
		.add(issueFromMessageSubmit)
		.catchAllCause(Effect.logError);

	yield* registry.register(ix);
}).pipe(Effect.annotateLogs({ service: 'IssueFromMessageService' }));

export const IssueFromMessageLive = Layer.scopedDiscard(make).pipe(
	Layer.provideMerge(ChannelsCache.Default)
);
