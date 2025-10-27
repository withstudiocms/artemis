import { createServer } from 'node:http';
import {
	FetchHttpClient,
	HttpClient,
	type HttpClientResponse,
	HttpLayerRouter,
	HttpServerResponse,
} from '@effect/platform';
import { NodeHttpServer } from '@effect/platform-node';
import { Cause, Effect, Schema } from 'effect';
import * as Layer from 'effect/Layer';
import { ResvgServiceLive } from '../core/resvg.ts';
import { httpHost, httpPort } from '../static/env.ts';
import { getHtmlFilePath, withLogAddress } from '../utils/http.ts';
import { formattedLog } from '../utils/log.ts';
import { getStarHistorySvgUrl } from '../utils/star-history.ts';

/**
 * Predefined static file routes for serving specific files from the
 * `packages/artemis/html` directory.
 *
 * Each route maps a URL path to a corresponding file name.
 */
const staticFileRoutes = [
	{ file: 'index.html' },
	{ file: 'logo.png' },
	{ file: 'xkcd-script.ttf' },
	{ file: 'studiocms.png' },
];

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
	HttpLayerRouter.schemaPathParams(
		Schema.Struct({
			owner: Schema.String,
			repo: Schema.String,
		})
	).pipe(
		Effect.flatMap(
			Effect.fn(function* ({ owner, repo }) {
				const [{ renderToPng }, fetchClient] = yield* Effect.all([
					ResvgServiceLive,
					HttpClient.HttpClient,
				]);

				// Construct repository identifier
				const repository = `${owner}/${repo}`;

				// Generate star history SVG URL
				const starHistoryUrl = yield* getStarHistorySvgUrl(repository).pipe(
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

				/**
				 * Handles errors during HTTP fetch and rendering processes.
				 *
				 * @param prefix - A string prefix to identify the error context.
				 * @param err - The cause of the error.
				 * @returns An Effect that fails with an HTTP response containing the error message.
				 */
				const handleError = (prefix: string) => (err: Cause.Cause<unknown>) =>
					Effect.fail(
						HttpServerResponse.text(`${prefix}: ${Cause.pretty(err)}`, {
							status: 500,
						})
					);

				/**
				 * Checks the HTTP response status and returns the response text if successful.
				 * Fails with an HTTP response if the status is not 200.
				 *
				 * @param response - The HTTP client response to check.
				 * @returns An Effect that yields the response text or fails with an HTTP response.
				 */
				const checkHTTPResponse = Effect.fn(function* (
					response: HttpClientResponse.HttpClientResponse
				) {
					if (response.status !== 200) {
						return yield* Effect.fail(
							HttpServerResponse.text(`Failed to fetch star history for ${repository}`, {
								status: response.status,
							})
						);
					}
					return yield* response.text;
				});

				/**
				 * Renders the given SVG string to PNG bytes using the Resvg service.
				 *
				 * @param svgString - The SVG content as a string.
				 * @returns An Effect that yields the PNG bytes.
				 */
				const handleSvgRender = Effect.fn(function* (svgString: string) {
					return yield* renderToPng(svgString, {
						fitTo: { mode: 'width', value: 1200 },
						background: '#ffffff',
						font: {
							fontFiles: [getHtmlFilePath('xkcd-script.ttf')],
							loadSystemFonts: true,
						},
					});
				});

				// Fetch the SVG from star-history.com
				const pngBuffer = yield* fetchClient.get(starHistoryUrl).pipe(
					// Handle errors during HTTP fetch
					Effect.catchAllCause(handleError('Error fetching star history SVG')),
					// Check HTTP response status and extract text (SVG content)
					Effect.flatMap(checkHTTPResponse),
					// Render SVG to PNG
					Effect.flatMap(handleSvgRender),
					// Handle errors during SVG rendering
					Effect.catchAllCause(handleError('Error rendering SVG to PNG'))
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
			})
		),
		Effect.provide(FetchHttpClient.layer)
	)
);

/**
 * Generates route handlers for serving predefined static files.
 *
 * Each static file route is created based on the `staticFileRoutes` array,
 * mapping URL paths to their corresponding files in the `/prod/artemis/html/` directory.
 */
const staticFileRouteHandlers = staticFileRoutes.flatMap(({ file }) => {
	const paths = file === 'index.html' ? (['/', `/${file}`] as const) : ([`/${file}`] as const);
	return paths.map((path) =>
		HttpLayerRouter.route('GET', path, HttpServerResponse.file(getHtmlFilePath(file)))
	);
});

/**
 * Collection of all HTTP routes for the Artemis server.
 *
 * This includes static file serving, health checks, and API endpoints
 * such as the star history image generation.
 */
const routes = HttpLayerRouter.addAll([
	// Health Check Route
	HttpLayerRouter.route('*', '/api/health', HttpServerResponse.text('OK')),

	// Star History API Route
	starHistoryRouteHandler,

	// Static File Routes
	...staticFileRouteHandlers,

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
