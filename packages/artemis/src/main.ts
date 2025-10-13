/**
 * The main entry point for the Artemis bot application.
 *
 * This module sets up and launches the Artemis bot by
 * 		composing and providing all required service layers,
 * including Discord gateway integration, logging configuration,
 * 		runtime flag settings, GitHub integration,
 * readiness checks, HTTP server, auto-thread management, issue handling,
 * 		and gateway event watching.
 *
 * @remarks
 * - Uses `effect` and `@effect/platform-node` for effectful resource management and runtime.
 * - Dynamically configures log level based on the `DEBUG` environment variable.
 * - Disables runtime metrics collection for performance.
 * - Bootstraps the bot in a live (production) environment by launching the composed service layer.
 *
 */

import { NodeRuntime } from '@effect/platform-node';
import { Config, Effect, Layer, Logger, LogLevel, RuntimeFlags } from 'effect';
import { DiscordGatewayLayer } from './core/discord-gateway.ts';
import { Github } from './core/github.ts';
import { AutoThreadsLive } from './services/auto-threads.ts';
import { GatewayWatcherLive } from './services/gateway-watcher.ts';
import { HTTPServerLive } from './services/http.ts';
import { IssueLive } from './services/issue.ts';
import { ReadyLive } from './services/ready.ts';

/**
 * A Layer that sets the minimum log level for the application's logger based on the `DEBUG` configuration.
 *
 * - If `DEBUG` is enabled (true), sets the log level to `LogLevel.All` (most verbose).
 * - If `DEBUG` is disabled (false or not set), sets the log level to `LogLevel.Info`.
 *
 * This Layer uses the `Config` service to read the `DEBUG` boolean value, defaulting to `false` if not specified.
 *
 * @remarks
 * This is useful for toggling verbose logging in development or production environments.
 */
const LogLevelLive = Layer.unwrapEffect(
	Effect.gen(function* () {
		const debug = yield* Config.withDefault(Config.boolean('DEBUG'), false);
		const level = debug ? LogLevel.All : LogLevel.Info;
		return Logger.minimumLogLevel(level);
	})
);

/**
 * Combines all required dependencies for the bot into a single Layer.
 *
 * This layer merges the Discord gateway, logging configuration, runtime flag settings,
 * and the default GitHub integration, providing a unified dependency environment
 * for the application.
 *
 * @remarks
 * - `DiscordGatewayLayer`: Handles Discord gateway connections.
 * - `LogLevelLive`: Configures the application's logging level.
 * - `RuntimeFlags.disableRuntimeMetrics`: Disables runtime metrics collection.
 * - `Github.Default`: Provides default GitHub integration.
 *
 * @see Layer.mergeAll
 */
const BotDepsLive = Layer.mergeAll(
	DiscordGatewayLayer,
	LogLevelLive,
	RuntimeFlags.disableRuntimeMetrics,
	Github.Default
);

/**
 * Composes the main Artemis bot live environment by merging all required service layers,
 * including readiness, HTTP server, auto-thread management, issue handling, and gateway watching.
 * The resulting layer is provided with the necessary bot dependencies.
 *
 * @remarks
 * This layer should be used to bootstrap the Artemis bot in a live (production) environment.
 *
 * @see {@link ReadyLive}
 * @see {@link HTTPServerLive}
 * @see {@link AutoThreadsLive}
 * @see {@link IssueLive}
 * @see {@link GatewayWatcherLive}
 * @see {@link BotDepsLive}
 */
const ArtemisBotLive = Layer.mergeAll(
	ReadyLive,
	HTTPServerLive,
	AutoThreadsLive,
	IssueLive,
	GatewayWatcherLive
).pipe(Layer.provide(BotDepsLive));

// Launch the Artemis bot application using the composed live layer.
NodeRuntime.runMain(Layer.launch(ArtemisBotLive));
