import { Effect, Layer } from 'effect';
import { type AppEvents, EventBus } from '../core/event-bus.ts';

/**
 * Maps each application event type to a strongly-typed effectful handler.
 *
 * The object's keys are the distinct values of AppEvents['type'], and each value is a
 * handler function typed as (event: Extract<AppEvents, { type: K }>) => Effect.Effect<void>.
 * Type-level narrowing via Extract guarantees that handlers receive the exact event shape
 * associated with their key.
 *
 * Handlers are constructed as effect-producing generators (created with Effect.fn) and
 * should return an Effect representing the side effects to be executed by the Effect runtime
 * (logging, I/O, dispatching other effects, etc.). This design keeps runtime side effects
 * explicit and type-safe.
 *
 * The map is intended to be extended with handlers for additional AppEvents types. Each new
 * event type added to AppEvents['type'] should have a corresponding entry here that handles
 * the specific payload for that event.
 *
 * @remarks
 * - Keep handler implementations focused on building Effects rather than performing immediate side effects.
 * - Use the narrowed event type to access payload fields with full TypeScript safety.
 *
 * @example
 * // Adding a new handler for "my.event":
 * // EventMap['my.event'] = Effect.fn(function* (event) {
 * //   // use event.payload here with correct typing
 * // });
 *
 * @readonly
 */
const EventMap: {
	[K in AppEvents['type']]: (event: Extract<AppEvents, { type: K }>) => Effect.Effect<void>;
} = {
	'crowdin.create': Effect.fn(function* (event) {
		yield* Effect.log(
			`Processing crowdin.create event for repository: ${event.payload.repository.owner}/${event.payload.repository.name}`
		);
		yield* Effect.log(
			`Received crowdin.create event for PR URL: ${event.payload.payload.pull_request_url}`
		);
	}),
};

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
	const eventBus = yield* EventBus;

	yield* Effect.all(
		Object.entries(EventMap).map(([eventType, handler]) =>
			eventBus.subscribe(eventType as AppEvents['type'], handler)
		)
	);
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
