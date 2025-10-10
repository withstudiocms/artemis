/** biome-ignore-all lint/suspicious/noExplicitAny: Working with a dynamic api */
import type { Api } from '@octokit/plugin-rest-endpoint-methods';
import type { OctokitResponse } from '@octokit/types';
import { Chunk, Config, Data, Effect, Option, pipe, Redacted, Stream } from 'effect';
import { App, type Octokit } from 'octokit';
import { nestedConfigProvider } from '../utils/config.ts';

export class GithubError extends Data.TaggedError('GithubError')<{
	readonly cause: unknown;
}> {}

let app: App | undefined;
let octokit: Octokit | undefined;

async function getOctoApp(config: {
	appId: string;
	privateKey: string;
	installationId: string;
	webhookSecret: string;
}) {
	if (!octokit || !app) {
		app = new App({
			appId: config.appId,
			privateKey: config.privateKey,
			webhooks: {
				secret: config.webhookSecret,
			},
		});

		octokit = await app.getInstallationOctokit(Number.parseInt(config.installationId, 10));
	}

	return octokit;
}

export class Github extends Effect.Service<Github>()('app/Github', {
	effect: Effect.gen(function* () {
		const appId = yield* Config.redacted('APP_ID');
		const installationId = yield* Config.redacted('INSTALLATION_ID');
		const privateKey = yield* Config.redacted('PRIVATE_KEY');
		const webhookSecret = yield* Config.redacted('WEBHOOK_SECRET');

		const octokit = yield* Effect.tryPromise({
			try: () =>
				getOctoApp({
					appId: Redacted.value(appId),
					installationId: Redacted.value(installationId),
					privateKey: Redacted.value(privateKey).replace(/\\n/g, '\n'),
					webhookSecret: Redacted.value(webhookSecret),
				}),
			catch: (cause) => new GithubError({ cause }),
		});

		const rest = octokit.rest;

		const request = <A>(f: (_: Api['rest']) => Promise<A>) =>
			Effect.withSpan(
				Effect.tryPromise({
					try: () => f(rest as any),
					catch: (cause) => new GithubError({ cause }),
				}),
				'Github.request'
			);

		const wrap =
			<A, Args extends Array<any>>(
				f: (_: Api['rest']) => (...args: Args) => Promise<OctokitResponse<A>>
			) =>
			(...args: Args) =>
				Effect.map(
					Effect.tryPromise({
						try: () => f(rest as any)(...args),
						catch: (cause) => new GithubError({ cause }),
					}),
					(_) => _.data
				);

		const stream = <A>(f: (_: Api['rest'], page: number) => Promise<OctokitResponse<Array<A>>>) =>
			Stream.paginateChunkEffect(0, (page) =>
				Effect.map(
					Effect.tryPromise({
						try: () => f(rest as any, page),
						catch: (cause) => new GithubError({ cause }),
					}),
					(_) => [Chunk.unsafeFromArray(_.data), maybeNextPage(page, _.headers.link)]
				)
			);

		return { request, wrap, stream } as const;
	}).pipe(Effect.withConfigProvider(nestedConfigProvider('GITHUB'))),
}) {}

// == helpers

const maybeNextPage = (page: number, linkHeader?: string) =>
	pipe(
		Option.fromNullable(linkHeader),
		Option.filter((_) => _.includes(`rel="next"`)),
		Option.as(page + 1)
	);
