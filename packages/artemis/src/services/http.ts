import { createServer } from 'node:http';
import { HttpLayerRouter, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Layer from 'effect/Layer';
import { httpHost, httpPort } from '../static/env.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';

const routes = HttpLayerRouter.addAll([
	HttpLayerRouter.route('GET', '/', HttpServerResponse.file(getHtmlFilePath('index.html'))),
	HttpLayerRouter.route('GET', '/logo.png', HttpServerResponse.file(getHtmlFilePath('logo.png'))),
	HttpLayerRouter.route(
		'GET',
		'/studiocms.png',
		HttpServerResponse.file(getHtmlFilePath('studiocms.png'))
	),
	HttpLayerRouter.route('*', '/api/health', HttpServerResponse.text('OK')),
	// Catch-all route for undefined endpoints
	HttpLayerRouter.route('*', '*', HttpServerResponse.text('Not Found', { status: 404 })),
]);

const make = Effect.gen(function* () {
	const [port, host] = yield* Effect.all([
		httpPort,
		httpHost,
		Effect.logDebug(formattedLog('Http', 'Configuring server...')),
	]);

	// Setup router layer
	const router = HttpLayerRouter.serve(routes, {
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

export const HTTPServerLive = Layer.scopedDiscard(make);
