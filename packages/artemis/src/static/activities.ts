import {
	ActivityType,
	type GatewayActivityUpdateData,
	type GatewayPresenceUpdateData,
	PresenceUpdateStatus,
} from 'dfx/types';

/**
 * An array of strings representing activities related to watching.
 *
 * @format `Watching {string}`
 */
const watchingActivities: string[] = [
	'for Discord events...',
	'for GitHub events...',
	'for new issues...',
	'for new pull requests...',
	'over the codebase...',
	'the skies for deploys...',
	'the server logs...',
];

/** An array of strings representing activities related to listening.
 *
 * @format `Listening to {string}`
 */
const listeningActivities: string[] = [
	'Apollo Toasting',
	'the sound of code',
	'developer podcasts',
];

/**
 * An array of strings representing custom activities.
 *
 * @format `{string}`
 */
const customActivities: string[] = [
	'Waiting to auto-thread...',
	'Getting issues under control...',
	'Managing pull requests...',
	'Keeping things running smoothly...',
	'Here to help developers...',
	'Apollo, where is my coffee?',
];

/**
 * An array of activity update data objects for a Discord gateway.
 *
 * Each object in the array represents a different activity type and name,
 * constructed from predefined lists of watching, listening, and custom activities.
 *
 * These activities can be used to set or update the presence of a bot or user on Discord.
 *
 * @type {GatewayActivityUpdateData[]}
 */
const activities: GatewayActivityUpdateData[] = [
	...watchingActivities.map((name) => ({
		type: ActivityType.Watching,
		name,
	})),
	...listeningActivities.map((name) => ({
		type: ActivityType.Listening,
		name,
	})),
	...customActivities.map((name) => ({
		type: ActivityType.Custom,
		name,
		state: name,
	})),
];

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
export const presenceUpdates: GatewayPresenceUpdateData[] = activities.map((activity) => ({
	...commonPresence,
	activities: [activity],
}));
