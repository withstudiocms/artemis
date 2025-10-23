import { createServer } from 'node:http';
import { HttpLayerRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Resvg } from '@resvg/resvg-js';
import { Effect } from 'effect';
import * as Layer from 'effect/Layer';
import { httpHost, httpPort } from '../static/env.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';

const starHistoryHandler = Effect.gen(function* () {
	const request = yield* HttpServerRequest.HttpServerRequest;

	// Parse URL properly - /api/star-history/owner/repo
	const url = new URL(request.url, 'http://localhost');
	const pathParts = url.pathname.split('/').filter(Boolean);

	// pathParts should be: ['api', 'star-history', 'owner', 'repo']
	if (pathParts.length !== 4 || pathParts[0] !== 'api' || pathParts[1] !== 'star-history') {
		return HttpServerResponse.text('Invalid repository format. Use: /api/star-history/owner/repo', {
			status: 400,
		});
	}

	const owner = pathParts[2];
	const repo = pathParts[3];

	if (!owner || !repo) {
		return HttpServerResponse.text('Invalid repository format. Use: /api/star-history/owner/repo', {
			status: 400,
		});
	}

	const repository = `${owner}/${repo}`;
	const svgUrl = `https://api.star-history.com/svg?repos=${repository}&type=Date`;

	yield* Effect.logInfo(formattedLog('Http', `Star history request for: ${repository}`));
	yield* Effect.logInfo(formattedLog('Http', `Fetching from: ${svgUrl}`));

	// Fetch the SVG from star-history.com
	const response = yield* Effect.tryPromise(() => fetch(svgUrl));

	if (!response.ok) {
		return HttpServerResponse.text(`Failed to fetch star history for ${repository}`, {
			status: response.status,
		});
	}

	const svgBuffer = yield* Effect.tryPromise(() => response.arrayBuffer());
	const svgString = new TextDecoder().decode(svgBuffer);

	// Convert SVG to PNG using resvg
	const pngBuffer = yield* Effect.try(() => {
		const resvg = new Resvg(svgString, {
			fitTo: { mode: 'width', value: 1200 },
			background: '#ffffff',
			font: {
				fontFiles: ['./xkcd-script.woff'],
				loadSystemFonts: true,
			},
		});
		const pngData = resvg.render();
		return pngData.asPng();
	});

	yield* Effect.logInfo(
		formattedLog('Http', `Converted SVG to PNG, size: ${pngBuffer.length} bytes`)
	);

	return HttpServerResponse.uint8Array(new Uint8Array(pngBuffer), {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
		},
	});
});

const routes = HttpLayerRouter.addAll([
	HttpLayerRouter.route('GET', '/', HttpServerResponse.file(getHtmlFilePath('index.html'))),
	HttpLayerRouter.route('GET', '/logo.png', HttpServerResponse.file(getHtmlFilePath('logo.png'))),
	HttpLayerRouter.route(
		'GET',
		'/xkcd-script.woff',
		HttpServerResponse.file(getHtmlFilePath('xkcd-script.woff'))
	),
	HttpLayerRouter.route(
		'GET',
		'/studiocms.png',
		HttpServerResponse.file(getHtmlFilePath('studiocms.png'))
	),
	HttpLayerRouter.route('*', '/api/health', HttpServerResponse.text('OK')),
	HttpLayerRouter.route('GET', '/api/star-history/:owner/:repo', starHistoryHandler),
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
