import { DiscordGateway } from 'dfx/DiscordGateway';
import { InteractionsRegistry } from 'dfx/gateway';
import { Discord, Ix, UI } from 'dfx/index';
import { Effect, Layer } from 'effect';

const make = Effect.gen(function* () {
	const gateway = yield* DiscordGateway;
	const registry = yield* InteractionsRegistry;

	const issue = Ix.global(
		{
			name: 'issue',
			type: Discord.ApplicationCommandType.MESSAGE,
		},
		Effect.succeed({
			type: Discord.InteractionCallbackTypes.MODAL,
			data: {
				custom_id: 'issue',
				title: 'Report an issue or bug',
				components: UI.singleColumn([
					UI.textInput({
						custom_id: 'title',
						label: 'Title',
						style: Discord.TextInputStyleTypes.SHORT,
						min_length: 5,
						max_length: 100,
						placeholder: 'A brief title for the issue',
						required: true,
					}),
					UI.textInput({
						custom_id: 'description',
						label: 'Description',
						style: Discord.TextInputStyleTypes.PARAGRAPH,
						min_length: 10,
						max_length: 4000,
						placeholder: 'Describe the issue in detail',
						required: true,
					}),
					UI.textInput({
						custom_id: 'steps',
						label: 'Steps to Reproduce',
						style: Discord.TextInputStyleTypes.PARAGRAPH,
						min_length: 10,
						max_length: 2000,
						placeholder: 'List the steps to reproduce the issue',
						required: false,
					}),
				]),
			},
		})
	);

	const ix = Ix.builder.add(issue).catchAllCause(Effect.logError);

	yield* registry.register(ix);

	yield* gateway
		.handleDispatch('INTERACTION_CREATE', (interaction) =>
			Effect.try(() => {
				if (
					interaction.type === Discord.InteractionTypes.MODAL_SUBMIT &&
					interaction.data.custom_id === 'issue'
				) {
					return Effect.gen(function* () {
						const title = yield* Ix.modalValue('title');
						const description = yield* Ix.modalValue('description');
						const steps = yield* Ix.modalValue('steps');

						// Here you would typically send this data to your issue tracking system
						yield* Effect.log(
							`New Issue Reported:\nTitle: ${title}\nDescription: ${description}\nSteps: ${steps || 'N/A'}`
						);

						return Ix.response({
							type: Discord.InteractionCallbackTypes.CHANNEL_MESSAGE_WITH_SOURCE,
							data: {
								content: 'Thank you for reporting the issue! Our team will look into it.',
								flags: Discord.MessageFlags.Ephemeral,
							},
						});
					}).pipe(Effect.withSpan('IssueCommandHandler'));
				}
			})
		)
		.pipe(Effect.forkScoped);
}).pipe(Effect.annotateLogs({ service: 'Issue Service' }));

export const IssueLive = Layer.scopedDiscard(make);
