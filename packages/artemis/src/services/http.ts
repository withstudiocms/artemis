import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createNodeMiddleware, Webhooks } from '@octokit/webhooks';
import { and, eq } from 'drizzle-orm';
import { Redacted } from 'effect';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { DatabaseLive } from '../core/db-client.ts';
import { DiscordGatewayLayer } from '../core/discord-gateway.ts';
import { Github } from '../core/github.ts';
import { githubWebhookSecret } from '../static/env.ts';
import { getHtmlFilePath } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import { editPTALEmbed } from '../utils/ptal.ts';

/// --- WEBHOOK UTILS ---

// /**
//  * Handle a Crowdin "pull translation sync" (PTAL) webhook event by notifying registered Discord guild channels.
//  *
//  * This function returns an Effect that, when executed, performs the following steps:
//  * 1. Verifies the incoming `action` is "crowdin-ptal"; no-op otherwise.
//  * 2. Queries the database for any registered crowdinEmbed entries matching the provided repository owner/repo.
//  * 3. If no entries are registered, logs a warning and stops.
//  * 4. Reads `pull_request_url` from the payload; if missing, logs a warning and stops.
//  * 5. Retrieves the bot's current guilds, then for each registered entry:
//  *    - If the bot is not present in the guild, logs a warning and continues.
//  *    - Constructs and sends a Discord embed message with a PTAL notice and a button that links to the pull request (if present)
//  *      or to the repository on GitHub as a fallback.
//  *    - Logs an info message after successfully sending the notification.
//  *
//  * Notes:
//  * - This Effect depends on the DiscordREST and DatabaseLive services from the environment.
//  * - All side effects (DB access, REST calls, logging) occur inside the returned Effect; calling this function is pure.
//  * - Failures of underlying services (network, database, Discord API) will surface as failures of the returned Effect.
//  *
//  * @param action - The webhook action name (expected to be "crowdin-ptal" for processing).
//  * @param repository - Object containing `owner` and `repo` strings identifying the GitHub repository.
//  * @param payload - The parsed webhook payload; may contain a `pull_request_url` string used to link the notification button.
//  * @returns An Effect which, when executed, attempts to send PTAL notifications to all configured guild channels and resolves to void on success.
//  */
// const handleCrowdinSyncPTAL = (
// 	action: string,
// 	repository: { owner: string; repo: string },
// 	payload: {
// 		[k: string]: unknown;
// 	}
// ) =>
// 	Effect.gen(function* () {
// 		const [rest, db] = yield* Effect.all([DiscordREST, DatabaseLive]);

// 		if (action !== 'crowdin-ptal') {
// 			return;
// 		}

// 		const allowList = yield* db.execute((c) =>
// 			c
// 				.select()
// 				.from(db.schema.crowdinEmbed)
// 				.where(
// 					and(
// 						eq(db.schema.crowdinEmbed.owner, repository.owner),
// 						eq(db.schema.crowdinEmbed.repo, repository.repo)
// 					)
// 				)
// 		);

// 		if (allowList.length === 0) {
// 			yield* logger.warn(
// 				`Received crowdin-ptal for unregistered repo ${repository.owner}/${repository.repo}`
// 			);
// 			return;
// 		}

// 		const { pull_request_url } = payload as {
// 			pull_request_url?: string;
// 			[k: string]: unknown;
// 		};

// 		if (!pull_request_url) {
// 			yield* logger.warn(
// 				`No pull_request_url found in payload for ${repository.owner}/${repository.repo}, skipping message`
// 			);
// 			return;
// 		}

// 		const existingGuilds = yield* rest.listMyGuilds();

// 		// Find the matching repos and send messages to their channels
// 		yield* logger.info(`Sending PTAL messages to ${allowList.length} guild(s)...`);

// 		for (const entry of allowList) {
// 			const guild = existingGuilds.find((g) => g.id === entry.guildId);
// 			if (!guild) {
// 				yield* logger.warn(
// 					`Bot is not in guild with ID ${entry.guildId}, cannot send PTAL message`
// 				);
// 				continue;
// 			}

// 			yield* rest.createMessage(entry.channelId, {
// 				embeds: [
// 					new DiscordEmbedBuilder()
// 						.setTitle('📢 Crowdin Pull Translation Sync Alert')
// 						.setDescription(
// 							`New translations are available for **${repository.owner}/${repository.repo}**. Please review and merge them as needed.`
// 						)
// 						.setColor(0x00ff00)
// 						.setTimestamp(new Date())
// 						.build(),
// 				],
// 				components: UI.grid([
// 					[
// 						...(pull_request_url
// 							? [
// 									UI.button({
// 										type: Discord.MessageComponentTypes.BUTTON,
// 										style: Discord.ButtonStyleTypes.LINK,
// 										label: 'View on GitHub',
// 										url: pull_request_url as string | undefined,
// 									}),
// 								]
// 							: [
// 									UI.button({
// 										type: Discord.MessageComponentTypes.BUTTON,
// 										style: Discord.ButtonStyleTypes.LINK,
// 										label: 'View Repository',
// 										url: `https://github.com/${repository.owner}/${repository.repo}`,
// 									}),
// 								]),
// 					],
// 				]),
// 			});

// 			yield* logger.info(
// 				`Sent PTAL message to guild ${guild.name} (${guild.id}) in channel ${entry.channelId}`
// 			);
// 		}
// 	});

const buildServer = async () => {
	const secretKey = await (() =>
		Effect.runPromise(
			Effect.gen(function* () {
				const webhookSecret = yield* githubWebhookSecret;
				return Redacted.value(webhookSecret);
			})
		))();

	const { drizzle: db, schema } = await Effect.runPromise(DatabaseLive);

	const webhooks = new Webhooks({
		secret: secretKey,
	});

	webhooks.onAny(async (event) => {
		if (
			event.name === 'pull_request' ||
			event.name === 'pull_request_review' ||
			event.name === 'pull_request_review_comment'
		) {
			const payload = event.payload;
			const repositoryOwner = payload.repository.owner.login;
			const repository = payload.repository.name;
			const pullRequestNumber = payload.pull_request.number;

			console.log(
				formattedLog('Http', `Received event: ${event.name} for PR #${pullRequestNumber}`)
			);

			const ptals = await db
				.select()
				.from(schema.ptalTable)
				.where(
					and(
						eq(schema.ptalTable.owner, repositoryOwner),
						eq(schema.ptalTable.repository, repository),
						eq(schema.ptalTable.pr, pullRequestNumber)
					)
				);

			if (ptals.length === 0) {
				console.log(
					formattedLog(
						'Http',
						`No PTAL entries found for ${repositoryOwner}/${repository} PR #${pullRequestNumber}`
					)
				);
				return;
			}

			for (const ptal of ptals) {
				console.log(
					formattedLog('Http', `Found PTAL entry: ${ptal.description} for message ${ptal.message}`)
				);

				const ptalDeps = Layer.mergeAll(Github.Default, DiscordGatewayLayer);

				await Effect.runPromise(editPTALEmbed(ptal).pipe(Effect.provide(ptalDeps)));

				console.log(
					formattedLog(
						'Http',
						`Edited PTAL embed for ${ptal.description} in message ${ptal.message}`
					)
				);
			}
		}
	});

	const middleware = createNodeMiddleware(webhooks);

	const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
		const resolved = await middleware(req, res);
		if (resolved) return;

		if (req.url === '/api/health') {
			res.writeHead(200);
			res.end();

			return;
		}

		const routes = [
			{ url: '/', method: 'GET', file: 'index.html' },
			{ url: '/logo.png', method: 'GET', file: 'logo.png' },
			{ url: '/studiocms.png', method: 'GET', file: 'studiocms.png' },
		];

		for (const route of routes) {
			if (req.url === route.url && req.method === route.method) {
				const filePath = getHtmlFilePath(route.file);
				let contentType = 'text/html';
				if (route.file.endsWith('.png')) {
					contentType = 'image/png';
				}
				res.writeHead(200, { 'Content-Type': contentType });
				res.end(await readFile(filePath, route.file.endsWith('.png') ? undefined : 'utf-8'));
				return;
			}
		}

		res.writeHead(404);
		res.end('Not Found');
	});

	return httpServer;
};

export const HTTPServer = await buildServer();
