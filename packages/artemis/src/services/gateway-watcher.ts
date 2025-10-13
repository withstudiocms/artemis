import { DiscordGateway } from 'dfx/DiscordGateway';
import { Effect, Layer, Schedule } from 'effect';
import { Database } from '../db/client.ts';
import { formattedLog } from '../utils/log.ts';

const make = Effect.gen(function* () {
	const [gateway, db] = yield* Effect.all([DiscordGateway, Database]);

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
				const guilds = yield* db.execute((c) => c.select().from(db.schema.guilds));

				// Utility function to create a new guild entry in the database
				const createNewGuild = db.makeQuery((ex, id: string) =>
					ex((c) => c.insert(db.schema.guilds).values({ id }))
				);

				// Check if the guild already exists in the database
				const exists = guilds.find((g) => g.id === guild.id);

				// If the guild does not exist, add it to the database and log the action
				if (!exists) {
					yield* createNewGuild(guild.id);
					yield* Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${guild.id}`));
				}
			})
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')));

	// Setup the listeners
	yield* Effect.forkScoped(guildCreate);
});

/**
 * A live instance of the GatewayWatcher service layer.
 *
 * This layer is created using the `make` factory function and is scoped to the current context.
 * Use this to provide the GatewayWatcher service in your application's dependency injection graph.
 */
export const GatewayWatcherLive = Layer.scopedDiscard(make);
