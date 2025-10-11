import { Config, Effect } from 'effect';
import Groq from 'groq-sdk';

const groqApiKey = Config.string('GROQ_API_KEY');

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

export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()('app/GroqAiHelpers', {
	effect: Effect.gen(function* () {
		const apiKey = yield* groqApiKey;
		const groq = new Groq({ apiKey });

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
