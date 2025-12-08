import { DiscordGateway } from 'dfx/DiscordGateway';
import { DiscordREST } from 'dfx/DiscordREST';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, type APIUnavailableGuild, PresenceUpdateStatus } from 'dfx/types';
import { Effect, Layer } from 'effect';
import { DatabaseLive } from '../core/db-client.ts';
import { nodeEnv } from '../static/env.ts';
import { delayByOneSecond, effectSleep2Seconds, spacedOnceSecond } from '../static/schedules.ts';
import { formatArrayLog, formattedLog } from '../utils/log.ts';
import { editPTALEmbed } from '../utils/ptal.ts';

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
	const [gateway, env, db, rest] = yield* Effect.all([
		DiscordGateway,
		nodeEnv,
		DatabaseLive,
		DiscordREST,
	]);

	// Handler to update a single PTAL message
	const handlePTALUpdate = Effect.fn(function* (ptal: typeof db.schema.ptalTable.$inferSelect) {
		// Fetch the channel and edit the PTAL embed with a delay
		const channel = yield* effectSleep2Seconds.pipe(() => rest.getChannel(ptal.channel));

		// If the channel does not exist, continue to the next message
		if (!channel) return;

		// Edit the PTAL embed with a delay to respect rate limits
		yield* effectSleep2Seconds.pipe(() => editPTALEmbed(ptal));
	});

	// Function to handle guild updates in the database
	const handleGuildUpdate = (
		guildList: {
			id: string;
			ptal_announcement_role: string | null;
		}[],
		currentGuild: APIUnavailableGuild
	) =>
		Effect.gen(function* () {
			// Check if the guild already exists in the database
			const exists = guildList.find((g) => g.id === currentGuild.id);

			// If the guild does not exist, add it to the database and log the action
			if (!exists) {
				yield* Effect.all([
					db.execute((c) => c.insert(db.schema.guilds).values({ id: currentGuild.id })),
					Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${currentGuild.id}`)),
				]);
			}
		});

	/**
	 * Updates all PTAL messages in the database by editing their embeds.
	 *
	 * This effect:
	 * - Fetches all PTAL messages from the database.
	 * - Iterates through each message, fetching the corresponding channel and editing the PTAL embed.
	 * - Introduces a 2-second delay between processing each message to avoid rate limits.
	 * - Logs a completion message once all PTAL messages have been updated.
	 *
	 * @remarks
	 * This effect is triggered upon receiving the 'READY' event to ensure all PTAL messages are up to date.
	 */
	const updatePTALs = db
		.execute((c) => c.select().from(db.schema.ptalTable))
		.pipe(
			Effect.flatMap(Effect.forEach(handlePTALUpdate)),
			// Log completion of PTAL messages update
			Effect.tap(() => Effect.logInfo(formattedLog('PTAL', 'PTAL messages have been updated.'))),
			Effect.catchAllCause(Effect.logError)
		);

	/**
	 * Handles the 'READY' event from the Discord gateway.
	 *
	 * When the bot receives the 'READY' event, this handler logs relevant information,
	 */
	const ready = gateway
		.handleDispatch('READY', (readyData) =>
			Effect.gen(function* () {
				const [dbConnected] = yield* Effect.all([
					Effect.gen(function* () {
						yield* Effect.all([
							db.execute((c) => c.$client.execute('SELECT CURRENT_TIMESTAMP')),
							Effect.logInfo(formattedLog('Database', 'Successfully connected to the database.')),
						]);
						return true;
					}).pipe(
						Effect.catchAll((err) =>
							Effect.logError(
								formattedLog('Database', `Failed to connect to the database: ${err.message}`)
							).pipe(Effect.as(false))
						)
					),
					gateway.send(
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
					),
					...formatArrayLog('Discord', [
						`Environment: ${env}`,
						`User: ${readyData.user.username}`,
						`ID: ${readyData.user.id}`,
						`Guilds: ${readyData.guilds.length}`,
						`Invite URL: https://discord.com/oauth2/authorize?client_id=${readyData.user.id}`,
					]),
					Effect.logInfo(formattedLog('Discord', 'Initialized bot configuration.')),
				]);

				if (dbConnected) {
					yield* db
						.execute((c) => c.select().from(db.schema.guilds))
						.pipe(
							Effect.flatMap((guildList) =>
								Effect.forEach(readyData.guilds, (currentGuild) =>
									handleGuildUpdate(guildList, currentGuild)
								)
							)
						);

					// Update ptal messages after ensuring guilds are synced
					yield* Effect.forkScoped(Effect.schedule(updatePTALs, delayByOneSecond));
				}
			})
		)
		.pipe(Effect.retry(spacedOnceSecond));

	// Setup the listeners
	yield* Effect.all([
		Effect.forkScoped(ready),
		Effect.logDebug(formattedLog('Discord', 'Interactions registered and running.')),
	]);
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
