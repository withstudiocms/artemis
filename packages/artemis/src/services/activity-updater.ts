import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, type GatewayPresenceUpdateData, PresenceUpdateStatus } from 'dfx/types';
import { Cron, Effect, Layer, Schedule } from 'effect';

/**
 * Represents the common presence state for a user.
 *
 * @property {PresenceUpdateStatus} status - The current online status of the user.
 * @property {number} since - The timestamp (in milliseconds) since the status was set.
 * @property {boolean} afk - Indicates whether the user is away from keyboard.
 */
const commonPresence = {
	status: PresenceUpdateStatus.Online,
	since: Date.now(),
	afk: false,
};

/**
 * An array of presence update objects for a Discord gateway.
 * 
 * Each object in the array represents a different presence state, 
 * extending the `commonPresence` object and specifying a unique activity.
 * 
 * These presence updates can be cycled or selected to reflect the bot's current status.
 * 
 * @type {GatewayPresenceUpdateData[]}
 */
const presenceUpdates: GatewayPresenceUpdateData[] = [
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Watching,
				name: 'for requests...',
			},
		],
	},
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Listening,
				name: 'the deep dark web...',
			},
		],
	},
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Playing,
				name: 'chess with myself...',
			},
		],
	},
];

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
 * - Sets up a cron schedule to trigger every 10 seconds.
 * - Defines an action that selects a random presence update and sends it via the gateway.
 * - Schedules the action to run according to the cron schedule, forking it as a scoped effect.
 *
 * @remarks
 * The cron expression `'*\/10 * * * * *'` ensures the action runs every 10 seconds.
 * The scheduled effect is forked to run in the background within the current scope.
 *
 * @returns An `Effect` that, when run, starts the scheduled presence update process.
 */
const make = Effect.gen(function* () {
	const [gateway] = yield* Effect.all([DiscordGateway]);

    // Define a cron expression
    const cron = Cron.unsafeParse('*/10 * * * * *'); // Every 10 seconds
    
    // Convert the Cron into a Schedule
    const schedule = Schedule.cron(cron);

    // Define the action to perform on each schedule tick
    const action = Effect.gen(function* () {
        const update = selectRandom(presenceUpdates);
        yield* gateway.send(SendEvent.presenceUpdate(update));
    });

    // Schedule the action to run according to the cron schedule
    yield* Effect.schedule(action, schedule).pipe(Effect.forkScoped);
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
