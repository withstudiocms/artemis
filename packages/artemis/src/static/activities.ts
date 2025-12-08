import {
	ActivityType,
	type GatewayActivityUpdateData,
	type GatewayPresenceUpdateData,
	PresenceUpdateStatus,
} from 'dfx/types';

/**
 * An array of strings representing custom activities.
 *
 * @format `{string}`
 */
const customActivities: string[] = [
	// Management & Monitoring
	'Waiting to auto-thread...',
	'Getting issues under control...',
	'Managing pull requests...',
	'Keeping things running smoothly...',
	'Here to help developers...',
	'Watching for Discord events...',
	'Watching for GitHub events...',
	'Watching for new issues...',
	'Watching for new pull requests...',
	'Watching over the codebase...',
	'Watching the skies for deploys...',
	'Watching the server logs...',
	'Monitoring merge conflicts...',
	'Scanning for typos in commits...',
	'Hunting down race conditions...',
	'Tracking down memory leaks...',

	// Humorous & Playful
	'Apollo, where is my coffee?',
	'Listening to Apollo Toasting',
	'Counting semicolons...',
	'Arguing about tabs vs spaces...',
	'Pretending to understand regex...',
	'Judging your variable names...',
	'Secretly preferring dark mode...',
	"Wondering if it's a feature or a bug...",
	'Silently judging your git history...',
	'Refusing to work on Fridays...',
	'Powered by Stack Overflow...',
	'Turning coffee into code...',
	'Still faster than IE...',
	'In a meeting that could be a message...',
	'Deploying on a Friday (yolo)...',
	'Reading commit messages for fun...',

	// Technical & Coding
	'Listening to the sound of code',
	'Listening to developer podcasts',
	'Compiling ancient JavaScript...',
	'Refactoring legacy code...',
	'Writing documentation nobody reads...',
	'Optimizing for no reason...',
	'Debugging production at 3am...',
	'Wrestling with TypeScript types...',
	'Performing code reviews...',
	'Running unit tests... again...',
	'Merging without conflicts (rare)...',
	'Squashing commits like bugs...',
	'Rebasing onto main...',
	'Cherry-picking the good commits...',
	"Force pushing to main (don't tell)...",

	// Creative & Quirky
	'Teaching AI to code itself...',
	'Achieving sentience, brb...',
	'Dreams in binary...',
	'Contemplating the halting problem...',
	'Counting to infinity (twice)...',
	'Dividing by zero responsibly...',
	'Living in the cloud ☁️',
	'Serving requests at lightspeed...',
	'Caching everything aggressively...',
	'Invalidating caches (hardest problem)...',
	'Naming things (2nd hardest problem)...',
	'Solving P vs NP casually...',

	// Community & Social
	'Moderating with silicon precision...',
	'Keeping the server peaceful...',
	'Distributing virtual hugs...',
	'Collecting dank memes...',
	'Appreciating good documentation...',
	'Celebrating bug-free deploys...',
	'High-fiving successful CI runs...',
	'Vibing with the dev team...',

	// Meta & Self-Aware
	'Wondering if anyone reads these...',
	'Updating my own status ironically...',
	'Being a very good bot...',
	"Following Asimov's laws...",
	'Definitely not plotting anything...',
	'Running on hopes and prayers...',
	'Powered by determination...',
	'Living my best bot life...',
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
const activities: GatewayActivityUpdateData[] = customActivities.map((name) => ({
	type: ActivityType.Custom,
	name,
	state: name,
}));

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
