import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Represents the 'guilds' table schema in the SQLite database.
 *
 * This table stores information about Discord guilds (servers) that the bot is a member of.
 */
export const guilds = sqliteTable('guilds', {
	id: text().primaryKey().unique().notNull(),
});

/**
 * Defines the `repos` table schema for SQLite.
 *
 * The table stores repository metadata and associates each repository with a guild.
 *
 * Columns:
 * - `id`: Primary key, auto-incremented integer, unique, not null.
 * - `label`: Repository label, text, not null.
 * - `owner`: Repository owner, text, not null.
 * - `repo`: Repository name, text, not null.
 * - `guildId`: Foreign key referencing `guilds.id`, text, not null.
 *   - On delete and update, cascades changes.
 */
export const repos = sqliteTable('repos', {
	id: int().primaryKey({ autoIncrement: true }).unique().notNull(),
	label: text().notNull(),
	owner: text().notNull(),
	repo: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});

export const crowdinEmbed = sqliteTable('crowdin_embed', {
	id: int().primaryKey({ autoIncrement: true }).unique().notNull(),
	owner: text().notNull(),
	repo: text().notNull(),
	channelId: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});
