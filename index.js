const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

// Configuration - Change these to match your server
const config = {
    host: 'nbtplace.play.hosting', 
    port: 25565,                  
    username: 'CloudAFK_Bot',     
    version: '1.20.1',            
    auth: 'offline'               
};

// --- SECURITY AND ADMIN CONFIGURATION ---
const myUsername = 'tcl'; // 🔴 REPLACE THIS with your exact in-game username!
const useAuthPlugin = true;       
const accountPassword = 'YourBotPassword123'; 

let bot;
let customCommands = {}; 

function createBot() {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
        console.log(`${bot.username} joined the server!`);

        if (useAuthPlugin) {
            setTimeout(() => {
                bot.chat(`/register ${accountPassword} ${accountPassword}`);
                bot.chat(`/login ${accountPassword}`);
                console.log('Sent authentication commands.');
            }, 2000); 
        }

        // Anti-AFK Routine
        setInterval(() => {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
        }, 30000);
    });

    // ========================================================
    // SECURE PRIVATE WHISPER COMMAND SYSTEM
    // ========================================================
    bot.on('whisper', (username, message) => {
        console.log(`[PRIVATE MSG] ${username}: ${message}`);

        // SECURITY CHECK: Only allow YOU to control the bot
        if (username.toLowerCase() !== myUsername.toLowerCase()) {
            bot.whisper(username, "Access denied.");
            return;
        }

        const msg = message.trim();
        const args = msg.split(' ');
        const command = args[0].toLowerCase();

        // 1. MEGA HELP MENU SYSTEM
        if (command === '!help') {
            bot.whisper(username, "--- Core Help Modules ---");
            bot.whisper(username, "Use: !help1 (Info), !help2 (Movement), !help3 (Actions), !help4 (Inventory), !help5 (Custom Sandbox)");
            return;
        }
        if (command === '!help1') {
            bot.whisper(username, "Info: !coords, !status, !info, !inventory, !players, !time, !weather");
            return;
        }
        if (command === '!help2') {
            bot.whisper(username, "Movement: !jump, !come, !follow [player/stop], !protect [player], !lookat [player], !stop");
            return;
        }
        if (command === '!help3') {
            bot.whisper(username, "Actions: !talk [msg], !shout [msg], !click, !sneak [on/off], !activate, !sleeptest");
            return;
        }
        if (command === '!help4') {
            bot.whisper(username, "Inventory: !drop, !dropall, !hand, !equip [item_name]");
            return;
        }
        if (command === '!help5') {
            bot.whisper(username, "Sandbox Maker: !addcmd [!name] [reply], !delcmd [!name], !listcmds, !clean");
            return;
        }

        // 2. INFORMATION / SYSTEM STATS COMMANDS
        if (command === '!coords') {
            const p = bot.entity.position;
            bot.whisper(username, `X: ${Math.round(p.x)}, Y: ${Math.round(p.y)}, Z: ${Math.round(p.z)}`);
            return;
        }
        if (command === '!status') {
            bot.whisper(username, `Health: ${bot.health}/20 | Food: ${bot.food}/20`);
            return;
        }
        if (command === '!info') {
            const block = bot.blockAt(bot.entity.position);
            bot.whisper(username, `Biome: ${block ? block.biome.name : 'Unknown'} | Ping: ${bot.player.ping}ms`);
            return;
        }
        if (command === '!inventory') {
            const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', ');
            bot.whisper(username, items ? `Holding: ${items}` : "My inventory is empty.");
            return;
        }
        if (command === '!players') {
            const list = Object.keys(bot.players).join(', ');
            bot.whisper(username, `Online: ${list.substring(0, 100)}...`);
            return;
        }
        if (command === '!time') {
            bot.whisper(username, `Server Time: ${bot.time.timeOfDay} (Total: ${bot.time.age})`);
            return;
        }
        if (command === '!weather') {
            bot.whisper(username, bot.isRaining ? "It is currently raining/snowing." : "Weather is clear.");
            return;
        }
        // 3. MOVEMENT & PATHFINDING COMMANDS
        if (command === '!jump') {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 500);
            bot.whisper(username, "Jumped!");
            return;
        }
        if (command === '!stop') {
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            bot.whisper(username, "All paths and continuous actions cleared.");
            return;
        }
        if (command === '!come') {
            const target = bot.players[username]?.entity;
            if (!target) return bot.whisper(username, "Can't see you. Get closer!");
            bot.whisper(username, "Navigating to your block coordinates...");
            const mcData = require('minecraft-data')(bot.version);
            bot.pathfinder.setMovements(new Movements(bot, mcData));
            bot.pathfinder.setGoal(new goals.GoalXYZ(target.position.x, target.position.y, target.position.z));
            return;
        }
        if (command === '!follow') {
            const targetName = args[1];
            if (!targetName || targetName === 'stop') {
                bot.pathfinder.setGoal(null);
                bot.whisper(username, "Follow halted.");
                return;
            }
            const target = bot.players[targetName]?.entity;
            if (!target) return bot.whisper(username, `Can't see ${targetName}.`);
            bot.whisper(username, `Tracking ${targetName}.`);
            const mcData = require('minecraft-data')(bot.version);
            bot.pathfinder.setMovements(new Movements(bot, mcData));
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
            return;
        }
        if (command === '!protect') {
            const targetName = args[1] || username;
            const target = bot.players[targetName]?.entity;
            if (!target) return bot.whisper(username, `Can't find ${targetName}.`);
            bot.whisper(username, `Guarding ${targetName}. Standing close by.`);
            const mcData = require('minecraft-data')(bot.version);
            bot.pathfinder.setMovements(new Movements(bot, mcData));
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
            return;
        }
        if (command === '!lookat') {
            const targetName = args[1];
            const target = bot.players[targetName]?.entity;
            if (!target) return bot.whisper(username, `Target ${targetName} not found.`);
            bot.lookAt(target.position.offset(0, target.height, 0));
            bot.whisper(username, `Looking directly at ${targetName}.`);
            return;
        }

        // 4. ACTION & UTILITY COMMANDS
        if (command === '!talk') {
            const text = args.slice(1).join(' ');
            if (text) bot.chat(text);
            return;
        }
        if (command === '!shout') {
            const text = args.slice(1).join(' ');
            if (text) bot.chat(`!! ${text.toUpperCase()} !!`);
            return;
        }
        if (command === '!click') {
            bot.activateItem();
            bot.whisper(username, "Used/clicked the item currently in hand.");
            return;
        }
        if (command === '!sneak') {
            const mode = args[1];
            if (mode === 'on') { bot.setControlState('sneak', true); bot.whisper(username, "Sneaking initialized."); }
            else { bot.setControlState('sneak', false); bot.whisper(username, "Sneaking stopped."); }
            return;
        }
        if (command === '!activate') {
            const block = bot.blockAtCursor(4);
            if (!block) return bot.whisper(username, "No usable block in point-blank range.");
            bot.activateBlock(block);
            bot.whisper(username, `Interacted with ${block.name}.`);
            return;
        }
        if (command === '!sleeptest') {
            bot.sleep(bot.blockAt(bot.entity.position)).catch(err => {
                bot.whisper(username, `Can't sleep: ${err.message}`);
            });
            return;
        }

        // 5. INVENTORY MANIPULATION
        if (command === '!drop') {
            const heldItem = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
            if (!heldItem) return bot.whisper(username, "Nothing in main hand.");
            bot.tossStack(heldItem);
            bot.whisper(username, `Dropped active stack.`);
            return;
        }
        if (command === '!dropall') {
            const items = bot.inventory.items();
            if (items.length === 0) return bot.whisper(username, "No items to discard.");
            async function tossEverything() {
                for (const item of items) { try { await bot.tossStack(item); } catch (e) {} }
            }
            tossEverything();
            bot.whisper(username, "Total inventory dropped.");
            return;
        }
        if (command === '!hand') {
            const item = bot.heldItem;
            bot.whisper(username, item ? `Item in main hand: ${item.name} x${item.count}` : "Hand is empty.");
            return;
        }
        if (command === '!equip') {
            const itemName = args.slice(1).join('_').toLowerCase();
            const item = bot.inventory.items().find(i => i.name.includes(itemName));
            if (!item) return bot.whisper(username, `Item containing "${itemName}" not found in bags.`);
            bot.equip(item, 'hand').then(() => {
                bot.whisper(username, `Equipped ${item.name}.`);
            }).catch(e => bot.whisper(username, `Equip error: ${e.message}`));
            return;
        }

        // 6. DYNAMIC SANDBOX MAKER
        if (command === '!addcmd') {
            const cmdName = args[1];
            const cmdReply = args.slice(2).join(' ');
            if (!cmdName || !cmdReply) return bot.whisper(username, 'Format: !addcmd [!name] [text reply]');
            customCommands[cmdName.toLowerCase()] = cmdReply;
            bot.whisper(username, `Successfully created command template for ${cmdName}`);
            return;
        }
        if (command === '!delcmd') {
            const cmdName = args[1]?.toLowerCase();
            if (customCommands[cmdName]) {
                delete customCommands[cmdName];
                bot.whisper(username, `Removed ${cmdName} framework.`);
            } else {
                bot.whisper(username, 'Command directory empty/not found.');
            }
            return;
        }
        if (command === '!listcmds') {
            const keys = Object.keys(customCommands);
            bot.whisper(username, keys.length ? `Runtime Macros: ${keys.join(', ')}` : "No dynamic runtime macros configured.");
            return;
        }
        if (command === '!clean') {
            customCommands = {};
            bot.whisper(username, "Sandbox memory completely cleared.");
            return;
        }

        // 7. EXECUTE RUNTIME MACROS
        if (customCommands[command]) {
            bot.whisper(username, customCommands[command]);
        }
    });

    // Auto-reconnect loop
    bot.on('end', () => {
        console.log('Bot disconnected. Attempting reconnect in 15 seconds...');
        setTimeout(createBot, 15000);
    });

    bot.on('error', (err) => console.log('Error:', err));
}

createBot();

// Keep-alive Express layer
const expressApp = express();
app.get('/', (req, res) => res.send('Mega Sandbox Utility Bot is live!'));
app.listen(process.env.PORT || 3000);
