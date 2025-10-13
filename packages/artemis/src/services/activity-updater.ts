import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, GatewayActivityUpdateData, type GatewayPresenceUpdateData, PresenceUpdateStatus } from 'dfx/types';
import { Config, ConfigProvider, Cron, Effect, Layer, Schedule } from 'effect';
import { formattedLog } from '../utils/log.ts';

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
				name: 'for Discord events...',
			},
		],
	},
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Watching,
				name: 'for GitHub events...',
			},
		],
	},
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Custom,
				name: 'Waiting to auto-thread...',
				state: 'Waiting to auto-thread...',
			},
		],
	},
	{
		...commonPresence,
		activities: [
			{
				type: ActivityType.Custom,
				name: 'Getting issues under control...',
				state: 'Getting issues under control...',
			},
		],
	},
];

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
 * - Sets up a cron schedule to trigger every 10 minutes by default.
 * - Defines an action that selects a random presence update and sends it via the gateway.
 * - Schedules the action to run according to the cron schedule, forking it as a scoped effect.
 *
 * @remarks
 * The cron expression `'*\/10 * * * *'` ensures the action runs every 10 minutes by default.
 * The scheduled effect is forked to run in the background within the current scope.
 *
 * @returns An `Effect` that, when run, starts the scheduled presence update process.
 */
const make = Effect.gen(function* () {
	const [gateway] = yield* Effect.all([DiscordGateway]);
        
    // Get the cron expression from config, defaulting to every 10 minutes
	const cronConfig = yield* Config.string('CRON_SCHEDULE').pipe(Config.withDefault('*/10 * * * *'));
    const cronTZ = yield* Config.string('CRON_TIMEZONE').pipe(Config.withDefault('UTC'));

    // Parse the cron expression
	const cron = Cron.unsafeParse(cronConfig, cronTZ);

	// Convert the Cron into a Schedule
	const schedule = Schedule.cron(cron);

    // create a cache to store the current presence
    let currentPresence: GatewayPresenceUpdateData | null = null;

	// Define the action to perform on each schedule tick
	const action = Effect.gen(function* () {
		let update = selectRandom(presenceUpdates);

        if (currentPresence && currentPresence.activities[0].name === update.activities[0].name) {
            // If the selected presence is the same as the current one, select again
            let newUpdate;
            do {
                newUpdate = selectRandom(presenceUpdates);
            } while (newUpdate.activities[0].name === currentPresence.activities[0].name);
            currentPresence = newUpdate;
            update = newUpdate;
        } else {
            currentPresence = update;
        }

        // Send the presence update to the gateway

		yield* gateway.send(SendEvent.presenceUpdate(update));
        yield* Effect.log(formattedLog('Presence', buildUpdateLog(update.activities[0])));
	});

	// Set the initial presence after starting the service delayed by 10 seconds
	yield* Effect.schedule(
		action,
		Schedule.addDelay(Schedule.once, () => '10 seconds')
	).pipe(Effect.forkScoped);

	// Schedule the action to run according to the cron schedule
	yield* Effect.schedule(action, schedule).pipe(Effect.forkScoped);
}).pipe(
    Effect.withConfigProvider(
        ConfigProvider.fromEnv().pipe(
            ConfigProvider.nested('PRESENCE'),
            ConfigProvider.constantCase
        )
    )
);

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
