import type { HttpServer } from '@effect/platform';
import { Context, Effect, Layer } from 'effect';
import { formatArrayLog } from './log.ts';

/** @internal */
export const formatAddress = (address: HttpServer.Address): string => {
	switch (address._tag) {
		case 'UnixAddress':
			return `unix://${address.path}`;
		case 'TcpAddress':
			return `http://${address.hostname}:${address.port}`;
	}
};

/** @internal */
export const serverTag = Context.GenericTag<HttpServer.HttpServer>('@effect/platform/HttpServer');

/** @internal */
export const addressFormattedWith = <A, E, R>(
	effect: (address: string) => Effect.Effect<A, E, R>
): Effect.Effect<A, E, HttpServer.HttpServer | R> =>
	Effect.flatMap(serverTag, (server) => effect(formatAddress(server.address)));

/** @internal */
export const logAddress: Effect.Effect<void, never, HttpServer.HttpServer> = addressFormattedWith(
	(_) =>
		Effect.all(
			formatArrayLog('Http', [
				'Server started',
				`Listening on ${_}`,
				'Listening for GitHub webhooks...',
			])
		)
);

/** @internal */
export const withLogAddress = <A, E, R>(
	layer: Layer.Layer<A, E, R>
): Layer.Layer<A, E, R | Exclude<HttpServer.HttpServer, A>> =>
	Layer.effectDiscard(logAddress).pipe(Layer.provideMerge(layer));

export const getHtmlFilePath = (fileName: string): string => {
	return `/prod/artemis/html/${fileName}`;
};
