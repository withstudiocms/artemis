import { createServer } from 'node:http';
import { HttpRouter, HttpServer, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Config, Effect, Layer } from 'effect';

// import { DiscordGateway } from "dfx/DiscordGateway";

const portConfig = Config.number('HTTP_PORT').pipe(Config.withDefault(3000));

const make = Effect.gen(function* () {
	// const _gateway = yield* DiscordGateway;
	const port = yield* portConfig;

	yield* Effect.log('Starting HTTP server...');

	// --- ROUTER ENDPOINTS ---
	const router = HttpRouter.empty.pipe(
		HttpRouter.get('/api/health-check', HttpServerResponse.text('Alive!'))
	);

	// --- SERVER SETUP ---
	const app = router.pipe(HttpServer.serve(), HttpServer.withLogAddress);

	// Create the HTTP server layer
	return Layer.provide(
		app,
		NodeHttpServer.layer(() => createServer(), { port })
	);
}).pipe(Effect.annotateLogs({ service: 'HTTP Server' }));

// Create the HTTP server layer
export const HTTPServerLive = Layer.effectDiscard(make);
