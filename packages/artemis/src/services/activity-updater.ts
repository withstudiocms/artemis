import { DiscordGateway } from 'dfx/DiscordGateway';
import { SendEvent } from 'dfx/gateway';
import { ActivityType, type GatewayPresenceUpdateData, PresenceUpdateStatus } from 'dfx/types';
import { Effect, Layer } from 'effect';

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

const make = Effect.gen(function* () {
	const [gateway] = yield* Effect.all([DiscordGateway]);

	// Cycle through activities every 10 seconds
	yield* Effect.forever(
		Effect.gen(function* () {
			for (const update of presenceUpdates) {
				yield* gateway.send(SendEvent.presenceUpdate(update));
				yield* Effect.sleep('10 seconds');
			}
		}).pipe(Effect.forkScoped)
	).pipe(Effect.forkScoped);
});

export const ActivityUpdaterLive = Layer.scopedDiscard(make);
