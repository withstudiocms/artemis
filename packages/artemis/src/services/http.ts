import { createServer } from 'node:http';
import { HttpServerRequest } from '@effect/platform';
import * as HttpLayerRouter from '@effect/platform/HttpLayerRouter';
import * as HttpServerResponse from '@effect/platform/HttpServerResponse';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import type { EventPayloadMap, WebhookEvent, WebhookEvents } from '@octokit/webhooks-types';
import { DiscordREST } from 'dfx/DiscordREST';
import { Discord } from 'dfx/index';
import { and, eq } from 'drizzle-orm';
import { Config, ConfigProvider } from 'effect';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { DatabaseLive } from '../core/db-client.ts';
import { Github } from '../core/github.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';

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

/// --- WEBHOOKS ---

const handleCrowdinSyncPTAL = (
	action: string,
	repository: { owner: string; repo: string },
	payload: {
		[k: string]: unknown;
	}
) =>
	Effect.gen(function* () {
		const rest = yield* DiscordREST;
		const db = yield* DatabaseLive;

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

			const { pull_request_url } = payload as {
				pull_request_url?: string;
				[k: string]: unknown;
			};

			yield* rest.createMessage(entry.channelId, {
				embeds: [
					{
						title: '📢 Crowdin Pull Translation Sync Alert',
						description: `New translations are available for **${repository.owner}/${repository.repo}**. Please review and merge them as needed.`,
						color: 0x00ff00, // Green color
						timestamp: new Date().toISOString(),
					},
				],
				components: [
					{
						type: Discord.MessageComponentTypes.ACTION_ROW,
						components: [
							...(pull_request_url
								? [
										{
											type: Discord.MessageComponentTypes.BUTTON,
											style: Discord.ButtonStyleTypes.LINK,
											label: 'View on GitHub',
											url: pull_request_url as string | undefined,
										},
									]
								: [
										{
											type: Discord.MessageComponentTypes.BUTTON,
											style: Discord.ButtonStyleTypes.LINK,
											label: 'View Repository',
											url: `https://github.com/${repository.owner}/${repository.repo}`,
										},
									]),
						],
					},
				],
			});

			yield* logger.info(
				`Sent PTAL message to guild ${guild.name} (${guild.id}) in channel ${entry.channelId}`
			);
		}
	});

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
const handleGitHubWebhookEvent = Effect.fn('handleWebhookEvent')(function* (
	event: WebhookEvents[number],
	body: WebhookEvent
) {
	yield* logger.info(`Received GitHub webhook event: ${event} - processing...`);
	// Handle different GitHub webhook events here
	switch (event) {
		case 'push': {
			// Handle push event
			const rBody = body as EventPayloadMap[typeof event];
			yield* logger.info(`Received a push event for ${rBody.repository.full_name}/${rBody.ref}`);
			return;
		}
		// @ts-expect-error - repository_dispatch is a valid event type
		case 'repository_dispatch': {
			const rBody = body as EventPayloadMap['repository_dispatch'];

			// Get the action, defaulting to 'none' if not provided
			const action = rBody.action || 'none';
			const repository = { owner: rBody.repository.owner.login, repo: rBody.repository.name };

			yield* logger.debug(`Action: ${action}`);
			yield* logger.debug(`Repository: ${repository.owner}/${repository.repo}`);

			// Log the client payload for debugging purposes
			const client_payload = rBody.client_payload
				? JSON.stringify(rBody.client_payload)
				: 'No client_payload provided';
			yield* logger.debug(`Client Payload: ${client_payload}`);

			// Handle crowdin-ptal action
			yield* handleCrowdinSyncPTAL(action, repository, rBody.client_payload);

			return;
		}
		default: {
			yield* logger.info(`Unhandled event type: ${event}`);
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
		const github = yield* Github;
		const req = yield* HttpServerRequest.HttpServerRequest;

		// Get signature and event type from headers
		const signature = req.headers['x-hub-signature-256'] || undefined;
		const event = parseGithubEvent(req);

		// Parse the request body as JSON
		const body = (yield* req.json) as WebhookEvent;

		// Validate signature and event presence
		if (!signature || !event) {
			return yield* HttpServerResponse.text('Bad Request', { status: 400 });
		}

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
	// Read configuration values
	const port = yield* Config.number('PORT').pipe(Config.withDefault(3000));
	const host = yield* Config.string('HOST').pipe(Config.withDefault('0.0.0.0'));

	yield* logger.debug('Configuring HTTP server...');

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
}).pipe(
	Effect.withConfigProvider(
		ConfigProvider.fromEnv().pipe(ConfigProvider.nested('HTTP'), ConfigProvider.constantCase)
	)
);

/**
 * A live Layer instance for the HTTP server, created by invoking the `make` function.
 *
 * This layer is scoped and will be automatically discarded when no longer needed.
 * Use this to provide the HTTP server implementation in your application's environment.
 */
export const HTTPServerLive = Layer.scopedDiscard(make);
