import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, type GatewayPresenceUpdateData, PresenceUpdateStatus } from 'dfx/types';
import { Cron, Effect, Layer, Schedule } from 'effect';

const commonPresence = {
	status: PresenceUpdateStatus.Online,
	since: Date.now(),
	afk: false,
};

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

function selectRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

const make = Effect.gen(function* () {
	const [gateway] = yield* Effect.all([DiscordGateway]);

    const cron = Cron.unsafeParse('*/10 * * * * *'); // Every 10 seconds
    
    // Convert the Cron into a Schedule
    const schedule = Schedule.cron(cron);

    const action = Effect.gen(function* () {
        const update = selectRandom(presenceUpdates);
        yield* gateway.send(SendEvent.presenceUpdate(update));
    });

    // Schedule the action to run every 10 seconds
    yield* Effect.schedule(action, schedule).pipe(Effect.forkScoped);
});

export const ActivityUpdaterLive = Layer.scopedDiscard(make);
