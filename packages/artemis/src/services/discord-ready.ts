import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, PresenceUpdateStatus } from 'dfx/types';
import { Effect, Layer, Schedule } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { nodeEnv } from '../static/env.ts';
import { formatArrayLog, formattedLog } from '../utils/log.ts';

/**
 * Initializes the application by handling the Discord 'READY' event.
 *
 * This effect performs the following actions:
 * - Retrieves the Discord gateway, environment configuration, and database connection.
 * - Logs environment and user details upon receiving the 'READY' event from Discord.
 * - Tests the database connection and logs the result.
 * - Ensures all guilds from the Discord 'READY' event exist in the database, adding any missing guilds.
 * - Sets the initial bot presence to "Watching for requests...".
 * - Retries the 'READY' event handler on failure, with a 1-second interval, and runs it in a scoped fork.
 *
 * @remarks
 * This effect is intended to be run at application startup to ensure the bot is ready and the database is synchronized with Discord guilds.
 */
const make = Effect.gen(function* () {
	const [gateway, env, db] = yield* Effect.all([DiscordGateway, nodeEnv, DatabaseLive]);

	/**
	 * Handles the 'READY' event from the Discord gateway.
	 *
	 * When the bot receives the 'READY' event, this handler logs relevant information,
	 */
	const ready = gateway
		.handleDispatch('READY', (readyData) =>
			Effect.gen(function* () {
				// Log relevant information from the READY event
				yield* Effect.all(
					formatArrayLog('Discord', [
						`Environment: ${env}`,
						`User: ${readyData.user.username}`,
						`ID: ${readyData.user.id}`,
						`Guilds: ${readyData.guilds.length}`,
						`Invite URL: https://discord.com/oauth2/authorize?client_id=${readyData.user.id}`,
					])
				);

				/**
				 * Tests the database connection by executing a simple query.
				 * Logs success or failure of the connection attempt.
				 */
				const dbConnectTest = Effect.gen(function* () {
					yield* db.execute((c) => c.$client.execute('SELECT CURRENT_TIMESTAMP'));
					yield* Effect.logInfo(
						formattedLog('Database', 'Successfully connected to the database.')
					);
					return true;
				}).pipe(
					Effect.catchAll((err) =>
						Effect.logError(
							formattedLog('Database', `Failed to connect to the database: ${err.message}`)
						).pipe(Effect.as(false))
					)
				);

				// Test DB connection
				const dbConnected = yield* dbConnectTest;

				if (dbConnected) {
					// Fetch all guilds from the database
					const guilds = yield* db.execute((c) => c.select().from(db.schema.guilds));

					/**
					 * Creates a new guild entry in the database.
					 *
					 * @param id - The ID of the guild to be added.
					 * @yields The result of the database insertion operation.
					 * @returns An effect that resolves when the guild has been added to the database.
					 * @remarks
					 * Utilizes the `makeQuery` method from the Database service to perform the insertion.
					 */
					const createNewGuild = db.makeQuery((ex, id: string) =>
						ex((c) => c.insert(db.schema.guilds).values({ id }))
					);

					// Ensure all guilds from the READY event are in the database
					yield* Effect.forEach(readyData.guilds, (guild) =>
						Effect.gen(function* () {
							// Check if the guild already exists in the database
							const exists = guilds.find((g) => g.id === guild.id);

							// If the guild does not exist, add it to the database and log the action
							if (!exists) {
								yield* createNewGuild(guild.id);
								yield* Effect.logInfo(
									formattedLog('Database', `Added new guild to DB: ${guild.id}`)
								);
							}
						})
					);
				}

				// Set initial presence
				yield* gateway.send(
					SendEvent.presenceUpdate({
						status: PresenceUpdateStatus.Online,
						since: Date.now(),
						afk: false,
						activities: [
							{
								type: ActivityType.Custom,
								name: 'Booting up...',
								state: 'Booting up...',
							},
						],
					})
				);

				yield* Effect.logInfo(formattedLog('Discord', 'Initialized bot configuration.'));
			})
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')));

	// Setup the listeners
	yield* Effect.forkScoped(ready);
	yield* Effect.logDebug(formattedLog('Discord', 'Interactions registered and running.'));
});

/**
 * A live Layer instance that is initialized using the `make` function.
 * This layer is scoped and discards its resource when no longer needed.
 *
 * @remarks
 * Typically used to provide a ready-to-use implementation of a service within a scoped context.
 *
 * @see {@link Layer.scopedDiscard}
 * @see {@link make}
 */
export const DiscordReadyLive = Layer.scopedDiscard(make);
