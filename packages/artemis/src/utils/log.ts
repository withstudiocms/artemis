export function formattedLog(prefix: string, message: string): string {
	return `[ArtemisBot:${prefix}] ${message}`;
}

export function formatArrayLog(prefix: string, messages: string[]): string {
	return messages.map((msg) => formattedLog(prefix, msg)).join('\n');
}
