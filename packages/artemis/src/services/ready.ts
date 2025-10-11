import { DiscordGateway } from 'dfx/DiscordGateway';
import { Config, Effect, Layer, Option, Schedule } from 'effect';

const nodeEnv = Config.option(Config.string('NODE_ENV'));

const make = Effect.gen(function* () {
	const gateway = yield* DiscordGateway;
	const config = yield* nodeEnv;
	const env = Option.getOrElse(config, () => 'development');
	yield* Effect.log(`Logging in as ${env}`);
	yield* Effect.log(`Environment: ${env}`);
	yield* gateway
		.handleDispatch('READY', (readyData) =>
			Effect.log(
				`\n	Logged in as ${readyData.user.username}\nID: ${readyData.user.id}\nGuilds: ${readyData.guilds.length}`
			)
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')), Effect.forkScoped);
}).pipe(Effect.annotateLogs({ service: 'onReady Service' }));

export const ReadyLive = Layer.scopedDiscard(make);
