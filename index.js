const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

// --- SECURITY ADMIN CONFIGURATION ---
const myUsername = 'tcl'; // 🔴 REPLACE WITH YOUR EXACT IN-GAME NAME!
const useAuthPlugin = true, accountPassword = 'YourBotPassword123';
let bot, customCommands = {};

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    if (useAuthPlugin) {
      setTimeout(() => {
        bot.chat(`/register ${accountPassword} ${accountPassword}`);
        bot.chat(`/login ${accountPassword}`);
      }, 2000);
    }
    setInterval(() => {
      bot.setControlState('jump', true);
      setTimeout(() => bot.setControlState('jump', false), 500);
    }, 30000);
  });

  bot.on('whisper', (username, message) => {
    console.log(`[MSG] ${username}: ${message}`);
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      bot.whisper(username, "Access denied.");
      return;
    }

    const msg = message.trim();
    const args = msg.split(' ');
    const command = args[0].toLowerCase();

    if (command === '!help') { bot.whisper(username, "Help Modules: !help1(Info), !help2(Move), !help3(Act), !help4(Inv), !help5(Sandbox)"); return; }
    if (command === '!help1') { bot.whisper(username, "Info: !coords, !status, !info, !inventory, !players, !time, !weather"); return; }
    if (command === '!help2') { bot.whisper(username, "Move: !jump, !come, !follow [player/stop], !protect [player], !lookat [player], !stop"); return; }
    if (command === '!help3') { bot.whisper(username, "Act: !talk [msg], !shout [msg], !click, !sneak [on/off], !activate, !sleeptest"); return; }
    if (command === '!help4') { bot.whisper(username, "Inv: !drop, !dropall, !hand, !equip [item]"); return; }
    if (command === '!help5') { bot.whisper(username, "Sandbox: !addcmd [!name] [reply], !delcmd [!name], !listcmds, !clean"); return; }
    
    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `Holding: ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `Online: ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
    if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); bot.whisper(username, "Jumped!"); return; }
    if (command === '!stop') { bot.pathfinder.setGoal(null); bot.clearControlStates(); bot.whisper(username, "Stopped actions."); return; }
    
    if (command === '!come') {
      const t = bot.players[username]?.entity;
      if (!t) return bot.whisper(username, "Can't see you.");
      bot.whisper(username, "Coming!");
      bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
      bot.pathfinder.setGoal(new goals.GoalXYZ(t.position.x, t.position.y, t.position.z));
      return;
    }
    if (command === '!follow') {
      const targetName = args[1];
      if (!targetName || targetName === 'stop') { bot.pathfinder.setGoal(null); bot.whisper(username, "Follow stopped."); return; }
      const t = bot.players[targetName]?.entity;
      if (!t) return bot.whisper(username, `Can't see ${targetName}`);
      bot.whisper(username, `Tracking ${targetName}`);
      bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
      bot.pathfinder.setGoal(new goals.GoalFollow(t, 1), true);
      return;
    }
    if (command === '!protect') {
      const targetName = args[1] || username;
      const t = bot.players[targetName]?.entity;
      if (!t) return bot.whisper(username, `Can't find ${targetName}`);
      bot.whisper(username, `Guarding ${targetName}`);
      bot.pathfinder.setMovements(new Movements(bot, require('minecraft-data')(bot.version)));
      bot.pathfinder.setGoal(new goals.GoalFollow(t, 3), true);
      return;
    }
    if (command === '!lookat') {
      const targetName = args[1];
      const t = bot.players[targetName]?.entity;
      if (!t) return bot.whisper(username, "Target not found.");
      bot.lookAt(t.position.offset(0, t.height, 0));
      bot.whisper(username, `Looking at ${targetName}`);
      return;
    }
    if (command === '!talk') { const text = args.slice(1).join(' '); if (text) bot.chat(text); return; }
    if (command === '!shout') { const text = args.slice(1).join(' '); if (text) bot.chat(`!! ${text.toUpperCase()} !!`); return; }
    if (command === '!click') { bot.activateItem(); bot.whisper(username, "Clicked item."); return; }
    if (command === '!sneak') { if (args[1] === 'on') { bot.setControlState('sneak', true); bot.whisper(username, "Sneaking."); } else { bot.setControlState('sneak', false); bot.whisper(username, "Stopped sneak."); } return; }
    if (command === '!activate') { const b = bot.blockAtCursor(4); if (!b) return bot.whisper(username, "No block in range."); bot.activateBlock(b); bot.whisper(username, `Interacted with ${b.name}`); return; }
    if (command === '!sleeptest') { bot.sleep(bot.blockAt(bot.entity.position)).catch(e => bot.whisper(username, `Can't sleep: ${e.message}`)); return; }
    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "Hand empty."); bot.tossStack(h); bot.whisper(username, "Dropped item."); return; }
    if (command === '!dropall') {
      const items = bot.inventory.items();
      if (items.length === 0) return bot.whisper(username, "Nothing to drop.");
      async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } }
      tossAll(); bot.whisper(username, "Dropped everything."); return;
    }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `Holding: ${i.name} x${i.count}` : "Hand empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found.");
      bot.equip(item, 'hand').then(() => bot.whisper(username, `Equipped ${item.name}`)).catch(e => bot.whisper(username, e.message));
      return;
    }
    if (command === '!addcmd') {
      const cmdName = args[1];
      const cmdReply = args.slice(2).join(' ');
      if (!cmdName || !cmdReply) return bot.whisper(username, 'Use: !addcmd [!name] [reply]');
      customCommands[cmdName.toLowerCase()] = cmdReply;
      bot.whisper(username, `Created command: ${cmdName}`);
      return;
    }
    if (command === '!delcmd') {
      const cmdName = args[1]?.toLowerCase();
      if (customCommands[cmdName]) { delete customCommands[cmdName]; bot.whisper(username, `Deleted ${cmdName}`); } else { bot.whisper(username, 'Not found.'); }
      return;
    }
    if (command === '!listcmds') { const keys = Object.keys(customCommands); bot.whisper(username, keys.length ? `Custom: ${keys.join(', ')}` : "No custom commands."); return; }
    if (command === '!clean') { customCommands = {}; bot.whisper(username, "Cleared sandbox memory."); return; }
    
    if (customCommands[command]) { bot.whisper(username, customCommands[command]); }
  });

  bot.on('end', () => setTimeout(createBot, 15000));
  bot.on('error', (err) => console.log('Error:', err));
}

createBot();

app.get('/', (req, res) => res.send('Mega Sandbox Utility Bot is live!'));
app.listen(process.env.PORT || 3000);
