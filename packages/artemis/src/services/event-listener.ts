import { Effect, Layer } from 'effect';
import { EventBus } from '../core/event-bus.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Creates an Effect that registers a handler for "crowdin.create" events on the shared EventBus.
 *
 * When executed the Effect obtains the EventBus and subscribes a handler which:
 * - logs the repository owner and name from event.payload.repository.owner and event.payload.repository.name
 * - logs the pull request URL from event.payload.payload.pull_request_url
 *
 * The returned Effect performs the subscription as a side effect; the handler itself executes additional
 * Effects when matching events are received.
 *
 * @returns An Effect which, when run, registers the "crowdin.create" subscription (completes once registration is done).
 */
const make = Effect.gen(function* () {
	// Get the EventBus from the environment
	const eventBus = yield* EventBus;

	// Subscribe to "crowdin.create" events
	yield* eventBus.subscribe(
		'crowdin.create',
		Effect.fn(function* ({ payload }) {
			yield* Effect.log(
				`Processing crowdin.create event for repository: ${payload.repository.owner}/${payload.repository.name}`
			);
			yield* Effect.log(
				`Received crowdin.create event for PR URL: ${payload.payload.pull_request_url}`
			);
		})
	);

	yield* eventBus.subscribe(
		'test.event',
		Effect.fn(function* ({ payload }) {
			yield* Effect.log(`Received test event with message: ${payload.message}`);
		})
	);

	yield* Effect.logDebug(formattedLog('EventBus', 'EventBusListener has been initialized.'));
});

/**
 * A scoped Layer that provides the "live" EventBus listener implementation.
 *
 * Summary:
 * This exported layer constructs an EventBus listener using the internal `make` factory
 * and registers it with a scoped lifecycle. The listener instance is created when the
 * layer is instantiated within a scope and is automatically discarded (disposed/unsubscribed)
 * when that scope ends.
 *
 * Remarks:
 * - Built with Layer.scopedDiscard(make), so each scope receives its own listener instance.
 * - The instance is not shared across independent scopes and is cleaned up automatically
 *   when the scope finishes, preventing resource leaks from long-lived subscriptions.
 * - Intended for runtime usage where listeners should be bound to a particular lifecycle.
 *
 * Thread-safety:
 * The layer itself is safe to create and pass between threads/tasks, but the listener
 * instance semantics (one-per-scope and discarded on scope end) should be considered when
 * designing concurrent access to the EventBus.
 *
 * See also:
 * - The `make` factory used to construct the listener for implementation details.
 *
 * @public
 */
export const EventBusListenerLive = Layer.scopedDiscard(make);
