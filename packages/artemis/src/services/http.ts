import { HttpServerRequest } from '@effect/platform';
import * as HttpLayerRouter from '@effect/platform/HttpLayerRouter';
import * as HttpServerResponse from '@effect/platform/HttpServerResponse';
import * as NodeHttpServer from '@effect/platform-node/NodeHttpServer';
import type { EventPayloadMap, WebhookEvent, WebhookEvents } from '@octokit/webhooks-types';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { createServer } from 'http';
import { Github } from '../core/github.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import { Config } from 'effect';

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
	// Handle different GitHub webhook events here
	switch (event) {
		case 'push': {
			// Handle push event
			const rBody = body as EventPayloadMap[typeof event];
			yield* logger.info(
				`Received a push event for ${rBody.repository.full_name}/${rBody.ref}`
			);
            return;
		}
		default: {
	        yield* logger.info(`Unhandled event type: ${event}`);
            yield* logger.debug(`Payload: ${JSON.stringify(body, null, 2)}`);
            return;
        }
	}
});

/// --- ROUTES ---

/**
 * Registers the root route (`'/'`) for HTTP GET requests using the `HttpLayerRouter`.
 * 
 * When a GET request is made to the root path, this route responds by serving the `index.html` file,
 * whose path is resolved by the `getHtmlFilePath` function.
 */
const RootRoute = HttpLayerRouter.add(
	'GET',
	'/',
	HttpServerResponse.file(getHtmlFilePath('index.html'))
);

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
		yield* handleWebhookEvent(event, body).pipe(Effect.forkScoped);

		// Respond with 202 Accepted
		return yield* HttpServerResponse.text('Accepted', { status: 202 });
	})
);

/// --- LAYER ---

/**
 * Merges multiple route definitions into a single route configuration.
 */
const AllRoutes = Layer.mergeAll(RootRoute, HealthCheckRoute, GithubWebhookRoute);

/// --- Builder ---

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
    const port = yield* Config.number('HTTP_PORT').pipe(Config.withDefault(3000));
    const host = yield* Config.string('HTTP_HOST').pipe(Config.withDefault('0.0.0.0'));
    
    yield* logger.debug(`Configuring HTTP server...`);

	// Setup router layer
    const router = HttpLayerRouter.serve(AllRoutes, { disableListenLog: true, disableLogger: true }).pipe(withLogAddress);

	// Setup server layer
    const serverLayer = NodeHttpServer.layer(createServer, { port, host });

	// Create Server Layer
    yield* Layer.provide(router, serverLayer).pipe(Layer.launch, Effect.forkScoped);
});

/// --- EXPORTS ---

/**
 * A live Layer instance for the HTTP server, created by invoking the `make` function.
 * 
 * This layer is scoped and will be automatically discarded when no longer needed.
 * Use this to provide the HTTP server implementation in your application's environment.
 */
export const HTTPServerLive = Layer.scopedDiscard(make);
