const mineflayer = require('mineflayer');

// Configuration - Change these to match your server
const config = {
    host: 'nbtplace.play.hosting', // Put your server IP here (e.g., 'myserver.aternos.me')
    port: 25565,                  // Put your server port here (Default is 25565)
    username: 'CloudAFK_Bot',     // The username your bot will use
    version: '1.20.1',            // Match your exact server version
    auth: 'offline'               // FORCES OFFLINE/CRACKED MODE
};

// If your server has an auth plugin, change these:
const useAuthPlugin = true;       // Set to false if your server doesn't use /register or /login
const accountPassword = 'YourBotPassword123'; // Change this to a secure password for the bot

function createBot() {
    const bot = mineflayer.createBot(config);

    bot.on('spawn', () => {
        console.log(`${bot.username} joined the server!`);

        // Handle in-game login plugin if enabled
        if (useAuthPlugin) {
            setTimeout(() => {
                // Attempts both /register and /login just in case
                bot.chat(`/register ${accountPassword} ${accountPassword}`);
                bot.chat(`/login ${accountPassword}`);
                console.log('Sent authentication commands.');
            }, 2000); 
        }

        // Anti-AFK Routine: Minor movements every 30 seconds to prevent idle kicks
        setInterval(() => {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
        }, 30000);
    });

    // Auto-reconnect loop
    bot.on('end', () => {
        console.log('Bot disconnected. Attempting reconnect in 15 seconds...');
        setTimeout(createBot, 15000);
    });

    bot.on('error', (err) => console.log('Error:', err));
}

createBot();

// Keep-alive Express layer for cloud hosting platforms
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('AFK Bot is running 24/7'));
app.listen(process.env.PORT || 3000);

    // ========================================================
    // CUSTOM IN-GAME COMMAND SYSTEM
    // ========================================================
    bot.on('chat', (username, message) => {
        // Ignore messages sent by the bot itself to prevent infinite loops
        if (username === bot.username) return;

        // Command: !help
        if (message === '!help') {
            bot.chat(`Hello ${username}! Available commands: !coords, !jump, !status, !drop, !talk [msg]`);
        }

        // Command: !coords (Tells everyone the bot's position)
        if (message === '!coords') {
            const p = bot.entity.position;
            bot.chat(`I am at X: ${Math.round(p.x)}, Y: ${Math.round(p.y)}, Z: ${Math.round(p.z)}`);
        }

        // Command: !jump (Makes the bot jump on demand)
        if (message === '!jump') {
            bot.chat('Jumping!');
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
        }

        // Command: !status (Checks bot health and food stats)
        if (message === '!status') {
            bot.chat(`Health: ${bot.health}/20 | Food: ${bot.food}/20`);
        }

        // NEW Command: !talk [message] (Makes the bot repeat what you say)
        if (message.startsWith('!talk ')) {
            const textToSay = message.replace('!talk ', '');
            bot.chat(textToSay);
        }

        // NEW Command: !drop (Makes the bot drop its inventory items)
        if (message === '!drop') {
            const items = bot.inventory.items();
            if (items.length === 0) {
                bot.chat("My inventory is empty!");
                return;
            }
            bot.chat("Dropping all my items!");
            
            // Function to drop items one by one safely
            async function dropAll() {
                for (const item of items) {
                    try {
                        await bot.tossStack(item);
                    } catch (err) {
                        console.log(`Error dropping item: ${err.message}`);
                    }
                }
            }
            dropAll();
        }
    });
    // ========================================================
