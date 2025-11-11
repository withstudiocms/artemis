import { Console, Effect, type Schema } from 'effect';
import type { RepositoryDispatchEventSchema } from '../schemas.ts';

/**
 * Handles a GitHub "repository_dispatch" webhook event by producing effectful logs.
 *
 * @remarks
 * Implemented as an Effect generator (via Effect.fn), this handler yields Console.log effects
 * rather than performing direct synchronous console I/O. It logs a single-line summary that
 * includes the event action and the repository full name, and then logs the client payload
 * sent with the repository dispatch event.
 *
 * The handler expects a payload that conforms to RepositoryDispatchEventSchema and does not
 * return a meaningful value (its purpose is to produce logging side effects).
 *
 * @param payload - The repository dispatch event payload (Schema.Type<typeof RepositoryDispatchEventSchema>),
 *   which should include at minimum:
 *   - action: the action name for the dispatch event
 *   - repository.full_name: the owner/repo identifier
 *   - clientPayload: an arbitrary object supplied by the dispatcher
 *
 * @example
 * // Given a payload like:
 * // { action: "run-workflow", repository: { full_name: "owner/repo" }, clientPayload: { foo: "bar" } }
 * // the handler will yield effects to log:
 * //   "Repository Dispatch Event: run-workflow in owner/repo"
 * //   "Client Payload:" { foo: "bar" }
 */
export const handleRepositoryDispatch = Effect.fn(function* (
	payload: Schema.Schema.Type<typeof RepositoryDispatchEventSchema>
) {
	yield* Console.log(
		`Repository Dispatch Event: ${payload.action} in ${payload.repository.full_name}`
	);
	yield* Console.log('Client Payload:', payload.clientPayload);
});
