import { Effect, Redacted } from 'effect';
import Groq from 'groq-sdk';
import { groqApiKey } from '../static/env.ts';

/**
 * Represents the available model identifiers for Groq-based language models.
 *
 * Each string literal corresponds to a specific model version or variant
 * supported by the Groq platform, including models from Meta, OpenAI, MoonshotAI,
 * and Qwen. Use this type to ensure type safety when specifying model names
 * in functions or APIs that interact with Groq services.
 */
type GroqModels =
	| 'compound-beta'
	| 'compound-beta-mini'
	| 'gemma2-9b-it'
	| 'llama-3.1-8b-instant'
	| 'llama-3.3-70b-versatile'
	| 'meta-llama/llama-4-maverick-17b-128e-instruct'
	| 'meta-llama/llama-4-scout-17b-16e-instruct'
	| 'meta-llama/llama-guard-4-12b'
	| 'moonshotai/kimi-k2-instruct'
	| 'openai/gpt-oss-120b'
	| 'openai/gpt-oss-20b'
	| 'qwen/qwen3-32b';

/**
 * Service class providing helper methods for interacting with the Groq AI API.
 *
 * @remarks
 * This service is registered under the tag `'app/GroqAiHelpers'` and is intended to be used
 * within an Effect system. It provides a method to create chat completions using the Groq API.
 *
 * @example
 * ```typescript
 * const { makeCompletion } = use(GroqAiHelpers);
 * const result = await makeCompletion('model-name', [
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * ```
 *
 * @public
 */
export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()('app/GroqAiHelpers', {
	effect: Effect.gen(function* () {
		const apiKey = yield* groqApiKey;
		const groq = new Groq({ apiKey: Redacted.value(apiKey) });

		const makeCompletion = Effect.fn(
			(model: GroqModels, messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) =>
				Effect.tryPromise(() =>
					groq.chat.completions.create({
						messages,
						model,
						temperature: 1,
						max_completion_tokens: 1024,
						top_p: 1,
						stream: false,
						stop: null,
					})
				)
		);

		return { makeCompletion } as const;
	}),
}) {}
