import { createServer } from 'node:http';
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import type { EventPayloadMap, WebhookEvent, WebhookEvents } from '@octokit/webhooks-types';
import { Config, Effect, Layer } from 'effect';
import { Github } from '../core/github.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';

// import { DiscordGateway } from "dfx/DiscordGateway";

/**
 * Configuration for the HTTP server port.
 *
 * This value is retrieved from the environment variable `HTTP_PORT` and parsed as a number.
 * If the environment variable is not set, it defaults to `3000`.
 *
 * @remarks
 * Uses the `Config.number` method to ensure the value is a number,
 * and `Config.withDefault` to provide a fallback default.
 */
const portConfig = Config.number('HTTP_PORT').pipe(Config.withDefault(3000));

/**
 * Logger utility for the HTTP service
 */
const logger = {
	info: (msg: string) => Effect.log(formattedLog('Http', msg)),
	error: (msg: string) => Effect.logError(formattedLog('Http', msg)),
	warn: (msg: string) => Effect.logWarning(formattedLog('Http', msg)),
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
const handleWebhookEvent = Effect.fn('handleWebhookEvent')(function* (
	event: WebhookEvents[number],
	body: WebhookEvent
) {
	yield* logger.info(`Received GitHub webhook event: ${event} - processing...`);
	// yield* logger.info(`Payload: ${JSON.stringify(body, null, 2)}`);
	// Handle different GitHub webhook events here
	switch (event) {
		case 'push': {
			// Handle push event
			const rBody = body as EventPayloadMap[typeof event];
			return yield* logger.info(
				`Received a push event for ${rBody.repository.full_name}/${rBody.ref}`
			);
		}
		default:
			return yield* logger.info(`Unhandled event type: ${event}`);
	}
});

/**
 * Initializes and configures the Artemis HTTP service.
 *
 * This effectful generator function sets up the HTTP server with the following endpoints:
 * - `GET /`: Serves the main HTML file.
 * - `GET /api/health-check`: Returns a simple health check response.
 * - `POST /api/github/webhook`: Handles GitHub webhook events, verifying the signature and processing the event asynchronously.
 *
 * The server is configured to listen on the specified port and host, and integrates with the GitHub service for webhook verification.
 * All logs are annotated with the service name for easier tracing.
 *
 * @returns {Effect<unknown, never, Layer<unknown, never, unknown>>} The effect that, when run, starts the HTTP server as a Layer.
 */
const make = Effect.gen(function* () {
	// const _gateway = yield* DiscordGateway;
	const github = yield* Github;
	const port = yield* portConfig;

	/**
	 * Defines the main HTTP router for the application.
	 *
	 * Routes:
	 * - `GET /`: Serves the main HTML file (`index.html`).
	 * - `GET /api/health-check`: Returns a plain text response indicating the server is running.
	 * - `POST /api/github/webhook`: Handles incoming GitHub webhook events.
	 *    - Verifies the webhook signature.
	 *    - Parses the GitHub event and request body.
	 *    - Responds with `400 Bad Request` if the signature or event is missing.
	 *    - Responds with `401 Unauthorized` if the signature verification fails.
	 *    - Processes the webhook event asynchronously and responds with `202 Accepted` on success.
	 */
	const router = HttpRouter.empty.pipe(
		HttpRouter.get('/', HttpServerResponse.file(getHtmlFilePath('index.html'))),
		HttpRouter.get('/api/health-check', HttpServerResponse.text('running')),
		HttpRouter.post(
			'/api/github/webhook',
			Effect.gen(function* () {
				// Extract request data
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
					yield* logger.warn(
						`Received invalid GitHub webhook event: ${event} - signature mismatch`
					);
					return yield* HttpServerResponse.text('Unauthorized', { status: 401 });
				}

				// Process the webhook event asynchronously
				yield* handleWebhookEvent(event, body).pipe(Effect.forkScoped);

				// Respond with 202 Accepted
				return yield* HttpServerResponse.text('Accepted', { status: 202 });
			})
		)
	);

	/**
	 * Composes an HTTP server application by piping the provided router through the `HttpServer.serve()` middleware,
	 * followed by the `withLogAddress` middleware for logging request addresses.
	 *
	 * @remarks
	 * This application handles incoming HTTP requests using the defined router and logs the address of each request.
	 *
	 * @see HttpServer.serve
	 * @see withLogAddress
	 */
	const app = router.pipe(HttpServer.serve(), withLogAddress);

	// Create and return the HTTP server layer
	return Layer.provide(
		app,
		NodeHttpServer.layer(() => createServer(), { port, host: '0.0.0.0' })
	);
}).pipe(Effect.annotateLogs({ service: 'Artemis HTTP Service' }));

/**
 * Provides a live HTTP server layer by unwrapping the effect from `make` and supplying
 * the default GitHub provider. This layer can be used to compose and provide HTTP server
 * functionality within the application.
 *
 * @remarks
 * This layer is intended for use in environments where the default GitHub integration
 * is required for HTTP server operations.
 *
 * @see {@link Layer}
 * @see {@link Github.Default}
 */
export const HTTPServerLive = Layer.unwrapEffect(make);
