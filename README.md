# artemis

Artemis is a powerful Effect based discord bot that is designed to interact with your Discord community and your Github Organization. Built for StudioCMS, open sourced and MIT Licensed for anyone to tweak to their hearts content.

## TODO

- [ ] Make repo public
- [ ] Disable old deployment
- [ ] Enable action runners
- [ ] Deploy new compose from `ghcr.io`

## Configuration

**Required Environment Variables:**
```sh
## Discord Bot Configuration
DISCORD_BOT_TOKEN=your-discord-bot-token

## GitHub App Configuration
GITHUB_APP_ID=your-github-app-id
GITHUB_INSTALLATION_ID=your-github-installation-id
GITHUB_PRIVATE_KEY="your-github-private-key" # Use \n for new lines
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret

## DB Configuration
TURSO_DATABASE_URL=your-turso-database-url
TURSO_AUTH_TOKEN=your-turso-auth-token

## Algolia Configuration
ALGOLIA_APP_ID=
ALGOLIA_API_KEY=
ALGOLIA_INDEX_NAME=
```

For an full example environment variable config see [`.env.example`](./.env.example)

## Features

- Auto-threader bot
- BlueSky discord repeater
- Contribute Embed
- Crowdin PTAL from repo dispatch
- Docs Search with Algolia
- Custom Event bus (primarily for HTTP -> discord communication)
- GitHub issue from message app interaction
- GitHub issue from thread command
- No-Embed bot (stop people's messages from having embeds)
- PTAL Service
- Stars Graph
- HTTP webserver for assets and webhook handling
- `@` ping replies with AI interactions

## Commands

- `bluesky` - Allows management of BlueSky subscriptions and settings
  - `list` - List BlueSky accounts tracked in this server
  - `subscribe <account> <top_level> <replies> <reposts>` - Subscribe a channel to a BlueSky Account
  - `unsubscribe <account>` - Unsubscribe a channel from a BlueSky account
  - `settings` - View or modify BlueSky tracking settings
    - `post_channel <channel>` - The channel to post BlueSky updates in
    - `ping_role [role] [enable]` - The role to ping (and if enabled) for BlueSky updates
    - `view` - View current BlueSky tracking settings
- `contribute` - Creates a contributing guide embed for the current channel
- `crowdin-setup` - Set up a Crowdin embed in the current channel for a specified repository
  - `set <owner> <repo>` - Set up a new Crowdin embed listener in the current channel
  - `remove <owner> <repo>` - Remove the Crowdin embed from the current channel
  - `list` - List all Crowdin embeds in the current channel
- `docs <query> [hidden=false] [language=en]` - Search the docs for a specific query (uses Algolia Docsearch API)
- `issue-from-thread <repository> <type> [title]` - Create a GitHub issue from the current thread
- `ptal <github-url> <description>` - Sends a PTAL (Please Take A Look) notification for a pull request
- `ptal-settings` - Configure the PTAL service for this server
  - `set-ping-role <role>` - Set the role to ping for PTAL notifications
  - `view-settings` - View the current PTAL settings for this server
- `stars-graph <repository> [public=false]` - Generate a star history graph for a GitHub repository (Repository in format: `owner/repo` (e.g., `facebook/react`))

## Services

- Auto-thread - Automatically create threads from every message in a channel
  - `[threads]` - Add the `AUTO_THREADS_KEYWORD` (default shown) in the channel's topic
- No-Embed - No more unwanted embeds!
  - `[noembed]` - Add the `NO_EMBED_KEYWORD` (default shown) in the channel's topic
  - Use `NO_EMBED_URL_WHITELIST` to whitelist certain URLs
  - Use `NO_EMBED_URL_EXCLUDE` to exclude certain URLs
- Crowdin PTAL dispatch
  - Repository Dispatch action type should be `crowdin.create`
  - Setup Repository dispatch event with the following payload:
    - `{ pull_request_url: string; }` - This is the same value that is returned from the Crowdin sync action

## License

[MIT License](./LICENSE)
