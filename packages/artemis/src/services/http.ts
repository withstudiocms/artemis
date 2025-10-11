import { createServer } from 'node:http';
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Config, Effect, Layer } from 'effect';
import { withLogAddress } from '../utils/http.ts';

// import { DiscordGateway } from "dfx/DiscordGateway";

const portConfig = Config.number('HTTP_PORT').pipe(Config.withDefault(3000));

const make = Effect.gen(function* () {
	// const _gateway = yield* DiscordGateway;
	const port = yield* portConfig;

	// --- ROUTER ENDPOINTS ---
	const router = HttpRouter.empty.pipe(
		HttpRouter.get('/', HttpServerResponse.text('Hello, World!')),
		HttpRouter.get('/api/health-check', HttpServerResponse.text('Alive!'))
	);

	// --- SERVER SETUP ---
	const app = router.pipe(HttpServer.serve(), withLogAddress);

	// Create the HTTP server layer
	return Layer.provide(
		app,
		NodeHttpServer.layer(() => createServer(), { port, host: '0.0.0.0' })
	);
}).pipe(Effect.annotateLogs({ service: 'Artemis Bot: HTTP' }));

// Create the HTTP server layer
export const HTTPServerLive = Layer.unwrapEffect(make);
