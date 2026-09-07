const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

// --- SECURITY ADMIN CONFIGURATION ---
const myUsername = 'tcl'; // ✅ Admin is set to you!
const useAuthPlugin = false; // server has no register/login plugin - turned off
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false;

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

    // Protect Mode Loop - attacks nearest hostile mob near the bot
    setInterval(() => {
      if (!protectMode) return;
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
        bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
        if (bot.entity.position.distanceTo(hostile.position) < 3) {
          bot.attack(hostile);
        }
      }
    }, 1000);
  });

  // 🔍 DEBUG: log every raw message the bot receives (temporary - helps diagnose)
  bot.on('message', (jsonMsg) => {
    console.log('[RAW MESSAGE]', jsonMsg.toString());
  });

  function findPlayerOrArg(username, args) {
    // if an arg name is given and online, use them - else use the sender
    const target = args[1];
    if (target && bot.players[target]) return bot.players[target].entity;
    return bot.players[username]?.entity || null;
  }

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      bot.whisper(username, "Access denied.");
      return;
    }

    const msg = message.trim();
    const args = msg.split(' ');
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase();

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
      protectMode = false;
      bot.whisper(username, "Cleared actions.");
      return;
    }

    if (command === '!come') {
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      bot.whisper(username, "Coming!");
      return;
    }

    if (command === '!follow') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      bot.whisper(username, `Following ${args[1] || username}`);
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Protect mode off."); return; }
      protectMode = true;
      bot.whisper(username, "Protect mode on - attacking nearby hostiles.");
      return;
    }

    if (command === '!lookat') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      bot.lookAt(target.position.offset(0, target.height, 0));
      bot.whisper(username, `Looking at ${args[1] || username}`);
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "Use: !talk [message]");
      bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "Use: !shout [message]");
      bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (!target) return bot.whisper(username, "Nothing in range.");
      bot.attack(target);
      bot.whisper(username, `Clicked ${target.name || target.username || target.displayName || 'entity'}`);
      return;
    }

    if (command === '!sneak') {
      const state = args[1] !== 'stop';
      bot.setControlState('sneak', state);
      bot.whisper(username, state ? "Sneaking." : "Standing.");
      return;
    }

    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) {
        bot.activateBlock(block);
        bot.whisper(username, `Activated block: ${block.name}`);
        return;
      }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) {
        bot.activateEntity(entity);
        bot.whisper(username, `Activated entity: ${entity.name || entity.displayName || 'entity'}`);
        return;
      }
      bot.whisper(username, "Nothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({
        matching: (block) => block.name.includes('bed'),
        maxDistance: 16
      });
      if (!bedBlock) return bot.whisper(username, "No bed nearby.");
      bot.sleep(bedBlock)
        .then(() => bot.whisper(username, "Sleeping."))
        .catch(e => bot.whisper(username, `Can't sleep: ${e.message}`));
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
          if (d < min) { min = d; closest = e; }
        }
      }
      if (!closest) return bot.whisper(username, "No mobs nearby.");
      attachTarget = closest.id;
      attachType = 'mob';
      bot.pathfinder.setGoal(null);
      bot.whisper(username, `Attached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

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
  }

  bot.on('whisper', (username, message) => {
    console.log(`[WHISPER] ${username}: ${message}`);
    handleCommand(username, message);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return; // ignore itself
    console.log(`[CHAT] ${username}: ${message}`);
    if (message.startsWith('!')) handleCommand(username, message);
  });

  bot.on('end', () => setTimeout(createBot, 15000));
  bot.on('error', (err) => console.log('Error:', err));
}

createBot();

app.get('/', (req, res) => res.send('Mega Sandbox Utility Bot is live!'));
app.listen(process.env.PORT || 3000);
