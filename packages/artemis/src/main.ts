import { NodeRuntime } from '@effect/platform-node';
import { Config, Effect, Layer, Logger, LogLevel, RuntimeFlags } from 'effect';
import { DiscordGatewayLayer } from './core/discord-gateway.ts';
import { AutoThreadsLive } from './services/auto-threads.ts';
import { GatewayWatcherLive } from './services/gateway-watcher.ts';
import { HTTPServerLive } from './services/http.ts';
import { IssueLive } from './services/issue.ts';
import { ReadyLive } from './services/ready.ts';
import { Github } from './core/github.ts';

// Create a layer to set log level based on DEBUG env var
const LogLevelLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const debug = yield* Config.withDefault(Config.boolean('DEBUG'), false);
		const level = debug ? LogLevel.All : LogLevel.Info;
		return Logger.minimumLogLevel(level);
	})
);

// Combine all dependencies for the bot
const BotDepsLive = Layer.mergeAll(
	DiscordGatewayLayer,
	LogLevelLive,
	RuntimeFlags.disableRuntimeMetrics,
	Github.Default
);

// Combine all Bot layers and provide DiscordGatewayLayer
const ArtemisBotLive = Layer.mergeAll(
	ReadyLive,
	HTTPServerLive,
	AutoThreadsLive,
	IssueLive,
	GatewayWatcherLive
).pipe(Layer.provide(BotDepsLive));

// Run the bot
NodeRuntime.runMain(Layer.launch(ArtemisBotLive));
