import { DiscordGateway } from 'dfx/DiscordGateway';
import type { GatewayReadyDispatchData } from 'dfx/types';
import { Config, Effect, Layer, Option, Schedule } from 'effect';

const nodeEnv = Config.option(Config.string('NODE_ENV'));

function buildFormattedMessage(data: { environment: string; readyData: GatewayReadyDispatchData }) {
	const message = `
+ --- Artemis Bot: Discord --- +
Environment: ${data.environment}
User: ${data.readyData.user.username}
ID: ${data.readyData.user.id}
Guilds: ${data.readyData.guilds.length}
+ ---------------------------- +`;

	return message;
}

const make = Effect.gen(function* () {
	const gateway = yield* DiscordGateway;
	const config = yield* nodeEnv;
	const env = Option.getOrElse(config, () => 'development');
	yield* gateway
		.handleDispatch('READY', (readyData) =>
			Effect.log(buildFormattedMessage({ environment: env, readyData }))
		)
		.pipe(Effect.retry(Schedule.spaced('1 seconds')), Effect.forkScoped);
}).pipe(Effect.annotateLogs({ service: 'onReady Service' }));

export const ReadyLive = Layer.scopedDiscard(make);
