import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import {
	ActivityType,
	type GatewayActivityUpdateData,
	type GatewayPresenceUpdateData,
} from 'dfx/types';
import { Cron, Effect, Layer, Schedule } from 'effect';
import { presenceUpdates } from '../static/activities.ts';
import { presenceSchedule, presenceTimezone } from '../static/env.ts';
import { formattedLog } from '../utils/log.ts';

/**
 * Create a human-readable log message for an activity update.
 *
 * Maps the activity's type to a friendly label (for example "Playing", "Streaming",
 * "Listening to", "Watching", "Competing in", or "Custom status set to") and returns
 * the label followed by the activity name in quotes.
 *
 * @param activity - The activity update payload. Expected to include `type` and `name`.
 * @returns A formatted string describing the update, e.g. `Playing "Game Name"`.
 *
 * @example
 * // Produces: Playing "Chess"
 * buildUpdateLog({ type: ActivityType.Playing, name: 'Chess' });
 */
function buildUpdateLog(activity: GatewayActivityUpdateData) {
	const labelMap: Record<ActivityType, string> = {
		[ActivityType.Playing]: 'Playing',
		[ActivityType.Streaming]: 'Streaming',
		[ActivityType.Listening]: 'Listening to',
		[ActivityType.Watching]: 'Watching',
		[ActivityType.Competing]: 'Competing in',
		[ActivityType.Custom]: 'Custom status set to',
	};
	const label = labelMap[activity.type] || 'Activity set to';
	return `${label} "${activity.name}"`;
}

/**
 * Selects and returns a random element from the provided array.
 *
 * @typeParam T - The type of elements in the array.
 * @param arr - The array to select a random element from.
 * @returns A randomly selected element from the array.
 * @throws {RangeError} If the array is empty.
 */
function selectRandom<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Creates an effect that schedules a periodic presence update action.
 *
 * This generator function:
 * - Retrieves the Discord gateway instance.
 * - Sets up a cron schedule to trigger every 5 minutes by default.
 * - Defines an action that selects a random presence update and sends it via the gateway.
 * - Schedules the action to run according to the cron schedule, forking it as a scoped effect.
 *
 * @remarks
 * The cron expression `'*\/5 * * * *'` ensures the action runs every 5 minutes by default.
 * The scheduled effect is forked to run in the background within the current scope.
 *
 * @returns An `Effect` that, when run, starts the scheduled presence update process.
 */
const make = Effect.gen(function* () {
	const [gateway, cronConfig, cronTZ] = yield* Effect.all([
		DiscordGateway,
		presenceSchedule,
		presenceTimezone,
	]);

	// Convert the Cron into a Schedule
	const schedule = Schedule.cron(Cron.unsafeParse(cronConfig, cronTZ));

	// create a cache to store the current presence
	let currentPresence: GatewayPresenceUpdateData | null = null;

	// Define the action to perform on each schedule tick
	const action = Effect.gen(function* () {
		let update = selectRandom(presenceUpdates);

		// If the selected presence is the same as the current one, select again
		if (currentPresence && currentPresence.activities[0].name === update.activities[0].name) {
			yield* Effect.logDebug(
				formattedLog('Presence', 'Selected presence is the same as current, selecting a new one...')
			);
			let newUpdate: GatewayPresenceUpdateData;
			do {
				newUpdate = selectRandom(presenceUpdates);
			} while (newUpdate.activities[0].name === currentPresence.activities[0].name);
			currentPresence = newUpdate;
			update = newUpdate;
			yield* Effect.logDebug(formattedLog('Presence', 'New presence selected.'));
		} else {
			yield* Effect.logDebug(
				formattedLog('Presence', 'Selected presence is different from current, keeping it.')
			);
			currentPresence = update;
		}

		yield* Effect.all([
			Effect.logDebug(
				formattedLog('Presence', `Updating presence: ${buildUpdateLog(update.activities[0])}`)
			),
			// Send the presence update to the gateway
			gateway.send(SendEvent.presenceUpdate(update)),
			Effect.logDebug(formattedLog('Presence', 'Presence updated successfully')),
		]);
	});

	yield* Effect.all([
		Effect.schedule(
			action,
			Schedule.addDelay(Schedule.once, () => '15 seconds')
		).pipe(Effect.forkScoped),
		Effect.schedule(action, schedule).pipe(Effect.forkScoped),
		Effect.logDebug(formattedLog('Presence', 'Interactions registered and running.')),
	]);
});

/**
 * A live implementation of the ActivityUpdater service layer.
 *
 * This layer is created using the `make` factory function and is scoped to the current context.
 * Use this export to provide the ActivityUpdater service in a live environment.
 *
 * @see Layer.scopedDiscard
 * @see make
 */
export const ActivityUpdaterLive = Layer.scopedDiscard(make);
