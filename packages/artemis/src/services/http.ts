import { createServer } from 'node:http';
import {
	FetchHttpClient,
	HttpClient,
	HttpLayerRouter,
	HttpServerRequest,
	HttpServerResponse,
} from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Cause, Effect, pipe } from 'effect';
import * as Layer from 'effect/Layer';
import { ResvgServiceLive } from '../core/resvg.ts';
import { httpHost, httpPort } from '../static/env.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import { getStarHistorySvgUrl } from '../utils/star-history.ts';

/**
 * Handles the "/api/star-history/:owner/:repo" route to generate and return
 * a star history PNG image for the specified GitHub repository.
 *
 * This route:
 * - Parses the owner and repo from the URL path.
 * - Generates the star history SVG URL using `getStarHistorySvgUrl`.
 * - Fetches the SVG from star-history.com.
 * - Converts the SVG to PNG using the Resvg service.
 * - Returns the PNG image in the HTTP response.
 *
 * Error handling is included to manage invalid input and fetch/render failures.
 */
const starHistoryRouteHandler = HttpLayerRouter.route(
	'GET',
	'/api/star-history/:owner/:repo',
	Effect.gen(function* () {
		const [request, resvg, fetchClient] = yield* Effect.all([
			HttpServerRequest.HttpServerRequest,
			ResvgServiceLive,
			HttpClient.HttpClient,
		]);

		// Parse path parts to extract owner and repo
		const pathParts = pipe(new URL(request.url, 'http://localhost'), (url) =>
			url.pathname.split('/').filter(Boolean)
		);

		// pathParts should be: ['api', 'star-history', 'owner', 'repo']
		if (pathParts.length !== 4 || pathParts[0] !== 'api' || pathParts[1] !== 'star-history') {
			return HttpServerResponse.text(
				'Invalid repository format. Use: /api/star-history/owner/repo',
				{
					status: 400,
				}
			);
		}

		// Extract owner and repo
		const [_api, _starHistory, owner, repo] = pathParts;

		// Construct repository identifier
		const repository = `${owner}/${repo}`;

		// Generate star history SVG URL
		const starHistoryUrl = yield* getStarHistorySvgUrl(pathParts).pipe(
			Effect.catchAllCause((err) =>
				Effect.fail(
					HttpServerResponse.text(`Error generating star history URL: ${Cause.pretty(err)}`, {
						status: 400,
					})
				)
			)
		);

		// Log the request details
		yield* Effect.logDebug(formattedLog('Http', `Star history request for: ${repository}`));
		yield* Effect.logDebug(formattedLog('Http', `Fetching from: ${starHistoryUrl}`));

		// Fetch the SVG from star-history.com
		const response = yield* fetchClient.get(starHistoryUrl).pipe(
			Effect.catchAllCause((err) =>
				Effect.fail(
					HttpServerResponse.text(`Error fetching star history SVG: ${Cause.pretty(err)}`, {
						status: 500,
					})
				)
			)
		);

		// Check for non-200 response
		if (response.status !== 200) {
			return HttpServerResponse.text(`Failed to fetch star history for ${repository}`, {
				status: response.status,
			});
		}

		// Read SVG content
		const svgString = yield* response.text;

		// Convert SVG to PNG using resvg
		const pngBuffer = yield* resvg
			.renderToPng(svgString, {
				fitTo: { mode: 'width', value: 1200 },
				background: '#ffffff',
				font: {
					fontFiles: [getHtmlFilePath('xkcd-script.ttf')],
					loadSystemFonts: true,
				},
			})
			.pipe(
				Effect.catchAllCause((err) =>
					Effect.fail(
						HttpServerResponse.text(`Error rendering SVG to PNG: ${Cause.pretty(err)}`, {
							status: 500,
						})
					)
				)
			);

		// Log the size of the generated PNG
		yield* Effect.logDebug(
			formattedLog('Http', `Converted SVG to PNG, size: ${pngBuffer.length} bytes`)
		);

		// Return the PNG image in the HTTP response
		return HttpServerResponse.uint8Array(new Uint8Array(Buffer.from(pngBuffer)), {
			headers: {
				'Content-Type': 'image/png',
				'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
			},
		});
	}).pipe(Effect.provide(FetchHttpClient.layer))
);

/**
 * Collection of all HTTP routes for the Artemis server.
 *
 * This includes static file serving, health checks, and API endpoints
 * such as the star history image generation.
 */
const routes = HttpLayerRouter.addAll([
	// Main Response Routes
	HttpLayerRouter.route('GET', '/', HttpServerResponse.file(getHtmlFilePath('index.html'))),
	HttpLayerRouter.route('*', '/api/health', HttpServerResponse.text('OK')),

	// Star History API Route
	starHistoryRouteHandler,

	// Static Asset Routes
	HttpLayerRouter.route('GET', '/logo.png', HttpServerResponse.file(getHtmlFilePath('logo.png'))),
	HttpLayerRouter.route(
		'GET',
		'/xkcd-script.ttf',
		HttpServerResponse.file(getHtmlFilePath('xkcd-script.ttf'))
	),
	HttpLayerRouter.route(
		'GET',
		'/studiocms.png',
		HttpServerResponse.file(getHtmlFilePath('studiocms.png'))
	),

	// Catch-all route for undefined endpoints
	HttpLayerRouter.route('*', '*', HttpServerResponse.text('Not Found', { status: 404 })),
]);

/**
 * Effect Layer that provides and starts the HTTP server for Artemis.
 *
 * This layer sets up the HTTP server with routing, logging, and configuration
 * based on environment variables. It launches the server in a scoped manner,
 * ensuring proper resource management.
 */
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

/**
 * Layer that provides the live HTTP server for Artemis.
 *
 * This layer is scoped and ensures that the HTTP server is properly started
 * and stopped within the application's lifecycle.
 */
export const HTTPServerLive = Layer.scopedDiscard(make);
