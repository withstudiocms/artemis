import type { Discord } from 'dfx/index';
import type { Mutable } from 'effect/Types';

export class DiscordEmbedBuilder {
	private embed: Mutable<Discord.RichEmbed> = {};
	private fieldsToAdd: Discord.RichEmbedField[] = [];

	setTitle(title: string) {
		this.embed.title = title;
		return this;
	}

	setDescription(description: string) {
		this.embed.description = description;
		return this;
	}

	setAuthor(name: string, icon_url?: string, url?: string) {
		this.embed.author = { name, icon_url, url };
		return this;
	}

	setURL(url: string) {
		this.embed.url = url;
		return this;
	}

	setColor(color: number) {
		this.embed.color = color;
		return this;
	}

	addField(name: string, value: string, inline?: boolean) {
		this.fieldsToAdd.push({ name, value, inline });
		return this;
	}

	setThumbnail(url: string) {
		this.embed.thumbnail = { url };
		return this;
	}

	setFooter(text: string, icon_url?: string) {
		this.embed.footer = { text, icon_url };
		return this;
	}

	setImage(url: string) {
		this.embed.image = { url };
		return this;
	}

	setTimestamp(timestamp: Date = new Date()) {
		this.embed.timestamp = timestamp.toISOString();
		return this;
	}

	setVideo(url: string) {
		this.embed.video = { url };
		return this;
	}

	build(): Discord.RichEmbed {
		if (this.fieldsToAdd.length > 0) {
			this.embed.fields = this.fieldsToAdd;
		}
		return this.embed;
	}
}
