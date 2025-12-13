import {
	type AppBskyFeedDefs,
	AppBskyFeedPost,
	type AppBskyRichtextFacet,
	AtpAgent,
	RichText,
} from '@atproto/api';

type ClientConfig = {
	serviceUrl: string;
};

export class BSkyAPIClient {
	config: ClientConfig;
	blueskyAgent: AtpAgent;

	constructor(config: ClientConfig) {
		this.config = config;
		this.blueskyAgent = new AtpAgent({ service: config.serviceUrl });
	}

	getAgent(): AtpAgent {
		return this.blueskyAgent;
	}

	processPostText(post: AppBskyFeedDefs.PostView): string {
		if (!AppBskyFeedPost.isRecord(post.record)) {
			throw new Error('Post is not record');
		}

		if (!post.record.facets || (post.record.facets as AppBskyRichtextFacet.Main[]).length === 0) {
			return post.record.text as string;
		}

		const rt = new RichText({
			text: post.record.text as string,
			facets: post.record.facets as AppBskyRichtextFacet.Main[],
		});

		let processedText = '';
		for (const segment of rt.segments()) {
			if (segment.isLink()) {
				if (segment.text === segment.link?.uri) {
					processedText += segment.text;
				} else {
					processedText += `[${segment.text}](${segment.link?.uri})`;
				}
			} else if (segment.isMention()) {
				processedText += `[${segment.text}](https://bsky.app/profile/${segment.mention?.did})`;
			} else if (segment.isTag()) {
				processedText += `[${segment.text}](https://bsky.app/hashtag/${segment.tag?.tag})`;
			} else {
				processedText += segment.text;
			}
		}
		return processedText;
	}

	getBlueskyPostLink(post: AppBskyFeedDefs.PostView): string {
		const uriParts = post.uri.split('/');
		const handle = post.author.handle;
		const rKey = uriParts[uriParts.length - 1];

		return `https://bsky.app/profile/${handle}/post/${rKey}`;
	}

	async getBlueskyAccount(userId: string) {
		if (!userId) throw new Error('No DID or handle provided.');

		let localDidOrHandle = userId;

		const didRegex = /^did:plc:[a-z0-9]{24}$/;
		const handleRegex = /^@?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

		console.log(`Got didorhandle: ${userId}`);

		if (didRegex.test(localDidOrHandle)) {
			console.log(`didorhandle: "${localDidOrHandle}" seems like a DID.`);
		} else if (handleRegex.test(userId)) {
			console.log(`didorhandle: "${userId}" seems like a handle.`);
			if (userId.charAt(0) === '@') {
				console.log('Cut @ off the start');
				localDidOrHandle = userId.substring(1);
			} else {
				localDidOrHandle = userId;
			}
		} else {
			throw new Error("String isn't DID or handle");
		}

		console.log('Finding Bluesky account...');
		const { data } = await this.blueskyAgent.getProfile({
			actor: localDidOrHandle,
		});

		return data;
	}
}
