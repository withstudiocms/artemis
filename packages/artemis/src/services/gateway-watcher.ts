import { DiscordGateway } from 'dfx/DiscordGateway';
import { Effect, Layer, Schedule } from 'effect';
import { Database } from '../db/client.ts';

const make = Effect.gen(function* () {
	const [gateway, db] = yield* Effect.all([DiscordGateway, Database]);

	yield* gateway
		.handleDispatch('GUILD_CREATE', (guild) =>
			Effect.gen(function* () {
				const guilds = yield* db.execute((c) => c.select().from(db.schema.guilds));

				const createNewGuild = db.makeQuery((ex, id: string) =>
					ex((c) => c.insert(db.schema.guilds).values({ id }))
				);
				const exists = guilds.find((g) => g.id === guild.id);
				if (!exists) {
					yield* createNewGuild(guild.id);
					yield* Effect.logInfo(`[Database] Added new guild to DB: ${guild.id}`);
				}
			})
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')), Effect.forkScoped);
});

export const GatewayWatcherLive = Layer.scopedDiscard(make);
