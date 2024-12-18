import dedent from "dedent";
import { Client, DiscordAPIError, User, WebhookClient } from "discord.js-selfbot-v13";

if (!process.env.HONEYPOT_TOKEN) {
    throw new Error("HONEYPOT_TOKEN is not set");
}

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            readonly HONEYPOT_TOKEN: string;
            readonly HONEYPOT_MODE: 'DM_NOTIFY' | 'WEBHOOK';
            readonly HONEYPOT_WEBHOOK_URL: string;
            readonly HONEYPOT_NOTIFY_CHANNEL_IDS: string;
        }
    }
}

// Convert environment variables to arrays
const notifyChannelIds = process.env.HONEYPOT_NOTIFY_CHANNEL_IDS?.split(',') || [];
const webhookUrls = process.env.HONEYPOT_WEBHOOK_URL?.split(',') || [];
const tokens = process.env.HONEYPOT_TOKEN?.split(',') || [];

if (process.env.HONEYPOT_MODE?.toUpperCase() === 'DM_NOTIFY') {
    if (notifyChannelIds.length === 0) {
        throw new Error("HONEYPOT_NOTIFY_CHANNEL_IDS is not set");
    }
} else if (process.env.HONEYPOT_MODE?.toUpperCase() === 'WEBHOOK') {
    if (webhookUrls.length === 0) {
        throw new Error("HONEYPOT_WEBHOOK_URL is not set");
    }
} else {
    throw new Error("HONEYPOT_MODE must be set to either DM_NOTIFY or WEBHOOK");
}

// Create a client for each token
const clients = tokens.map(token => {
    const client = new Client();

    client.on('ready', () => {
        console.log("Client ready with user", client.user?.username);
    });

    client.on('messageCreate', (message) => {
        // Only react to messages in DMs
        if (message.channel.type !== 'DM') return;
        if (message.author.id === client.user?.id) return;

        if (message.stickers.size > 0) {
            message.stickers.forEach(sticker => {
                message.content = message.content + `\n<sticker:${sticker.name}:${sticker.id}:${sticker.url}>`;
            });
        }

        logEvent(client, message.author, "MESSAGE", `Message content: \n\`\`\`\n${message.content.substring(0, 980)}\n\`\`\``);
    });

    client.on('relationshipAdd', (userId, shouldNotify) => {
        logEvent(client, userId, "RELATIONSHIP", "Added Relationship. (Should Notify: " + shouldNotify + ")");
    });

    client.on('relationshipRemove', (userId, shouldNotify) => {
        logEvent(client, userId, "RELATIONSHIP", "Removed Relationship. (Should Notify: " + shouldNotify + ")");
    });

    client.on('relationshipUpdate', (userId, shouldNotify) => {
        logEvent(client, userId, "RELATIONSHIP", "Updated Relationship. (Should Notify: " + shouldNotify + ")");
    });

    client.login(token);

    return client;
});

async function logEvent(client: Client, user: User | string, type: 'MESSAGE' | 'RELATIONSHIP', info: string) {
    try {
        try {
            if (typeof user === 'string') {
                user = await client.users.fetch(user);
            }
        } catch (e) {
            console.error("Could not fetch user information:", e);
            return;
        }

        console.log(`${user.displayName} (${user.id}) has ${type === 'RELATIONSHIP' ? 'added or removed a relationship' : 'sent a message'} to the honeypot ${client.user?.displayName} (${client.user?.id}). **Info:** ${info}`);

        if (process.env.HONEYPOT_MODE === "DM_NOTIFY") {
            for (const channelId of notifyChannelIds) {
                let channel;
                try {
                    channel = await client.channels.fetch(channelId);
                } catch (error) {

                    if (error instanceof DiscordAPIError) {
                        if (error.message === "Unknown Channel") {
                            console.warn(`ATTENTION: ${client.user?.displayName} (@${client.user?.username}) is not in the channel ${channelId}. Make sure the bot is in the channel and has the correct permissions.`);
                            continue;
                        }

                        console.error(`Failed to fetch channel ${channelId}:`, error.message);
                        continue;
                    }

                    console.error(`Failed to fetch channel ${channelId}:`, error);
                    continue;
                }

                if (!channel) return console.warn(`ATTENTION: ${client.user?.displayName} (@${client.user?.username}) is not in the channel ${channelId}. Make sure the bot is in the channel and has the correct permissions.`);
                if (!channel.isText()) return console.warn(`ATTENTION: ${client.user?.displayName} (@${client.user?.username}) is in a non-text channel ${channelId}. Make sure the bot is in the channel and has the correct permissions.`);

                // Users cannot send embeds, so we need to send the message as a string
                const message = dedent`
                    # USER REPORT: ${user.displayName} (<@${user.id}>)
                    ## ${type === 'RELATIONSHIP' ? 'Added or Removed a Relationship' : 'Sent a Message'}
                    ## Honeypot: ${client.user?.displayName} (<@${client.user?.id}>)
                    ### Info:
                    ${info}
                `;

                try {
                    await channel.send({
                        content: message,
                    });
                } catch (error) {
                    console.error(`Failed to send message to channel ${channelId}:`, error);
                }
            }
        } else if (process.env.HONEYPOT_MODE === "WEBHOOK") {
            for (const url of webhookUrls) {
                const webhook = new WebhookClient({ url });
                // Create embed
                try {
                    await webhook.send({
                        embeds: [{
                            title: `User Report: ${user.displayName}`,
                            description: "A honeypot has detected a user interaction.",
                            fields: [
                                { name: "User", value: `${user.displayName} (<@${user.id}>)` },
                                { name: "Honeypot", value: `${client.user?.displayName} (<@${client.user?.id}>)` },
                                { name: "Type", value: type },
                                { name: "Info", value: info },
                            ],
                            timestamp: new Date().toISOString(),
                            color: type === 'RELATIONSHIP' ? 0xFFA500 : 0xFF0000,
                        }]
                    });
                } catch (error) {
                    console.error(`Failed to send webhook message:`, error);
                }
            }
        }
    } catch (e) {
        console.error("Error logging event:", e);
    }
}

console.log("Honeypot started with", clients.length, "clients");