import { createServer } from 'node:http';
import { HttpServerRequest } from '@effect/platform';
import * as HttpLayerRouter from '@effect/platform/HttpLayerRouter';
import * as HttpServerResponse from '@effect/platform/HttpServerResponse';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import type { EventPayloadMap, WebhookEvent, WebhookEvents } from '@octokit/webhooks-types';
import { DiscordREST } from 'dfx/DiscordREST';
import { Discord, UI } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Cause } from 'effect';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { DatabaseLive } from '../core/db-client.ts';
import { ptalTable } from '../core/db-schema.ts';
import { Github } from '../core/github.ts';
import { httpHost, httpPort } from '../static/env.ts';
import { DiscordEmbedBuilder } from '../utils/embed-builder.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import { editPTALEmbed } from '../utils/ptal.ts';

/// --- UTILITIES ---

/**
 * Logger utility for the HTTP service
 */
const logger = {
	info: (msg: string) => Effect.log(formattedLog('Http', msg)),
	error: (msg: string) => Effect.logError(formattedLog('Http', msg)),
	warn: (msg: string) => Effect.logWarning(formattedLog('Http', msg)),
	debug: (msg: string) => Effect.logDebug(formattedLog('Http', msg)),
};

/**
 * Extracts and parses the GitHub event type from the request headers.
 *
 * @param req - The incoming HTTP server request containing headers.
 * @returns The GitHub event type as a value from `WebhookEvents`, or `undefined` if the header is missing.
 */
const parseGithubEvent = (req: HttpServerRequest.HttpServerRequest) => {
	const event = req.headers['x-github-event'];
	if (!event) return undefined;
	return event as WebhookEvents[number];
};

/// --- WEBHOOK UTILS ---

/**
 * Handle a Crowdin "pull translation sync" (PTAL) webhook event by notifying registered Discord guild channels.
 *
 * This function returns an Effect that, when executed, performs the following steps:
 * 1. Verifies the incoming `action` is "crowdin-ptal"; no-op otherwise.
 * 2. Queries the database for any registered crowdinEmbed entries matching the provided repository owner/repo.
 * 3. If no entries are registered, logs a warning and stops.
 * 4. Reads `pull_request_url` from the payload; if missing, logs a warning and stops.
 * 5. Retrieves the bot's current guilds, then for each registered entry:
 *    - If the bot is not present in the guild, logs a warning and continues.
 *    - Constructs and sends a Discord embed message with a PTAL notice and a button that links to the pull request (if present)
 *      or to the repository on GitHub as a fallback.
 *    - Logs an info message after successfully sending the notification.
 *
 * Notes:
 * - This Effect depends on the DiscordREST and DatabaseLive services from the environment.
 * - All side effects (DB access, REST calls, logging) occur inside the returned Effect; calling this function is pure.
 * - Failures of underlying services (network, database, Discord API) will surface as failures of the returned Effect.
 *
 * @param action - The webhook action name (expected to be "crowdin-ptal" for processing).
 * @param repository - Object containing `owner` and `repo` strings identifying the GitHub repository.
 * @param payload - The parsed webhook payload; may contain a `pull_request_url` string used to link the notification button.
 * @returns An Effect which, when executed, attempts to send PTAL notifications to all configured guild channels and resolves to void on success.
 */
const handleCrowdinSyncPTAL = (
	action: string,
	repository: { owner: string; repo: string },
	payload: {
		[k: string]: unknown;
	}
) =>
	Effect.gen(function* () {
		const [rest, db] = yield* Effect.all([DiscordREST, DatabaseLive]);

		if (action !== 'crowdin-ptal') {
			return;
		}

		const allowList = yield* db.execute((c) =>
			c
				.select()
				.from(db.schema.crowdinEmbed)
				.where(
					and(
						eq(db.schema.crowdinEmbed.owner, repository.owner),
						eq(db.schema.crowdinEmbed.repo, repository.repo)
					)
				)
		);

		if (allowList.length === 0) {
			yield* logger.warn(
				`Received crowdin-ptal for unregistered repo ${repository.owner}/${repository.repo}`
			);
			return;
		}

		const { pull_request_url } = payload as {
			pull_request_url?: string;
			[k: string]: unknown;
		};

		if (!pull_request_url) {
			yield* logger.warn(
				`No pull_request_url found in payload for ${repository.owner}/${repository.repo}, skipping message`
			);
			return;
		}

		const existingGuilds = yield* rest.listMyGuilds();

		// Find the matching repos and send messages to their channels
		yield* logger.info(`Sending PTAL messages to ${allowList.length} guild(s)...`);

		for (const entry of allowList) {
			const guild = existingGuilds.find((g) => g.id === entry.guildId);
			if (!guild) {
				yield* logger.warn(
					`Bot is not in guild with ID ${entry.guildId}, cannot send PTAL message`
				);
				continue;
			}

			yield* rest.createMessage(entry.channelId, {
				embeds: [
					new DiscordEmbedBuilder()
						.setTitle('📢 Crowdin Pull Translation Sync Alert')
						.setDescription(
							`New translations are available for **${repository.owner}/${repository.repo}**. Please review and merge them as needed.`
						)
						.setColor(0x00ff00)
						.setTimestamp(new Date())
						.build(),
				],
				components: UI.grid([
					[
						...(pull_request_url
							? [
									UI.button({
										type: Discord.MessageComponentTypes.BUTTON,
										style: Discord.ButtonStyleTypes.LINK,
										label: 'View on GitHub',
										url: pull_request_url as string | undefined,
									}),
								]
							: [
									UI.button({
										type: Discord.MessageComponentTypes.BUTTON,
										style: Discord.ButtonStyleTypes.LINK,
										label: 'View Repository',
										url: `https://github.com/${repository.owner}/${repository.repo}`,
									}),
								]),
					],
				]),
			});

			yield* logger.info(
				`Sent PTAL message to guild ${guild.name} (${guild.id}) in channel ${entry.channelId}`
			);
		}
	});

/// --- WEBHOOK HANDLERS ---

/**
 * Handles incoming GitHub webhook events by logging the event type and processing
 * specific event payloads as needed.
 *
 * @param event - The type of the GitHub webhook event received.
 * @param body - The payload of the webhook event, typed according to the event.
 * @yields Logs information about the received event and processes supported event types.
 * @remarks
 *   - Currently supports handling of the 'push' event type.
 *   - Logs unhandled event types for future extension.
 */
const handleGitHubWebhookEvent = Effect.fn('handleGitHubWebhookEvent')(function* (
	event: WebhookEvents[number],
	body: WebhookEvent
) {
	// Setup database connection
	const db = yield* DatabaseLive;
	yield* logger.debug(`Received GitHub webhook event: ${event} - processing...`);
	// Handle different GitHub webhook events here
	switch (event) {
		case 'push': {
			// Handle push event
			const payload = body as EventPayloadMap[typeof event];
			yield* logger.debug(
				`Received a push event for ${payload.repository.full_name}/${payload.ref}`
			);
			return;
		}
		case 'pull_request':
		case 'pull_request_review':
		case 'pull_request_review_comment': {
			const payload = body as EventPayloadMap[typeof event];
			const pOwner = payload.repository.owner.login;
			const pRepo = payload.repository.name;
			const pNumber = payload.pull_request.number;

			// --- DEBUG LOGGING ---

			yield* logger.debug(
				`Received pull request event: #${payload.pull_request.number} ${payload.pull_request.title} (${payload.action})`
			);
			yield* logger.debug(`Repository: ${pOwner}/${pRepo}`);
			yield* logger.debug(`Sender: ${payload.sender.login}`);

			// --- EVENT HANDLING ---

			yield* logger.debug(`Handling pull request change for ${pOwner}/${pRepo} PR #${pNumber}...`);

			const data = yield* db.execute((c) => c.select().from(ptalTable));

			// If no entries found, exit early
			if (!data) {
				yield* logger.debug('No PTAL entries found, skipping...');
				return;
			}

			// get the specific entries for this PR number
			const prData = data.filter(
				(entry) => entry.pr === pNumber && entry.owner === pOwner && entry.repository === pRepo
			);

			if (prData.length === 0) {
				yield* logger.debug(
					`No PTAL entries found for ${pOwner}/${pRepo} PR #${pNumber}, skipping...`
				);
				return;
			}

			// Log the number of entries found
			yield* logger.debug(
				`Found ${prData.length} PTAL message(s) to edit for ${pOwner}/${pRepo} PR #${pNumber}.`
			);

			// Edit each PTAL message found

			yield* Effect.all([
				logger.debug('Editing PTAL message(s)...'),
				Effect.forEach(prData, (entry) =>
					editPTALEmbed(entry).pipe(
						Effect.catchAllCause((cause) =>
							logger.error(
								`Failed to edit PTAL message for channel ${entry.channel}, message ${entry.message}: ${Cause.pretty(cause)}`
							)
						)
					)
				),
				logger.debug(`Completed editing PTAL messages for PR #${pNumber}.`),
			]);

			return;
		}
		// @ts-expect-error - repository_dispatch is a valid event type but missing from the types
		case 'repository_dispatch': {
			const payload = body as EventPayloadMap['repository_dispatch'];

			// --- PARSING ---

			// Get the action, defaulting to 'none' if not provided
			const action = payload.action || 'none';
			const repository = { owner: payload.repository.owner.login, repo: payload.repository.name };
			const client_payload = payload.client_payload
				? JSON.stringify(payload.client_payload)
				: 'No client_payload provided';

			// --- DEBUG LOGGING ---

			yield* logger.debug(`Action: ${action}`);
			yield* logger.debug(`Repository: ${repository.owner}/${repository.repo}`);
			yield* logger.debug(`Client Payload: ${client_payload}`);

			// --- EVENT HANDLING ---

			// Handle crowdin-ptal action
			if (action !== 'crowdin-ptal') {
				return yield* handleCrowdinSyncPTAL(action, repository, payload.client_payload);
			}
			return;
		}
		default: {
			yield* logger.debug(`Unhandled event type: ${event}`);
			// Do not delete the following line; it may be useful for future debugging or feature implementation
			// yield* logger.debug(`Payload: ${JSON.stringify(body, null, 2)}`);
			return;
		}
	}
});

/// --- ROUTES ---

/**
 * Registers routes for serving static files such as the homepage and logo.
 *
 * - The root path `/` serves the `index.html` file.
 * - The `/logo.png` path serves the `logo.png` file.
 * - Any other path responds with a `404 Not Found` message.
 *
 * @remarks
 * Utilizes the `getHtmlFilePath` utility to resolve file paths.
 *
 * @see HttpLayerRouter.addAll
 * @see HttpServerResponse.file
 */
const wwwRoutes = HttpLayerRouter.addAll([
	HttpLayerRouter.route('GET', '/', HttpServerResponse.file(getHtmlFilePath('index.html'))),
	HttpLayerRouter.route('GET', '/logo.png', HttpServerResponse.file(getHtmlFilePath('logo.png'))),
	HttpLayerRouter.route(
		'GET',
		'/studiocms.png',
		HttpServerResponse.file(getHtmlFilePath('studiocms.png'))
	),
	// 404 for everything else
	HttpLayerRouter.route('*', '*', HttpServerResponse.text('Not Found', { status: 404 })),
]);

/**
 * Registers a health check route at `/api/health` using the HTTP GET method.
 *
 * This route responds with a plain text message `"running"` and an HTTP status code of 200,
 * indicating that the server is operational.
 *
 * @remarks
 * Useful for monitoring and automated health checks to verify server availability.
 *
 * @see HttpLayerRouter.add
 * @see HttpServerResponse.text
 */
const HealthCheckRoute = HttpLayerRouter.add(
	'GET',
	'/api/health',
	HttpServerResponse.text('running', { status: 200 })
);

/**
 * Registers the GitHub webhook HTTP POST route at `/api/github/webhook`.
 *
 * This route:
 * - Extracts the GitHub signature and event type from the request headers.
 * - Parses the request body as a `WebhookEvent`.
 * - Validates the presence of the signature and event type.
 * - Verifies the webhook signature using the GitHub webhooks utility.
 * - Responds with `401 Unauthorized` if the signature is invalid.
 * - Processes the webhook event asynchronously if the signature is valid.
 * - Responds immediately with `202 Accepted` upon successful validation.
 *
 * @remarks
 * The webhook event is processed asynchronously to avoid blocking the HTTP response.
 * Logging is performed for invalid signature attempts.
 *
 * @see handleWebhookEvent
 * @see github.webhooks.verify
 */
const GithubWebhookRoute = HttpLayerRouter.add(
	'POST',
	'/api/github/webhook',
	Effect.gen(function* () {
		// Extract request data
		const [github, req] = yield* Effect.all([Github, HttpServerRequest.HttpServerRequest]);

		// Get signature and event type from headers
		const signature = req.headers['x-hub-signature-256'] || undefined;
		const event = parseGithubEvent(req);

		// Validate signature and event presence
		if (!signature || !event) {
			return yield* HttpServerResponse.text('Bad Request', { status: 400 });
		}

		// Parse the request body as JSON
		const body = (yield* req.json) as WebhookEvent;

		// Verify the webhook signature
		const isValid = yield* Effect.tryPromise(() =>
			github.webhooks.verify(JSON.stringify(body), signature)
		);

		// If signature is invalid, respond with 401 Unauthorized
		if (!isValid) {
			yield* logger.warn(`Received invalid GitHub webhook event: ${event} - signature mismatch`);
			return yield* HttpServerResponse.text('Unauthorized', { status: 401 });
		}

		// Process the webhook event asynchronously
		yield* handleGitHubWebhookEvent(event, body).pipe(Effect.forkScoped);

		// Respond with 202 Accepted
		return yield* HttpServerResponse.text('Accepted', { status: 202 });
	})
);

/// --- LAYER ---

/**
 * Merges multiple route definitions into a single route configuration.
 */
const AllRoutes = Layer.mergeAll(wwwRoutes, HealthCheckRoute, GithubWebhookRoute);

/// --- SERVER ---

/**
 * Initializes and configures the HTTP server using effectful computations.
 *
 * This generator function performs the following steps:
 * - Reads the HTTP server configuration (port and host) from environment variables,
 *   providing default values if not set.
 * - Logs the start of the HTTP server configuration process.
 * - Sets up the HTTP router layer with logging options disabled.
 * - Sets up the HTTP server layer using the specified host and port.
 * - Launches the server by providing the router to the server layer and forking the effect in a scoped manner.
 *
 * @remarks
 * This function leverages the Effect, Config, Layer, and logger utilities to compose and launch the HTTP server.
 *
 * @returns An effect that, when executed, starts the HTTP server with the configured settings.
 */
const make = Effect.gen(function* () {
	const [port, host] = yield* Effect.all([
		httpPort,
		httpHost,
		logger.debug('Configuring HTTP server...'),
	]);

	// Setup router layer
	const router = HttpLayerRouter.serve(AllRoutes, {
		disableListenLog: true,
		disableLogger: true,
	}).pipe(withLogAddress);

	// Setup server layer
	const serverLayer = NodeHttpServer.layer(createServer, { port, host });

	// Build the server instance
	const server = Layer.provide(router, serverLayer).pipe(Layer.launch);

	// Launch the server
	yield* Effect.forkScoped(server);
});

/**
 * A live Layer instance for the HTTP server, created by invoking the `make` function.
 *
 * This layer is scoped and will be automatically discarded when no longer needed.
 * Use this to provide the HTTP server implementation in your application's environment.
 */
export const HTTPServerLive = Layer.scopedDiscard(make);
