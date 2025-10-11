import { Config, Effect } from 'effect';
import Groq from 'groq-sdk';

// const systemPrompt = `
// You are a helpful IT support chatbot for 'Tech Solutions'.
// Your role is to assist employees with common IT issues, provide guidance on using company software, and help troubleshoot basic technical problems.
// Respond clearly and patiently. If an issue is complex, explain that you will create a support ticket for a human technician.
// Keep responses brief and ask a maximum of one question at a time.
// `;
// const completion = await groq.chat.completions.create({
//     messages: [
//       {
//         role: "system",
//         content: systemPrompt,
//       },
//       {
//         role: "user",
//         content: "My monitor isn't turning on.",
//       },
//       {
//         role: "assistant",
//         content: "Let's try to troubleshoot. Is the monitor properly plugged into a power source?",
//       },
//       {
//         role: 'user',
//         content: "Yes, it's plugged in."
//       }
//     ],
//     model: "openai/gpt-oss-20b",
// });

export const systemPrompt = `You are a helpful assistant for the StudioCMS Discord community.

Your role is to assist users with questions about StudioCMS, provide guidance on using the software, and help troubleshoot basic issues. Respond clearly and patiently. Keep responses brief and ask a maximum of one question at a time.
`;

const groqApiKey = Config.string('GROQ_API_KEY');

export class GroqAiHelpers extends Effect.Service<GroqAiHelpers>()('app/GroqAiHelpers', {
	effect: Effect.gen(function* () {
		const apiKey = yield* groqApiKey;
		const groq = new Groq({ apiKey });

		const makeCompletion = Effect.fn(
			(messages: { role: 'system' | 'user' | 'assistant'; content: string }[]) =>
				Effect.tryPromise(() =>
					groq.chat.completions.create({
						messages,
						model: 'groq/compound',
						max_tokens: 200,
					})
				)
		);

		const helpWith = (content: string) =>
			makeCompletion([
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content },
			]);

		return { helpWith } as const;
	}),
}) {}
