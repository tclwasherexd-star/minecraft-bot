const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

// --- SECURITY ADMIN CONFIGURATION ---
const myUsername = 'tcl'; // ✅ Admin is set to you!
const useAuthPlugin = true, accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null;

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    const mcData = require('minecraft-data')(bot.version);
    defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = false;
    defaultMove.allow1by1towers = false;
    bot.pathfinder.setMovements(defaultMove);

    if (useAuthPlugin) {
      setTimeout(() => {
        bot.chat(`/register ${accountPassword} ${accountPassword}`);
        bot.chat(`/login ${accountPassword}`);
      }, 2000);
    }
    
    // Smooth Riding Loop (20 ticks per second)
    setInterval(() => {
      if (attachTarget) {
        let e = (attachType === 'player') ? bot.players[attachTarget]?.entity : bot.entities[attachTarget];
        if (e) { bot.entity.position = e.position.offset(0, e.height, 0); } else { attachTarget = null; attachType = null; }
      }
    }, 50);

    // Anti-AFK Jump Loop
    setInterval(() => {
      if (!bot.pathfinder.isMoving() && !attachTarget) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
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
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase(); // ✅ FIXED: Reads the first word safely!

    if (command === '!cmds') { bot.whisper(username, "List: !help, !coords, !status, !info, !inventory, !players, !time, !weather, !jump, !stop, !come, !follow, !protect, !lookat, !talk, !shout, !click, !sneak, !activate, !sleeptest, !drop, !dropall, !hand, !equip, !attachplayer, !attachmob, !addcmd, !delcmd, !listcmds, !clean"); return; }
    if (command === '!help') { bot.whisper(username, "Modules: !help1(Info), !help2(Move), !help3(Act), !help4(Inv), !help5(Sandbox)"); return; }
    if (command === '!help1') { bot.whisper(username, "Info: !coords, !status, !info, !inventory, !players, !time, !weather"); return; }
    if (command === '!help2') { bot.whisper(username, "Move: !jump, !come, !follow, !protect, !lookat, !attachplayer, !attachmob, !stop"); return; }
    if (command === '!help3') { bot.whisper(username, "Act: !talk, !shout, !click, !sneak, !activate, !sleeptest"); return; }
    if (command === '!help4') { bot.whisper(username, "Inv: !drop, !dropall, !hand, !equip"); return; }
    if (command === '!help5') { bot.whisper(username, "Sandbox: !addcmd, !delcmd, !listcmds, !clean"); return; }
    
    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `Holding: ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `Online: ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
    if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); bot.whisper(username, "Jumped!"); return; }
    
    if (command === '!stop') { 
      bot.pathfinder.setGoal(null); 
      bot.clearControlStates(); 
      attachTarget = null; 
      attachType = null; 
      bot.whisper(username, "Cleared actions."); 
      return; 
    }
    
    if (command === '!attachplayer') {
      const pTarget = args[1]; 
      if (!pTarget || pTarget === 'stop') { attachTarget = null; attachType = null; bot.whisper(username, "Detached."); return; }
      if (!bot.players[pTarget]) return bot.whisper(username, "Player offline.");
      attachTarget = pTarget; attachType = 'player'; bot.pathfinder.setGoal(null); bot.whisper(username, `Attached to ${pTarget}`); return;
    }
    if (command === '!attachmob') {
      if (args[1] === 'stop') { attachTarget = null; attachType = null; bot.whisper(username, "Detached."); return; }
      let closest = null, min = 999;
      for (const id in bot.entities) {
        const e = bot.entities[id];
        if (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') {
          const d = bot.entity.position.distanceTo(e.position); 
          if (d  bot.whisper(username, e.message)); return; }
    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "Hand empty."); bot.tossStack(h); bot.whisper(username, "Dropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return bot.whisper(username, "Empty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); bot.whisper(username, "Dropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `Holding: ${i.name} x${i.count}` : "Empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase(), item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found.");
      bot.equip(item, 'hand').then(() => bot.whisper(username, `Equipped ${item.name}`)).catch(e => bot.whisper(username, e.message)); return;
    }
    if (command === '!addcmd') { const cmdName = args[1], cmdReply = args.slice(2).join(' '); if (!cmdName || !cmdReply) return bot.whisper(username, 'Use: !addcmd [!name] [reply]'); customCommands[cmdName.toLowerCase()] = cmdReply; bot.whisper(username, `Created command: ${cmdName}`); return; }
    if (command === '!delcmd') { const cmdName = args[1]?.toLowerCase(); if (customCommands[cmdName]) { delete customCommands[cmdName]; bot.whisper(username, `Deleted ${cmdName}`); } else { bot.whisper(username, 'Not found.'); } return; }
    if (command === '!listcmds') { const keys = Object.keys(customCommands); bot.whisper(username, keys.length ? `Custom: ${keys.join(', ')}` : "No custom commands."); return; }
    if (command === '!clean') { customCommands = {}; bot.whisper(username, "Cleared sandbox memory."); return; }
    
    if (customCommands[command]) { bot.whisper(username, customCommands[command]); }
  });

  bot.on('end', () => setTimeout(createBot, 15000));
  bot.on('error', (err) => console.log('Error:', err));
}

createBot();

