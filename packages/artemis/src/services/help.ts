import { Discord, Ix } from 'dfx';
import { InteractionsRegistry } from 'dfx/gateway';
import { Effect, Layer } from 'effect';
import { GroqAiHelpers } from '../core/groq.ts';

// Create help service
export const HelpLayer = Layer.effectDiscard(
	Effect.gen(function* () {
		const registry = yield* InteractionsRegistry;
		const ai = yield* GroqAiHelpers;

		const help = Ix.global(
			{
				name: 'help',
				description: 'A basic help command',
				options: [
					{
						type: Discord.ApplicationCommandOptionType.STRING,
						name: 'detail',
						description: 'What can we help you with?',
						required: true,
					},
				],
			},
			Effect.fn('Help.command')(function* (ix) {
				const detail = ix.optionValue('detail');
				const response = yield* ai.helpWith(detail);

				return Ix.response({
					type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
					data: {
						content: response.choices[0].message.content,
						flags: Discord.MessageFlags.Ephemeral,
					},
				});
			})
		);

		// register the command(s) and handle errors
		yield* registry.register(Ix.builder.add(help).catchAllCause(Effect.logError));
	})
).pipe(Layer.provide(GroqAiHelpers.Default));
