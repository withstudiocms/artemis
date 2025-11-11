import { DiscordREST } from 'dfx/DiscordREST';
import { and, eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
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
	const [eventBus, db, rest] = yield* Effect.all([EventBus, DatabaseLive, DiscordREST]);

	// Subscribe to "crowdin.create" events
	const crowdinCreateSubscription = eventBus.subscribe(
		'crowdin.create',
		Effect.fn(function* ({ payload }) {
			yield* Effect.log(
				`Processing crowdin.create event for repository: ${payload.repository.owner}/${payload.repository.name}`
			);

			const getCrowdinReference = db.makeQuery(
				(ex, { name, owner }: { name: string; owner: string }) =>
					ex((c) =>
						c
							.select()
							.from(db.schema.crowdinEmbed)
							.where(
								and(eq(db.schema.crowdinEmbed.repo, name), eq(db.schema.crowdinEmbed.owner, owner))
							)
					)
			);

			yield* getCrowdinReference(payload.repository).pipe(
				Effect.catchAll(() => Effect.succeed([] as (typeof db.schema.crowdinEmbed.$inferSelect)[])),
				Effect.flatMap(
					Effect.forEach((ref) =>
						// TODO: Replace with PTAL embed logic and ensure it adds to DB if not present
						rest.createMessage(ref.channelId, {
							content: `New Crowdin PR created: ${payload.payload.pull_request_url}`,
						})
					)
				),
				Effect.catchAll((error) =>
					Effect.logError(`Failed to send Crowdin notification message: ${error}`)
				)
			);
		})
	);

	// Subscribe to "test.event" events
	const testEventSubscription = eventBus.subscribe(
		'test.event',
		Effect.fn(function* ({ payload }) {
			yield* Effect.log(`Received test event with message: ${payload.message}`);
		})
	);

	// Setup the listeners
	yield* Effect.all([
		Effect.forkScoped(crowdinCreateSubscription),
		Effect.forkScoped(testEventSubscription),
		Effect.logDebug(formattedLog('EventBus', 'EventBusListener has been initialized.')),
	]);
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
