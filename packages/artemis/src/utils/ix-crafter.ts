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

export class IxCrafter<R, E extends never, S1, S2, S3> {
	private builder: Ix.InteractionBuilder<E, R, DiscordRESTError>;
	private scheduledTasks: Array<ScheduledTaskOpts<S1, S2, S3>>;

	constructor() {
		this.builder = Ix.builder;
		this.scheduledTasks = [];
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
	 * Define a new scheduled task.
	 */
	scheduledTask<A extends S1, E extends S2, R extends S3>(opts: ScheduledTaskOpts<A, E, R>) {
		this.scheduledTasks.push(opts);
		return this;
	}

	/**
	 * Build components to be registered using `Effect.all`.
	 */
	build(registry: InteractionsRegistryService) {
		const ixRegistry = this.builder.catchAllCause(Effect.logError);
		const commandRegistry = registry.register(ixRegistry);

		const tasks = this.scheduledTasks.map(({ task, schedule }) =>
			Effect.schedule(task, schedule).pipe(Effect.forkScoped)
		);

		return [commandRegistry, ...tasks] as const;
	}
}
