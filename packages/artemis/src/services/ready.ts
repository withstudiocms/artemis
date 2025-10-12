import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, PresenceUpdateStatus } from 'dfx/types';
import { Config, Effect, Layer, Option, Schedule } from 'effect';
import { Database } from '../db/client.ts';
import { formatArrayLog, formattedLog } from '../utils/log.ts';

const nodeEnv = Config.option(Config.string('NODE_ENV'));

const make = Effect.gen(function* () {
	const [gateway, config, db] = yield* Effect.all([DiscordGateway, nodeEnv, Database]);

	const env = Option.getOrElse(config, () => 'development');

	// Log the READY event details
	yield* gateway
		.handleDispatch('READY', (readyData) =>
			Effect.gen(function* () {
				// Log relevant information from the READY event
				yield* Effect.all(
					formatArrayLog('Discord', [
						`Environment: ${env}`,
						`User: ${readyData.user.username}`,
						`ID: ${readyData.user.id}`,
						`Guilds: ${readyData.guilds.length}`,
					])
				);

				const guilds = yield* db.execute((c) => c.select().from(db.schema.guilds));

				const createNewGuild = db.makeQuery((ex, id: string) =>
					ex((c) => c.insert(db.schema.guilds).values({ id }))
				);

				// Ensure all guilds from the READY event are in the database
				yield* Effect.forEach(readyData.guilds, (guild) =>
					Effect.gen(function* () {
						const exists = guilds.find((g) => g.id === guild.id);
						if (!exists) {
							yield* createNewGuild(guild.id);
							yield* Effect.logInfo(formattedLog('Database', `Added new guild to DB: ${guild.id}`));
						}
					})
				);

				// Set initial presence to "Watching for requests..."
				yield* gateway.send(
					SendEvent.presenceUpdate({
						status: PresenceUpdateStatus.Online,
						since: Date.now(),
						afk: false,
						activities: [
							{
								type: ActivityType.Watching,
								name: 'for requests...',
							},
						],
					})
				);
			})
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')), Effect.forkScoped);
});

export const ReadyLive = Layer.scopedDiscard(make);
