import { DiscordEmbedBuilder, EMBED_BRAND_COLOR } from '../utils/embed-builder.ts';

/**
 * A reusable, pre-configured Discord embed builder initialized with the application's brand color.
 *
 * This exported constant serves as a base template for creating embeds that follow the
 * project's visual identity. Prefer creating a copy of this builder before mutating it,
 * otherwise changes will affect all consumers of the shared instance.
 *
 * @remarks
 * - Built using DiscordEmbedBuilder and initialized with EMBED_BRAND_COLOR.
 * - Exported for consistent styling across the codebase.
 *
 * @example
 * // Create a new embed from the base without mutating the exported instance:
 * // const embed = DiscordEmbedBuilder.from(brandedEmbedBase).setTitle('Hello');
 *
 * @see EMBED_BRAND_COLOR
 */
export const getBrandedEmbedBase = () => new DiscordEmbedBuilder().setColor(EMBED_BRAND_COLOR);

/**
 * Builds an embed describing how to contribute to StudioCMS.
 *
 * The embed contains a title, descriptive text, a thumbnail (constructed from the provided botDomain),
 * three informative fields linking to relevant GitHub issues and documentation ("Good First Issues",
 * "Help Wanted", and "Getting Started"), and a celebratory footer.
 *
 * @param botDomain - Host or domain used to construct the thumbnail URL. The value will be prefixed with "https://"
 *                    when building the thumbnail (for example: "mybot.example.com" results in "https://mybot.example.com/studiocms.png").
 * @returns The fully built embed object (produced by brandedEmbedBase.build()), ready to be sent in a message.
 */
export const contributing = (botDomain: string) =>
	new DiscordEmbedBuilder()
		.setColor(EMBED_BRAND_COLOR)
		.setTitle('Contributing to StudioCMS')
		.setDescription(
			'Help make StudioCMS better! Here are some ways to get started with contributing:'
		)
		.setThumbnail(`https://${botDomain}/studiocms.png`)
		.addFields([
			{
				name: '🌱 Good First Issues',
				value:
					'[Browse all good first issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)',
			},
			{
				name: '🙋 Help Wanted',
				value:
					'[Browse all help wanted issues →](https://github.com/withstudiocms/studiocms/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)',
			},
			{
				name: '📚 Getting Started',
				value:
					'• [Contributing Guide](https://github.com/withstudiocms/studiocms?tab=contributing-ov-file)\n• [Development Setup](https://github.com/withstudiocms/studiocms?tab=readme-ov-file#getting-started-with-our-development-playground)',
			},
		])
		.setFooter('Apollo, we have another contributor! 🚀')
		.build();
