import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Represents the 'guilds' table schema in the SQLite database.
 *
 * This table stores information about Discord guilds (servers) that the bot is a member of.
 */
export const guilds = sqliteTable('guilds', {
	id: text().primaryKey().unique().notNull(),
});
