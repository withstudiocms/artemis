/** biome-ignore-all lint/style/noNonNullAssertion: There should be no question these exist */
import { DiscordREST } from 'dfx/DiscordREST';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix } from 'dfx/index';
import { Cause, Chunk, Data, Effect, FiberMap, Layer, pipe, Stream } from 'effect';
import { ChannelsCache } from '../core/channels-cache.ts';
import { DiscordApplication } from '../core/discord-rest.ts';
import { Github } from '../core/github.ts';
import { Messages } from '../core/messages.ts';
import { createGitHubSummary, parseDiscordBotOutput } from '../utils/github.ts';

// biome-ignore lint/complexity/noBannedTypes: acceptable
export class NotInThreadError extends Data.TaggedError('NotInThreadError')<{}> {}

const githubRepos = [
	{ label: '/studiocms', owner: 'withstudiocms', repo: 'studiocms' },
	{ label: '/studiocms.dev', owner: 'withstudiocms', repo: 'studiocms.dev' },
	{ label: '/docs', owner: 'withstudiocms', repo: 'docs' },
	{ label: '/ui', owner: 'withstudiocms', repo: 'ui' },
	{ label: '/artemis', owner: 'withstudiocms', repo: 'artemis' },
];

type GithubRepo = (typeof githubRepos)[number];

const make = Effect.gen(function* () {
	const rest = yield* DiscordREST;
	const channels = yield* ChannelsCache;
	const messages = yield* Messages;
	const registry = yield* InteractionsRegistry;
	const github = yield* Github;
	const fiberMap = yield* FiberMap.make<Discord.Snowflake>();

	const createGithubIssue = github.wrap((_) => _.issues.create);

	const application = yield* DiscordApplication;

	const createIssue = Effect.fn('issue.createIssue')(function* (
		channel: Discord.ThreadResponse,
		repo: GithubRepo,
		title: string | undefined
	) {
		const channelName = channel.name;
		const chunk = yield* Stream.runCollect(messages.cleanForChannel(channel));
		const body = chunk.pipe(
			Chunk.reverse,
			Chunk.map((msg) => `@${msg.author.username}: ${msg.content}`),
			Chunk.join('\n')
		);

		const issueBodyRaw = parseDiscordBotOutput(body);
		const issueBody = createGitHubSummary(issueBodyRaw, channel, { includeTimestamps: false });

		return yield* createGithubIssue({
			owner: repo.owner,
			repo: repo.repo,
			title: title ? `From Discord: ${title}` : `From Discord: ${channelName}`,
			body: issueBody,
			labels: ['from: discord', 'triage'],
		});
	});

	const followup = (
		context: Discord.APIInteraction,
		channel: Discord.ThreadResponse,
		repo: GithubRepo,
		title: string | undefined
	) =>
		pipe(
			createIssue(channel, repo, title),
			Effect.tap((issue) =>
				rest.updateOriginalWebhookMessage(application.id, context.token, {
					payload: {
						embeds: [
							{
								title: `✅ New Issue Created: #${issue.number} ${issue.title} (${channel.name})`,
								description:
									'This thread is now being tracked in a GitHub issue. Please continue the discussion there using the link below.',
								color: 5763719,
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
			Effect.withSpan('issue.followup')
		);

	const issueCommand = Ix.global(
		{
			name: 'issue',
			description: 'Create a GitHub issue from this thread',
			options: [
				{
					type: Discord.ApplicationCommandOptionType.NUMBER,
					name: 'repository',
					description: 'The repository to create the issue in',
					required: true,
					choices: githubRepos.map((repo, value) => ({
						name: repo.label,
						value,
					})),
				},
				{
					type: Discord.ApplicationCommandOptionType.STRING,
					name: 'title',
					description: 'The title of the issue (optional)',
					required: false,
				},
			],
		},
		Effect.fn('issue.command')(
			function* (ix) {
				const context = yield* Ix.Interaction;
				const repoIndex = ix.optionValue('repository');
				const repo = githubRepos[repoIndex as number];
				yield* Effect.annotateCurrentSpan({ repo: repo.label });

				const channel = yield* channels.get(context.guild_id!, context.channel?.id!);
				if (channel.type !== Discord.ChannelTypes.PUBLIC_THREAD) {
					return yield* new NotInThreadError();
				}

				const title = ix.optionValueOrElse('title', () => undefined);

				yield* followup(context, channel, repo, title).pipe(
					Effect.annotateLogs('repo', repo.label),
					Effect.annotateLogs('thread', channel.id),
					FiberMap.run(fiberMap, context.id)
				);

				return Ix.response({
					type: Discord.InteractionCallbackTypes.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
				});
			},
			Effect.annotateLogs('command', 'issue')
		)
	);

	const ix = Ix.builder
		.add(issueCommand)
		.catchTagRespond('NotInThreadError', () =>
			Effect.succeed(
				Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: 'This command can only be used in a thread',
						flags: Discord.MessageFlags.Ephemeral,
					},
				})
			)
		)
		.catchAllCause(Effect.logError);

	yield* registry.register(ix);
});

export const IssueLive = Layer.scopedDiscard(make).pipe(
	Layer.provide(ChannelsCache.Default),
	Layer.provide(Github.Default),
	Layer.provide(Messages.Default)
);
