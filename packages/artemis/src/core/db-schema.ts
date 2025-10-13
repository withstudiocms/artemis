import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Represents the 'guilds' table schema in the SQLite database.
 *
 * This table stores information about Discord guilds (servers) that the bot is a member of.
 */
export const guilds = sqliteTable('guilds', {
	id: text().primaryKey().unique().notNull(),
});

export const repos = sqliteTable('repos', {
	id: int().primaryKey({ autoIncrement: true }).unique().notNull(),
	label: text().notNull(),
	owner: text().notNull(),
	repo: text().notNull(),
	guildId: text()
		.notNull()
		.references(() => guilds.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
});
