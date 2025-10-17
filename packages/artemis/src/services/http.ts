import { createServer } from 'node:http';
import { HttpLayerRouter, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import * as Layer from 'effect/Layer';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';

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

export const HTTPServerLive = HttpLayerRouter.serve(routes).pipe(
	withLogAddress,
	Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
);
