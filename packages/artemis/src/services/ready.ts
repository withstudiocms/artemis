import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, PresenceUpdateStatus } from 'dfx/types';
import { Config, Effect, Layer, Option, Schedule } from 'effect';
import { formatArrayLog } from '../utils/log.ts';

const nodeEnv = Config.option(Config.string('NODE_ENV'));

const make = Effect.gen(function* () {
	const [gateway, config] = yield* Effect.all([DiscordGateway, nodeEnv]);

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
