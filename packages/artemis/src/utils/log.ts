import { Effect } from 'effect';

export function formattedLog(prefix: string, message: string): string {
	return `[ArtemisBot:${prefix}] ${message}`;
}

export function formatArrayLog(prefix: string, messages: string[]) {
	return messages.map((msg) => Effect.log(formattedLog(prefix, msg)));
}
