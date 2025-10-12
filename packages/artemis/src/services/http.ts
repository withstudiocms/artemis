import { createServer } from 'node:http';
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import type { EventPayloadMap, WebhookEvent, WebhookEvents } from '@octokit/webhooks-types';
import { Config, Effect, Layer } from 'effect';
import { Github } from '../core/github.ts';
import { withLogAddress } from '../utils/http.ts';

// import { DiscordGateway } from "dfx/DiscordGateway";

const portConfig = Config.number('HTTP_PORT').pipe(Config.withDefault(3000));

/**
 * Logger utility for the HTTP service
 */
const logger = {
	info: (msg: string) => Effect.log(`[ArtemisBot:Http] ${msg}`),
	error: (msg: string) => Effect.logError(`[ArtemisBot:Http] ${msg}`),
	warn: (msg: string) => Effect.logWarning(`[ArtemisBot:Http] ${msg}`),
};

const parseGithubEvent = (req: HttpServerRequest.HttpServerRequest) => {
	const event = req.headers['x-github-event'];
	if (!event) return undefined;
	return event as WebhookEvents[number];
};

const handleWebhookEvent = Effect.fn('handleWebhookEvent')(function* (
	event: WebhookEvents[number],
	body: WebhookEvent
) {
	yield* logger.info(`Received GitHub webhook event: ${event} - processing...`);
	yield* logger.info(`Payload: ${JSON.stringify(body, null, 2)}`);
	// Handle different GitHub webhook events here
	switch (event) {
		case 'push': {
			// Handle push event
			const rBody = body as EventPayloadMap['push'];
			return yield* logger.info(`Received a push event for ref ${rBody.ref}`);
		}
		default:
			return yield* logger.info(`Unhandled event type: ${event}`);
	}
});

const make = Effect.gen(function* () {
	// const _gateway = yield* DiscordGateway;
	const github = yield* Github;
	const port = yield* portConfig;

	// --- ROUTER ENDPOINTS ---
	const router = HttpRouter.empty.pipe(
		HttpRouter.get('/', HttpServerResponse.file('/prod/artemis/dist/index.html')),
		HttpRouter.get('/api/health-check', HttpServerResponse.text('Alive!')),
		HttpRouter.post(
			'/api/github/webhook',
			Effect.gen(function* () {
				const req = yield* HttpServerRequest.HttpServerRequest;
				const signature = req.headers['x-hub-signature-256'] || undefined;
				const event = parseGithubEvent(req);
				const body = (yield* req.json) as WebhookEvent;

				if (!signature || !event) {
					return yield* HttpServerResponse.text('Bad Request', { status: 400 });
				}

				const isValid = yield* Effect.tryPromise(() =>
					github.webhooks.verify(JSON.stringify(body), signature)
				);

				if (!isValid) {
					yield* logger.warn(
						`Received invalid GitHub webhook event: ${event} - signature mismatch`
					);
					return yield* HttpServerResponse.text('Unauthorized', { status: 401 });
				}

				yield* handleWebhookEvent(event, body).pipe(Effect.forkScoped);

				return yield* HttpServerResponse.text('Accepted', { status: 202 });
			})
		)
	);

	// --- SERVER SETUP ---
	const app = router.pipe(HttpServer.serve(), withLogAddress);

	// Create the HTTP server layer
	return Layer.provide(
		app,
		NodeHttpServer.layer(() => createServer(), { port, host: '0.0.0.0' })
	);
}).pipe(Effect.annotateLogs({ service: 'Artemis Http service' }));

// Create the HTTP server layer
export const HTTPServerLive = Layer.unwrapEffect(make).pipe(Layer.provide(Github.Default));
