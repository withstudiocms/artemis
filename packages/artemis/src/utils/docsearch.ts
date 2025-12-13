import {
	type APIChatInputApplicationCommandInteractionData,
	ApplicationCommandOptionType,
} from 'dfx/types';
import { Data } from 'effect';
import { decode } from 'html-entities';
import type { SearchHit } from '../core/algolia.ts';

/**
 * Generates a display name for a given search hit from Algolia.
 *
 * @param hit - The search hit object containing hierarchy and anchor information.
 * @returns A formatted string representing the name of the hit, including hierarchy levels and anchor if present.
 */
export const generateNameFromHit = (hit: SearchHit): string => {
	return decode(
		reduce(
			`${hit.hierarchy.lvl0}: ${hit.hierarchy.lvl1}${hit.hierarchy.lvl2 ? ` - ${hit.hierarchy.lvl2}` : ''} ${
				hit.hierarchy.lvl2 && hit.anchor ? `#${hit.anchor}` : ''
			}`,
			100,
			'...'
		)
	);
};

/**
 * Reduces a string to a specified limit, optionally appending a delimiter if truncated.
 *
 * @param string - The input string to be reduced.
 * @param limit - The maximum length of the resulting string.
 * @param delimiter - An optional string to append if the input string is truncated.
 * @returns The reduced string, with the delimiter appended if truncation occurred.
 */
export const reduce = (string: string, limit: number, delimiter: string | null): string => {
	if (string.length > limit) {
		return (
			string.substring(0, limit - (delimiter ? delimiter.length : 0)) + (delimiter ? delimiter : '')
		);
	}

	return string;
};

/**
 * Retrieves the value of a string option from interaction command data.
 *
 * @param data - The interaction command data containing options.
 * @param name - The name of the option to retrieve.
 * @returns The string value of the specified option, or undefined if not found.
 */
export function getStringOption(
	data: APIChatInputApplicationCommandInteractionData | undefined,
	name: string
) {
	if (!data?.options) return undefined;

	const option = data.options.find((option) => {
		return option.name === name && option.type === ApplicationCommandOptionType.STRING;
	});

	if (!option) return undefined;

	if (!('value' in option)) return undefined;

	return option?.value as string | undefined;
}

/**
 * Error indicating that a search query is too short.
 */
export class QueryTooShort extends Data.TaggedError('QueryTooShort')<{
	readonly actual: number;
	readonly min: number;
}> {}
