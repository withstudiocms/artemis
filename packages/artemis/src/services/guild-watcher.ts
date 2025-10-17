import { DiscordGateway } from 'dfx/DiscordGateway';
import { eq } from 'drizzle-orm';
import { Effect, Layer } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { spacedOnceSecond } from '../static/schedules.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Initializes and starts the Guild watcher effect.
 *
 * This effect registers two dispatch handlers on the Discord gateway to keep the local
 * database synchronized with guild lifecycle events:
 *
 * - GUILD_CREATE: Checks whether the guild exists in the database; if it does not, inserts
 *   a new guild record and logs the action. The handler is retried on failure using a
 *   spaced schedule with a 1-second interval.
 *
 * - GUILD_DELETE: Checks whether the guild exists in the database; if it does, deletes
 *   the guild record and logs the action. Errors from this handler are caught and logged,
 *   and the whole handler is retried on failure using a spaced schedule with a 1-second
 *   interval.
 *
 * Both handlers depend on the DiscordGateway and DatabaseLive services from the environment.
 * When executed, the returned effect forks both handlers into the current scope (so they run
 * concurrently and independently) and emits a debug log indicating the watchers are registered.
 *
 * Remarks:
 * - The effect performs database reads and writes (select, insert, delete) and relies on
 *   the provided database schema for guilds.
 * - The creation handler is idempotent: it only inserts when the guild is absent.
 * - The deletion handler is safe to run repeatedly: it only deletes when the guild exists.
 * - Both handlers are resilient to transient failures due to the retry schedule.
 *
 * @returns An Effect which, when run, registers and forks the guild create/delete handlers
 * into the current scope and completes after forking. The handlers themselves continue to
 * run for the lifetime of the scope.
 */
const make = Effect.gen(function* () {
	const [gateway, db] = yield* Effect.all([DiscordGateway, DatabaseLive]);

	/**
	 * Handles the 'GUILD_CREATE' event from the gateway.
	 *
	 * When a new guild is created, this handler checks if the guild already exists in the database.
	 * If the guild does not exist, it inserts a new entry for the guild and logs the action.
	 * The operation is retried on failure with a 1-second interval between attempts.
	 *
	 * @remarks
	 * - Utilizes the Effect system for managing side effects and retries.
	 * - Ensures the database remains synchronized with the gateway's guild state.
	 */
	const guildCreate = gateway
		.handleDispatch('GUILD_CREATE', (guild) =>
			Effect.gen(function* () {
				// Get all guilds from the database
				const exists = yield* db.execute((c) =>
					c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id)).get()
				);

				// If the guild does not exist, add it to the database and log the action
				if (!exists) {
					yield* Effect.all([
						db.execute((c) => c.insert(db.schema.guilds).values({ id: guild.id })),
						Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${guild.id}`)),
					]);
				}
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	/**
	 * Handles the 'GUILD_DELETE' event from the gateway.
	 *
	 * When a guild is deleted, this handler removes the corresponding guild entry from the database,
	 * logs the removal, and retries the operation every second if an error occurs.
	 *
	 * @remarks
	 * - Uses an effectful approach to handle asynchronous operations and error logging.
	 * - Retries the deletion operation on failure, with a 1-second interval between attempts.
	 *
	 * @see Effect
	 * @see db.makeQuery
	 * @see Schedule.spaced
	 */
	const guildDelete = gateway
		.handleDispatch('GUILD_DELETE', (guild) =>
			Effect.gen(function* () {
				// Get all guilds from the database
				const exists = yield* db.execute((c) =>
					c.select().from(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id)).get()
				);

				// If the guild exists, remove it from the database and log the action
				if (!exists) return;
				yield* Effect.all([
					db.execute((c) => c.delete(db.schema.guilds).where(eq(db.schema.guilds.id, guild.id))),
					Effect.logInfo(formattedLog('Database', `Removed guild from DB: ${guild.id}`)),
				]);
			}).pipe(Effect.catchAllCause(Effect.logError))
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// Setup the listeners
	yield* Effect.all([
		Effect.forkScoped(guildCreate),
		Effect.forkScoped(guildDelete),
		Effect.logDebug(formattedLog('GuildWatcher', 'Interactions registered and running.')),
	]);
});

/**
 * A live instance of the GuildWatcher service layer.
 *
 * This layer is created using the `make` factory function and is scoped to the current context.
 * Use this to provide the GuildWatcher service in your application's dependency injection graph.
 */
export const GuildWatcherLive = Layer.scopedDiscard(make);
