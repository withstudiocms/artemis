import { Console, Effect, type Schema } from 'effect';
import type { PullRequestEventSchema } from '../schemas.ts';

/**
 * Handle a GitHub pull request webhook event.
 *
 * Processes a `PullRequestEvent` payload and performs side effects such as logging
 * key details (action, PR number, repository, title, author) and conditionally
 * triggering follow-up actions (for example, CI/CD on opened PRs or deployments
 * on merged PRs). The implementation is an Effect generator that yields logging
 * effects; run the returned Effect in your effect runtime to execute the side effects.
 *
 * @param payload - The pull request event payload. Expected type: `Schema.Schema.Type<typeof PullRequestEventSchema>`.
 * @returns An Effect that, when executed, will perform the logging and any conditional side effects for the pull request event.
 *
 * @example
 * // Example usage (pseudo):
 * // const effect = handlePullRequest(payload);
 * // effectRuntime.run(effect);
 *
 * @remarks
 * - Logs the PR action, number, repository full name, title, and author login.
 * - If `payload.action === 'opened'`, logs that CI/CD or notifications could be triggered.
 * - If `payload.action === 'closed'` and `payload.pull_request.merged` is true, logs that a deployment could be triggered.
 */
export const handlePullRequest = Effect.fn(function* (
	payload: Schema.Schema.Type<typeof PullRequestEventSchema>
) {
	yield* Console.log(
		`PR ${payload.action}: #${payload.pull_request.number} in ${payload.repository.full_name}`
	);
	yield* Console.log(`Title: ${payload.pull_request.title}`);
	yield* Console.log(`Author: ${payload.pull_request.user.login}`);

	if (payload.action === 'opened') {
		yield* Console.log('New pull request opened - could trigger CI/CD or notifications');
	} else if (payload.action === 'closed' && payload.pull_request.merged) {
		yield* Console.log('Pull request merged - could trigger deployment');
	}
});
