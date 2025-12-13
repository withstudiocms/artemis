import type { DiscordRESTError } from 'dfx/DiscordREST';
import type {
	Autocomplete,
	GlobalApplicationCommand,
	MessageComponent,
	ModalSubmit,
} from 'dfx/Interactions/definitions';
import type { InteractionsRegistryService } from 'dfx/Interactions/gateway';
import { Ix } from 'dfx/index';
import { Effect, type Schedule } from 'effect';

type SlashCmdOpts<C1, C2, A1, A2, M1, M2> = {
	command: GlobalApplicationCommand<C1, C2>;
	autocomplete?: Autocomplete<A1, A2>;
	modalSubmit?: ModalSubmit<M1, M2>;
};

type ScheduledTaskOpts<A, E, R> = {
	task: Effect.Effect<A, E, R>;
	// biome-ignore lint/suspicious/noConfusingVoidType: intended
	schedule: Schedule.Schedule<number, void | undefined, never>;
};

/**
 * A builder class for crafting Discord interactions and scheduled tasks.
 *
 * @template R - The requirements/dependencies type for the interaction builder
 * @template E - The error type (constrained to never)
 * @template S1 - The requirements type for scheduled tasks
 * @template S2 - The error type for scheduled tasks
 * @template S3 - The return type for scheduled tasks
 *
 * @example
 * ```typescript
 * const crafter = new IxCrafter()
 *   .slashCmd({
 *     command: myCommand,
 *     autocomplete: myAutocomplete,
 *     modalSubmit: myModalSubmit
 *   })
 *   .scheduledTask({
 *     task: myTask,
 *     schedule: Schedule.fixed("1 hour")
 *   })
 *   .build(registry);
 * ```
 */
export class IxCrafter<R, E extends never> {
	private builder: Ix.InteractionBuilder<E, R, DiscordRESTError>;

	constructor() {
		this.builder = Ix.builder;
	}

	/**
	 * Define a new slash command.
	 */
	slashCmd<C1, C2, A1, A2, M1, M2>(opts: SlashCmdOpts<C1, C2, A1, A2, M1, M2>) {
		this.builder.add(opts.command);
		if (opts.autocomplete) {
			this.builder.add(opts.autocomplete);
		}
		if (opts.modalSubmit) {
			this.builder.add(opts.modalSubmit);
		}
		return this;
	}

	/**
	 * Define a new message component.
	 */
	msgComponent<MC1, MC2>(comp: MessageComponent<MC1, MC2>) {
		this.builder.add(comp);
		return this;
	}

	/**
	 * Extend the interaction builder with a custom callback.
	 */
	builderExtend(
		cb: (
			builder: Ix.InteractionBuilder<E, R, DiscordRESTError>
		) => Ix.InteractionBuilder<E, R, DiscordRESTError>
	) {
		this.builder = cb(this.builder);
		return this;
	}

	/**
	 * Build components to be registered using `Effect.all`.
	 */
	build(registry: InteractionsRegistryService) {
		const ixRegistry = this.builder.catchAllCause(Effect.logError);
		const commandRegistry = registry.register(ixRegistry);

		return commandRegistry;
	}
}
