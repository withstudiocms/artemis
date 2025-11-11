import * as crypto from 'node:crypto';
import { HttpLayerRouter, HttpServerRequest, HttpServerResponse } from '@effect/platform';
import type { WebhookEventMap, WebhookEventName } from '@octokit/webhooks-types';
import { Console, Effect, Redacted, Schema } from 'effect';
import { githubWebhookSecret } from '../static/env.ts';
import { PullRequestEventSchema, RepositoryDispatchEventSchema } from './schemas.js';

/**
 * Verify that a request body matches the provided HMAC SHA-256 signature header.
 *
 * Computes an HMAC SHA-256 digest of the provided `body` using the `WEBHOOK_SECRET`
 * and compares it to the supplied `signature`. The signature is expected to be in
 * the form "sha256=<hex>".
 *
 * Behavior:
 * - If `signature` is undefined, the returned Effect fails with Error('No signature provided').
 * - If the computed digest does not exactly equal the provided signature, the returned Effect fails with Error('Invalid signature').
 * - If the signature matches, the returned Effect succeeds with the boolean value `true`.
 *
 * Notes:
 * - The comparison is a direct equality check (not constant-time); consider using a constant-time comparison to mitigate timing attacks.
 * - `WEBHOOK_SECRET` must be defined in the surrounding scope and should be kept secret.
 *
 * @param body - The raw request body to compute the HMAC over.
 * @param signature - The signature header value (expected "sha256=<hex>") or undefined.
 * @returns An Effect that fails with an Error on missing or invalid signature, or succeeds with `true` when the signature is valid.
 */
const verifySignature = (body: string, signature: string | undefined) =>
	Effect.gen(function* () {
		if (!signature) {
			return yield* Effect.fail(new Error('No signature provided'));
		}

		const webhookSecret = yield* githubWebhookSecret;

		const hmac = crypto.createHmac('sha256', Redacted.value(webhookSecret));
		const digest = `sha256=${hmac.update(body).digest('hex')}`;

		if (signature !== digest) {
			return yield* Effect.fail(new Error('Invalid signature'));
		}

		return true;
	});

const handlePullRequest = (payload: Schema.Schema.Type<typeof PullRequestEventSchema>) =>
	Effect.gen(function* () {
		yield* Console.log(
			`PR ${payload.action}: #${payload.pull_request.number} in ${payload.repository.full_name}`
		);
		yield* Console.log(`Title: ${payload.pull_request.title}`);
		yield* Console.log(`Author: ${payload.pull_request.user.login}`);

		if (payload.action === 'opened') {
			yield* Console.log('New pull request opened - could trigger CI/CD or notifications');
		} else if (payload.action === 'closed' && payload.pull_request.merged) {
			yield* Console.log('Pull request merged - could trigger deployment');
		}
	});

const handleRepositoryDispatch = (
	payload: Schema.Schema.Type<typeof RepositoryDispatchEventSchema>
) =>
	Effect.gen(function* () {
		yield* Console.log(
			`Repository Dispatch Event: ${payload.action} in ${payload.repository.full_name}`
		);
		yield* Console.log('Client Payload:', payload.clientPayload);
	});

/**
 * Logs receipt of a generic GitHub webhook event for debugging and observability.
 *
 * This function records the event name and associated payload to the console.
 * The payload is typed as `unknown` because different event types carry
 * different shapes; callers should narrow the payload before accessing fields.
 *
 * @param event - The name of the received event (e.g., "push", "pull_request").
 * @param payload - The raw event payload; its structure depends on the event type.
 * @returns void
 */
const handleGenericEvent = (event: string, payload: unknown) =>
	Console.log(`Received ${event} event:`, payload);

/**
 * Process a GitHub webhook by decoding the provided payload and dispatching it
 * to the appropriate event handler within an Effect context.
 *
 * The function is generic over the event name so the payload parameter is
 * statically typed according to WebhookEventMap[Event].
 *
 * The returned Effect encapsulates any asynchronous work, side effects and
 * potential failures (e.g. decoding errors or handler failures).
 *
 * @template Event - A key of WebhookEventMap representing the webhook event name.
 * @param event - The name of the incoming webhook event.
 * @param payload - The raw payload associated with the event; its static type
 *                  is determined by the Event generic via WebhookEventMap.
 * @returns An Effect that, when executed, performs decoding/handling of the
 *          webhook and yields the handler result or a logging action. The
 *          Effect may fail with decoding or handler errors.
 */
const processWebhook = <Event extends WebhookEventName>(
	event: Event,
	payload: WebhookEventMap[Event]
) =>
	Effect.gen(function* () {
		switch (event) {
			case 'pull_request':
				return yield* Schema.decodeUnknown(PullRequestEventSchema)(payload).pipe(
					Effect.flatMap(handlePullRequest)
				);

			case 'repository_dispatch':
				return yield* Schema.decodeUnknown(RepositoryDispatchEventSchema)(payload).pipe(
					Effect.flatMap(handleRepositoryDispatch)
				);

			case 'installation':
				return yield* handleGenericEvent(event, payload);

			default:
				return yield* Console.log(`Unhandled event type: ${event}`);
		}
	});

/**
 * HTTP route handler for receiving GitHub webhook POST requests at `/api/github/webhook`.
 *
 * @remarks
 * - Reads the incoming HTTP request body as text and attempts to parse it as JSON.
 * - Extracts GitHub-specific headers:
 *   - `x-github-event` (event name)
 *   - `x-hub-signature-256` (HMAC SHA-256 signature)
 *   - `x-github-delivery` (delivery ID)
 * - Verifies the request payload signature using `verifySignature`.
 * - Logs receipt of the event via `Console.log`.
 * - Delegates handling of the parsed payload to `processWebhook(event, payload)`.
 * - On success, returns a JSON 200 response: `{ message: 'Webhook processed successfully' }`.
 *
 * Error handling:
 * - All errors arising during parsing, signature verification, or processing are caught.
 * - Errors are logged via `Console.error`.
 * - Returns a JSON error response with:
 *   - `401` if the error message indicates a signature verification failure (message contains "signature"),
 *   - otherwise `500` for other internal errors.
 * - The JSON error body is `{ error: string }` where `string` is either the error message or a generic message.
 *
 * Side effects:
 * - Uses `Console.log` and `Console.error` for observability.
 * - Calls external helpers: `verifySignature` (for authenticity) and `processWebhook` (for business logic).
 *
 * Notes:
 * - The handler expects the request body to be valid JSON. Malformed JSON will result in an error response.
 * - Signature header may be absent; such cases will be treated according to `verifySignature` behavior and may result in a 401.
 *
 * @returns An effectful HTTP response (JSON) indicating success or an error with an appropriate status code.
 */
export const githubWebhookRouteHandler = HttpLayerRouter.route(
	'POST',
	'/api/github/webhook',
	Effect.gen(function* () {
		const request = yield* HttpServerRequest.HttpServerRequest;

		// Get headers
		const event = request.headers['x-github-event'] as WebhookEventName;
		const signature = request.headers['x-hub-signature-256'];
		const deliveryId = request.headers['x-github-delivery'];

		return yield* request.text.pipe(
			Effect.flatMap((bodyText) =>
				Effect.all({
					payload: Effect.succeed(JSON.parse(bodyText)),
					signatureVerified: verifySignature(bodyText, signature),
				})
			),
			Effect.tap(() => Console.log(`Received ${event} event (${deliveryId})`)),
			Effect.flatMap(({ payload }) => processWebhook(event, payload)),
			Effect.flatMap(() =>
				HttpServerResponse.json(
					{ message: 'Webhook processed successfully' },
					{
						status: 200,
					}
				)
			)
		);
	}).pipe(
		Effect.catchAll((error) =>
			Effect.gen(function* () {
				yield* Console.error('Error processing webhook:', error);
				return yield* HttpServerResponse.json(
					{ error: error instanceof Error ? error.message : 'Internal server error' },
					{ status: error instanceof Error && error.message.includes('signature') ? 401 : 500 }
				);
			})
		)
	)
);
