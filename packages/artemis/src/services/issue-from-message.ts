/** biome-ignore-all lint/style/noNonNullAssertion: There should be no question these exist */
import { DiscordREST } from 'dfx/DiscordREST';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix, Perms, UI } from 'dfx/index';
import { eq } from 'drizzle-orm';
import { Cause, Effect, FiberMap, Layer, pipe } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { DatabaseLive } from '../core/db-client.ts';
import { Github } from '../core/github.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const rest = yield* DiscordREST;
	const channels = yield* ChannelsCache;
	const registry = yield* InteractionsRegistry;
	const github = yield* Github;
	const fiberMap = yield* FiberMap.make<Discord.Snowflake>();
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
				rest.createMessage(context.channel?.id!, {
					embeds: [
						{
							title: '✅ New Issue Created',
							description:
								'Issue has been successfully created on GitHub. A maintainer will triage it soon.',
							color: 5763719,
							fields: [
								{
									name: 'Repository',
									value: `${data?.owner}/${data?.repo}`,
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
				})
			),
			Effect.tapErrorCause(Effect.logError),
			Effect.catchAllCause((cause) =>
				rest.createMessage(context.channel?.id!, {
					content: `❌ Failed to create issue:\n\n\`\`\`\n${Cause.pretty(cause)}\n\`\`\``,
					flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
				})
			),
			Effect.withSpan('create-issue.followup')
		);

	const issueFromMessage = Ix.global(
		{
			type: Discord.ApplicationCommandType.MESSAGE,
			name: 'Create Issue from Message',
		},
		Effect.gen(function* () {
			const context = yield* Ix.Interaction;
			const targetId = (context as Discord.APIMessageApplicationCommandInteraction).data.target_id!;

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

			const rawRepos = yield* db.execute((c) =>
				c.select().from(db.schema.repos).where(eq(db.schema.repos.guildId, context.guild!.id))
			);
			const githubRepos = rawRepos.map((r) => ({
				label: r.label,
				owner: r.owner,
				repo: r.repo,
			}));

			const originalMessage = yield* rest.getMessage(context.channel!.id, targetId);

			return Ix.response({
				type: Discord.InteractionCallbackTypes.MODAL,
				data: {
					custom_id: 'create-issue-modal',
					title: 'Create GitHub Issue',
					components: UI.singleColumn([
						UI.textInput({
							custom_id: 'issue-repo',
							label: 'Repository (owner/repo)',
							style: Discord.TextInputStyleTypes.SHORT,
							required: true,
							min_length: 3,
							max_length: 100,
							placeholder:
								githubRepos.length > 0
									? `${githubRepos[0].owner}/${githubRepos[0].repo}`
									: 'owner/repo',
						}),
						UI.textInput({
							custom_id: 'issue-type',
							label: 'Issue Type',
							style: Discord.TextInputStyleTypes.SHORT,
							required: true,
							min_length: 3,
							max_length: 50,
							placeholder: 'Bug, Feature, or Task',
						}),
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
							value:
								originalMessage.content.length <= 4000
									? originalMessage.content
									: originalMessage.content.slice(0, 4000),
						}),
						UI.textInput({
							custom_id: 'original-message-link',
							label: 'Original Message Link (auto-filled)',
							style: Discord.TextInputStyleTypes.SHORT,
							required: false,
							value: `https://discord.com/channels/${context.guild?.id}/${context.channel?.id}/${targetId}`,
						}),
					]),
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
			const originalMessageLink = yield* Ix.modalValue('original-message-link');
			const [owner, repo] = issueRepo.split('/');

			const repoAllowList = yield* db.execute((c) =>
				c.select().from(db.schema.repos).where(eq(db.schema.repos.guildId, context.guild!.id))
			);

			if (repoAllowList.length === 0) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content:
							'Issue creation is not configured for this server. Please contact an administrator.',
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			const isRepoAllowed = repoAllowList.some((r) => r.owner === owner && r.repo === repo);

			if (!isRepoAllowed) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: `The repository \`${owner}/${repo}\` is not authorized for issue creation in this server. Please use one of the following repositories: ${repoAllowList.map((r) => `\`${r.owner}/${r.repo}\``).join(', ')}.`,
						flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
					},
				});
			}

			const channelId = context.channel?.id;
			if (!channelId) {
				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'Error: Unable to retrieve the original channel.',
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

			const data: Parameters<typeof createGithubIssue>[0] = {
				owner,
				repo,
				title: `From Discord: ${issueTitle}`,
				type: issueType,
				labels: ['from: discord', 'triage'],
				body: `**Issue created from Discord message**\n\n**Message Content:**\n${issueBody}\n\n**Original Message Link:** [Jump to message](${originalMessageLink})`,
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
				type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
				data: {
					content:
						'Creating issue... You will receive a follow-up message once the issue has been created.',
					flags: Discord.MessageFlags.Ephemeral, // Ephemeral message
				},
			});
		})
	);

	const ix = Ix.builder
		.add(issueFromMessage)
		.add(issueFromMessageSubmit)
		.catchAllCause(Effect.logError);

	yield* registry.register(ix);
	yield* Effect.logInfo(formattedLog('IssueFromMessage', 'Interactions registered and running'));
}).pipe(Effect.annotateLogs({ service: 'IssueFromMessageService' }));

export const IssueFromMessageLive = Layer.scopedDiscard(make).pipe(
	Layer.provide(ChannelsCache.Default)
);
