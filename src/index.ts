import { Client, User, WebhookClient } from "discord.js-selfbot-v13";

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

        logEvent(client, message.author, "MESSAGE", message.content);
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
    if (typeof user === 'string') {
        user = await client.users.fetch(user);
    }

    console.log(user.displayName, type, info);

    if (process.env.HONEYPOT_MODE === "DM_NOTIFY") {
        for (const channelId of notifyChannelIds) {
            const channel = await client.channels.fetch(channelId);
            await channel.send({
                embeds: [{
                    title: `${user.displayName} has ${info}`,
                    description: `${user.displayName} has ${info}`,
                    timestamp: new Date().toISOString(),
                    color: type === 'RELATIONSHIP' ? 0xFFA500 : 0xFF0000,
                }]
            });
        }
    } else if (process.env.HONEYPOT_MODE === "WEBHOOK") {
        for (const url of webhookUrls) {
            const webhook = new WebhookClient({ url });
            // Create embed
            await webhook.send({
                embeds: [{
                    title: `${user.displayName} has ${info}`,
                    description: `${user.displayName} has ${info}`,
                    timestamp: new Date().toISOString(),
                    color: type === 'RELATIONSHIP' ? 0xFFA500 : 0xFF0000,
                }]
            });
        }
    }
}

console.log("Honeypot started with", clients.length, "clients");