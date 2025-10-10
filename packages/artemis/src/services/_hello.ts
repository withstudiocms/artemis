import { Ix } from 'dfx';
import { InteractionsRegistry } from 'dfx/gateway';
import { Effect, Layer } from 'effect';

// Create hello service
export const HelloLayer = Layer.effectDiscard(
	Effect.gen(function* () {
		const registry = yield* InteractionsRegistry;

		// Create hello command that responds with "Hello!"
		const hello = Ix.global(
			{
				name: 'hello',
				description: 'A basic command',
			},
			Effect.succeed({
				type: 4,
				data: {
					content: 'Hello!',
				},
			})
		);

		// register the command(s) and handle errors
		yield* registry.register(Ix.builder.add(hello).catchAllCause(Effect.logError));
	})
);
