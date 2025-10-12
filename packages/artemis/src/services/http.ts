import { createServer } from 'node:http';
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Config, Effect, Layer } from 'effect';
import { Github } from '../core/github.ts';
import { withLogAddress } from '../utils/http.ts';

// import { DiscordGateway } from "dfx/DiscordGateway";

const portConfig = Config.number('HTTP_PORT').pipe(Config.withDefault(3000));

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
				const event = req.headers['x-github-event'] || undefined;
				const body = yield* req.json;

				if (!signature || !event) {
					return yield* HttpServerResponse.text('Bad Request', { status: 400 });
				}

				const isValid = yield* Effect.tryPromise(() =>
					github.webhooks.verify(JSON.stringify(body), signature)
				);

				if (!isValid) {
					return yield* HttpServerResponse.text('Unauthorized', { status: 401 });
				}

				yield* Effect.log(`Received GitHub webhook event: ${event}`);

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
