import { DiscordGateway } from 'dfx/DiscordGateway';
import { Config, Effect, Layer, Option, Schedule } from 'effect';
import { formatArrayLog } from '../utils/log.ts';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, PresenceUpdateStatus } from 'dfx/types';

const nodeEnv = Config.option(Config.string('NODE_ENV'));

const make = Effect.gen(function* () {
	const gateway = yield* DiscordGateway;
	const config = yield* nodeEnv;
	const env = Option.getOrElse(config, () => 'development');
	yield* gateway
		.handleDispatch('READY', (readyData) =>
			Effect.all(
				formatArrayLog('Discord', [
					`Environment: ${env}`,
					`User: ${readyData.user.username}`,
					`ID: ${readyData.user.id}`,
					`Guilds: ${readyData.guilds.length}`,
				])
			)
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')), Effect.forkScoped);

	yield* gateway.send(
		SendEvent.presenceUpdate({
			status: PresenceUpdateStatus.Online,
			since: Date.now(),
			activities: [
				{
					type: ActivityType.Watching,
					name: 'for requests',
				}
			],
			afk: false,
		})
	)
});

export const ReadyLive = Layer.scopedDiscard(make);
