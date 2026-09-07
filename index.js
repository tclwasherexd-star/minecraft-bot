const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const net = require('net');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, collectItemsMode = false, followTarget = null;

// Statistics and logs tracking
let botStats = {
  totalJoins: 0,
  totalDisconnects: 0,
  totalKicks: 0,
  currentPlayers: 0,
  maxPlayers: 0,
  joinHistory: [],
  disconnectHistory: [],
  kickHistory: [],
  botStatus: 'offline',
  lastJoinTime: null,
  lastDisconnectTime: null,
  lastKickTime: null,
  botUptime: 0,
  playerList: [],
  serverStatus: 'checking',
  serverCheckedAt: null
};

let botLogs = [];
let minecraftLogs = [];

function addBotLog(type, message) {
  const log = {
    timestamp: new Date().toISOString(),
    type: type,
    message: message
  };
  botLogs.push(log);
  if (botLogs.length > 200) botLogs.shift();
  console.log(`[BOT LOG] [${type}] ${message}`);
}

function addMinecraftLog(type, message) {
  const log = {
    timestamp: new Date().toISOString(),
    type: type,
    message: message
  };
  minecraftLogs.push(log);
  if (minecraftLogs.length > 200) minecraftLogs.shift();
  console.log(`[MC LOG] [${type}] ${message}`);
}

// Function to check if server is online
function checkServerStatus() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      resolve(false);
    });
    
    socket.connect(config.port, config.host);
  });
}

// Check server status every 30 seconds
setInterval(async () => {
  const isOnline = await checkServerStatus();
  botStats.serverStatus = isOnline ? 'online' : 'offline';
  botStats.serverCheckedAt = new Date().toISOString();
}, 30000);

// Initial server status check
checkServerStatus().then(isOnline => {
  botStats.serverStatus = isOnline ? 'online' : 'offline';
  botStats.serverCheckedAt = new Date().toISOString();
});

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    spawnTime = Date.now();
    botStats.totalJoins++;
    botStats.botStatus = 'online';
    botStats.lastJoinTime = new Date().toISOString();
    botStats.joinHistory.push({
      time: new Date().toISOString(),
      username: bot.username
    });
    addBotLog('INFO', 'Bot joined the server');
    addMinecraftLog('INFO', `${bot.username} joined the game`);
    
    if (botStats.joinHistory.length > 100) botStats.joinHistory.shift();
    
    const mcData = require('minecraft-data')(bot.version);
    defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = true;
    defaultMove.allow1by1towers = false;
    defaultMove.allowParkour = true;
    defaultMove.allowSprinting = true;
    bot.pathfinder.setMovements(defaultMove);

    if (useAuthPlugin) {
      setTimeout(() => {
        bot.chat(`/register ${accountPassword} ${accountPassword}`);
        bot.chat(`/login ${accountPassword}`);
      }, 2000);
    }

    // Update player list every 5 seconds
    setInterval(() => {
      if (bot.players) {
        botStats.playerList = Object.keys(bot.players).filter(p => p !== bot.username);
        botStats.currentPlayers = botStats.playerList.length;
        if (botStats.currentPlayers > botStats.maxPlayers) {
          botStats.maxPlayers = botStats.currentPlayers;
        }
      }
    }, 5000);

    // Update bot uptime every second
    setInterval(() => {
      if (spawnTime) {
        botStats.botUptime = Date.now() - spawnTime;
      }
    }, 1000);

    // IMPROVED FOLLOW SYSTEM - No delay, instant following
    setInterval(() => {
      if (followTarget && bot.players[followTarget]?.entity) {
        const target = bot.players[followTarget].entity;
        const distance = bot.entity.position.distanceTo(target.position);
        
        if (distance > 2) {
          // Clear existing goal and set new one immediately
          bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
          bot.setControlState('sprint', true);
          bot.setControlState('jump', true);
        } else {
          bot.setControlState('sprint', false);
          bot.setControlState('jump', false);
          bot.pathfinder.setGoal(null);
          // Look at the player when close
          bot.lookAt(target.position.offset(0, target.height, 0));
        }
      }
    }, 100); // Check every 100ms for instant response

    // AUTO-JUMP: Always keep jump control active when moving
    setInterval(() => {
      if (bot.pathfinder.isMoving() && !attachTarget) {
        bot.setControlState('jump', true);
      } else if (!followTarget) {
        bot.setControlState('jump', false);
      }
    }, 50);

    // Ground Item Collection Loop
    setInterval(() => {
      if (!collectItemsMode) return;
      
      const items = Object.values(bot.entities).filter(e => e.objectType === 'Item' || e.name === 'item');
      if (items.length === 0) return;
      
      items.sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position));
      
      const nearestItem = items[0];
      const distance = bot.entity.position.distanceTo(nearestItem.position);
      
      if (distance < 1.5) {
        bot.lookAt(nearestItem.position);
      } else if (distance < 16) {
        bot.pathfinder.setGoal(new goals.GoalNear(nearestItem.position.x, nearestItem.position.y, nearestItem.position.z, 1));
      }
    }, 500);

    // Smooth Riding Loop - Fixed for attacking
    setInterval(() => {
      if (attachTarget) {
        let e = (attachType === 'player') ? bot.players[attachTarget]?.entity : bot.entities[attachTarget];
        if (e) { 
          bot.entity.position = e.position.offset(0, e.height, 0); 
        } else { 
          attachTarget = null; 
          attachType = null; 
        }
      }
    }, 50);

    // Protect Mode Loop
    setInterval(() => {
      if (!protectMode) return;
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
        bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
        if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
      }
    }, 1000);

    // Attack Mode Loop - Now supports attacking attached players
    setInterval(() => {
      const targetName = attackTarget || (attachType === 'player' ? attachTarget : null);
      if (!targetName) return;
      
      const target = bot.players[targetName]?.entity;
      if (!target) { 
        bot.chat(`Lost track of ${targetName}, stopping attack.`); 
        attackTarget = null; 
        if (attachType === 'player' && attachTarget === targetName) {
          attachTarget = null;
          attachType = null;
        }
        bot.pathfinder.setGoal(null); 
        return; 
      }
      
      if (bot.entity.position.distanceTo(target.position) < 3) {
        bot.attack(target);
        bot.lookAt(target.position.offset(0, target.height, 0));
      } else if (!(attachType === 'player' && attachTarget === targetName)) {
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      }
    }, 500);

    // Wander Loop
    setInterval(() => {
      if (!wanderMode || bot.pathfinder.isMoving()) return;
      const radius = wanderMode.radius || 10;
      const origin = wanderMode.origin;
      const dx = (Math.random() * 2 - 1) * radius;
      const dz = (Math.random() * 2 - 1) * radius;
      bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
    }, 8000);

    // Stuck Detector
    let lastPos = null;
    setInterval(() => {
      const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
      if (!hasGoal) { lastPos = null; return; }

      const pos = bot.entity.position;
      if (lastPos && pos.distanceTo(lastPos) < 0.15) {
        bot.setControlState('forward', true);
        bot.setControlState('jump', true);
      } else {
        bot.setControlState('forward', false);
      }
      lastPos = pos.clone();
    }, 100);
  });

  bot.on('kicked', (reason) => {
    console.log(`Bot was kicked: ${reason}`);
    botStats.totalKicks++;
    botStats.botStatus = 'kicked';
    botStats.lastKickTime = new Date().toISOString();
    botStats.kickHistory.push({
      time: new Date().toISOString(),
      reason: reason
    });
    addBotLog('WARN', `Bot was kicked: ${reason}`);
    addMinecraftLog('WARN', `${bot.username} was kicked: ${reason}`);
    if (botStats.kickHistory.length > 100) botStats.kickHistory.shift();
  });

  bot.on('end', (reason) => {
    console.log(`Bot disconnected: ${reason}`);
    botStats.totalDisconnects++;
    botStats.botStatus = 'offline';
    botStats.lastDisconnectTime = new Date().toISOString();
    botStats.disconnectHistory.push({
      time: new Date().toISOString(),
      reason: reason
    });
    addBotLog('INFO', `Bot disconnected: ${reason}`);
    addMinecraftLog('INFO', `${bot.username} left the game: ${reason}`);
    if (botStats.disconnectHistory.length > 100) botStats.disconnectHistory.shift();
    botStats.botUptime = 0;
    followTarget = null;
    setTimeout(createBot, 15000);
  });

  bot.on('error', (err) => {
    console.log('Error:', err);
    addBotLog('ERROR', `Bot error: ${err.message}`);
  });

  bot.on('message', (jsonMsg) => {
    const message = jsonMsg.toString();
    console.log('[RAW MESSAGE]', message);
    addMinecraftLog('CHAT', message);
  });

  function findPlayerOrArg(username, args) {
    const target = args[1];
    if (target && bot.players[target]) return bot.players[target].entity;
    return bot.players[username]?.entity || null;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  function handleCommand(username, message) {
    const msg = message.trim();
    const args = msg.split(' ');
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase();
    
    addBotLog('COMMAND', `${username} executed: ${message}`);

    if (command === '!cmdlist') {
      const commands = [
        "=== CLOUDAFK BOT COMMANDS ===",
        "Info:",
        "!coords - Shows bot's coordinates",
        "!status - Shows HP and food",
        "!info - Shows biome and ping",
        "!inventory - Lists all items",
        "!players - Shows online players",
        "!time - Shows in-game time",
        "!weather - Shows weather",
        "!nearbyplayers [r] - Players within radius",
        "!nearbymobs [r] - Mobs within radius",
        "!health [p] - Shows player's HP",
        "!whereis [p] - Shows player's coords",
        "!exp - Shows XP level",
        "!gamemode - Shows gamemode",
        "!uptime - Shows connection time",
        "!serverstatus - Shows if server is online",
        "",
        "Movement:",
        "!come - Bot comes to you",
        "!follow [p] - Follows you or player",
        "!goto x y z - Goes to coordinates",
        "!wander [r] - Wanders randomly",
        "!flee - Runs from hostiles",
        "!jump - Makes bot jump",
        "!stop - Stops all actions",
        "",
        "Combat:",
        "!attack [p] - Hunts and attacks player",
        "!protect - Guards area from hostiles",
        "!attachplayer [p] - Attaches and attacks player",
        "!attachmob - Attaches to nearest mob",
        "!click - Attacks nearest entity",
        "",
        "Actions:",
        "!talk [msg] - Says message in chat",
        "!shout [msg] - Shouts message",
        "!sneak - Bot sneaks",
        "!activate - Activates block/entity",
        "!lookat [p] - Looks at player",
        "!sleeptest - Tries to sleep",
        "",
        "Building:",
        "!place [item] - Places item",
        "!placeat x y z item - Places at coords",
        "!fill item w h d - Fills area",
        "!dig - Digs block in view",
        "!collect block amt - Collects blocks",
        "!blockinfo - Shows block info",
        "",
        "Inventory:",
        "!drop - Drops held item",
        "!dropall - Drops all items",
        "!hand - Shows held item",
        "!equip [item] - Equips item",
        "!collectitems - Collects ground items",
        "!collectitems stop - Stops collecting",
        "",
        "Sandbox:",
        "!addcmd !name reply - Creates command",
        "!delcmd !name - Deletes command",
        "!listcmds - Lists custom commands",
        "!clean - Clears custom commands"
      ];
      
      commands.forEach((line, i) => {
        setTimeout(() => bot.whisper(username, line), i * 50);
      });
      return;
    }

    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `Holding: ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `Online (${botStats.currentPlayers}): ${botStats.playerList.join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
    if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); bot.whisper(username, "Jumped!"); return; }
    if (command === '!serverstatus') { 
      bot.whisper(username, `Server is ${botStats.serverStatus.toUpperCase()}`);
      if (botStats.serverCheckedAt) {
        bot.whisper(username, `Last checked: ${new Date(botStats.serverCheckedAt).toLocaleString()}`);
      }
      return; 
    }

    if (command === '!stop') {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      attachTarget = null; attachType = null;
      protectMode = false; attackTarget = null; wanderMode = false;
      collectItemsMode = false; followTarget = null;
      bot.whisper(username, "Cleared actions.");
      return;
    }

    if (command === '!come') {
      attachTarget = null; attachType = null;
      attackTarget = null; collectItemsMode = false; followTarget = null;
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      bot.whisper(username, "Coming!");
      return;
    }

    // IMPROVED FOLLOW COMMAND - Instant response
    if (command === '!follow') {
      const targetName = args[1] || username;
      
      if (!bot.players[targetName]) {
        return bot.whisper(username, `Player ${targetName} not found or offline.`);
      }
      
      const target = bot.players[targetName].entity;
      if (!target) {
        return bot.whisper(username, `Cannot see ${targetName} (out of render distance).`);
      }
      
      // Clear other modes
      attachTarget = null; 
      attachType = null;
      attackTarget = null;
      collectItemsMode = false;
      wanderMode = false;
      
      // Set follow target
      followTarget = targetName;
      
      // Immediately start following
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
      bot.setControlState('sprint', true);
      
      bot.whisper(username, `Following ${targetName}!`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return bot.whisper(username, "Use: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      attackTarget = null; collectItemsMode = false; followTarget = null;
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      bot.whisper(username, `Heading to ${x}, ${y}, ${z}`);
      return;
    }

    if (command === '!wander') {
      if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Wander off."); return; }
      const radius = parseInt(args[1]) || 10;
      wanderMode = { radius, origin: bot.entity.position.clone() };
      collectItemsMode = false; followTarget = null;
      bot.whisper(username, `Wandering within ${radius} blocks.`);
      return;
    }

    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (!hostile) return bot.whisper(username, "No hostiles nearby.");
      followTarget = null;
      const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
      bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      bot.whisper(username, `Fleeing from ${hostile.name || 'mob'}!`);
      return;
    }

    if (command === '!attack') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attackTarget = null; 
        bot.pathfinder.setGoal(null); 
        bot.whisper(username, "Attack stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return bot.whisper(username, "Player offline.");
      attackTarget = pTarget;
      collectItemsMode = false; followTarget = null;
      bot.whisper(username, `Attacking ${pTarget}!`);
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Protect mode off."); return; }
      protectMode = true;
      collectItemsMode = false; followTarget = null;
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
      if (block) { bot.activateBlock(block); bot.whisper(username, `Activated block: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); bot.whisper(username, `Activated entity: ${entity.name || entity.displayName || 'entity'}`); return; }
      bot.whisper(username, "Nothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({ matching: (block) => block.name.includes('bed'), maxDistance: 16 });
      if (!bedBlock) return bot.whisper(username, "No bed nearby.");
      bot.sleep(bedBlock).then(() => bot.whisper(username, "Sleeping.")).catch(e => bot.whisper(username, `Can't sleep: ${e.message}`));
      return;
    }

    if (command === '!attachplayer') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        followTarget = null;
        bot.pathfinder.setGoal(null);
        bot.whisper(username, "Detached and stopped attacking."); 
        return; 
      }
      
      if (!bot.players[pTarget]) {
        return bot.whisper(username, `Player ${pTarget} not found or offline.`);
      }
      
      const targetEntity = bot.players[pTarget].entity;
      if (!targetEntity) {
        return bot.whisper(username, `Cannot see ${pTarget} (out of render distance).`);
      }
      
      attachTarget = pTarget; 
      attachType = 'player'; 
      attackTarget = pTarget;
      collectItemsMode = false;
      followTarget = null;
      bot.pathfinder.setGoal(null); 
      bot.whisper(username, `Attached to ${pTarget} and attacking!`); 
      return;
    }

    if (command === '!attachmob') {
      if (args[1] === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.whisper(username, "Detached."); 
        return; 
      }
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
      attackTarget = null;
      collectItemsMode = false;
      followTarget = null;
      bot.pathfinder.setGoal(null);
      bot.whisper(username, `Attached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "Hand empty."); bot.tossStack(h); bot.whisper(username, "Dropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return bot.whisper(username, "Empty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); bot.whisper(username, "Dropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `Holding: ${i.name} x${i.count}` : "Empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "Use: !equip [item name]");
      const items = bot.inventory.items();
      const item = items.find(i => i.name.includes(itemName));
      if (!item) { bot.whisper(username, `Item not found. You're holding: ${items.map(i => i.name).join(', ') || 'nothing'}`); return; }
      bot.equip(item, 'hand').then(() => bot.whisper(username, `Equipped ${item.name}`)).catch(e => bot.whisper(username, `Equip failed: ${e.message}`));
      return;
    }

    if (command === '!collectitems') {
      if (args[1] === 'stop') {
        collectItemsMode = false;
        bot.pathfinder.setGoal(null);
        bot.whisper(username, "Stopped collecting items.");
        return;
      }
      
      collectItemsMode = true;
      attackTarget = null;
      attachTarget = null;
      attachType = null;
      protectMode = false;
      wanderMode = false;
      followTarget = null;
      bot.whisper(username, "Collecting ground items! Bot will pick up any items on the ground.");
      return;
    }

    // ---- BUILD ----
    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "Use: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return bot.whisper(username, "No block in view to place against.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, bot.entity.position.offset(0, 1, 0).minus(refBlock.position).normalize()))
        .then(() => bot.whisper(username, `Placed ${item.name}`))
        .catch(e => bot.whisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!placeat') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      const itemName = args.slice(4).join('_').toLowerCase();
      if ([x, y, z].some(isNaN) || !itemName) return bot.whisper(username, "Use: !placeat [x] [y] [z] [item]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAt({ x, y: y - 1, z });
      if (!refBlock) return bot.whisper(username, "No reference block below target position.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => bot.whisper(username, `Placed ${item.name} at ${x},${y},${z}`))
        .catch(e => bot.whisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!fill') {
      const itemName = args[1]?.toLowerCase();
      const w = parseInt(args[2]) || 1, h = parseInt(args[3]) || 1, d = parseInt(args[4]) || 1;
      if (!itemName) return bot.whisper(username, "Use: !fill [item] [w] [h] [d]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      bot.whisper(username, `Filling ${w}x${h}x${d} with ${item.name}...`);
      const base = bot.entity.position.floored();
      (async () => {
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            for (let zz = 0; zz < d; zz++) {
              const pos = base.offset(xx, yy, zz);
              const below = bot.blockAt(pos.offset(0, -1, 0));
              if (!below) continue;
              try {
                await bot.equip(item, 'hand');
                await bot.placeBlock(below, { x: 0, y: 1, z: 0 });
              } catch (e) {}
            }
          }
        }
        bot.whisper(username, "Fill complete.");
      })();
      return;
    }

    if (command === '!dig') {
      const block = bot.blockAtCursor(5);
      if (!block || block.name === 'air') return bot.whisper(username, "No block in view.");
      bot.dig(block).then(() => bot.whisper(username, `Dug ${block.name}`)).catch(e => bot.whisper(username, `Dig failed: ${e.message}`));
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return bot.whisper(username, "Use: !collect [block name] [amount]");

      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount * 3 });
      if (!targets || targets.length === 0) return bot.whisper(username, "None found nearby.");

      bot.whisper(username, `Attempting to collect ${amount} ${blockName}...`);

      (async () => {
        let collected = 0;
        for (const pos of targets) {
          if (collected >= amount) break;
          const block = bot.blockAt(pos);
          if (!block || block.name === 'air') continue;

          try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(pos.x, pos.y, pos.z));

            const freshBlock = bot.blockAt(pos);
            if (!freshBlock || freshBlock.name === 'air') continue;

            if (!bot.canDigBlock(freshBlock)) continue;

            await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
            await bot.dig(freshBlock);
            collected++;
          } catch (e) {
            continue;
          }
        }
        bot.whisper(username, `Collect finished. Got ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(5);
      bot.whisper(username, block ? `Looking at: ${block.name}` : "No block in view.");
      return;
    }

    // ---- INFO ----
    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `Nearby: ${list.join(', ')}` : "No players in range.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || e.displayName || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `Nearby mobs: ${list.join(', ')}` : "No mobs in range.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      const hp = target.health !== undefined ? target.health : 'unknown (not visible to bot)';
      bot.whisper(username, `${args[1] || username} HP: ${hp}`);
      return;
    }

    if (command === '!tps') { bot.whisper(username, "TPS not exposed by this server (no plugin support detected)."); return; }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline (or out of render distance).");
      const p = target.position;
      bot.whisper(username, `${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { bot.whisper(username, `XP Level: ${bot.experience.level} (${bot.experience.points} pts)`); return; }
    if (command === '!gamemode') { bot.whisper(username, `Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { bot.whisper(username, spawnTime ? `Connected for: ${fmtTime(Date.now() - spawnTime)}` : "Not spawned yet."); return; }

    // ---- SANDBOX COMMAND MANAGEMENT ----
    if (command === '!addcmd') { const cmdName = args[1], cmdReply = args.slice(2).join(' '); if (!cmdName || !cmdReply) return bot.whisper(username, 'Use: !addcmd [!name] [reply]'); customCommands[cmdName.toLowerCase()] = cmdReply; bot.whisper(username, `Created command: ${cmdName}`); return; }
    if (command === '!delcmd') { const cmdName = args[1]?.toLowerCase(); if (customCommands[cmdName]) { delete customCommands[cmdName]; bot.whisper(username, `Deleted ${cmdName}`); } else { bot.whisper(username, 'Not found.'); } return; }
    if (command === '!listcmds') { const keys = Object.keys(customCommands); bot.whisper(username, keys.length ? `Custom: ${keys.join(', ')}` : "No custom commands."); return; }
    if (command === '!clean') { customCommands = {}; bot.whisper(username, "Cleared sandbox memory."); return; }

    if (customCommands[command]) { bot.whisper(username, customCommands[command]); }
  }

  bot.on('whisper', (username, message) => {
    console.log(`[WHISPER] ${username}: ${message}`);
    addMinecraftLog('WHISPER', `${username}: ${message}`);
    handleCommand(username, message);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] ${username}: ${message}`);
    addMinecraftLog('CHAT', `${username}: ${message}`);
    if (message.startsWith('!')) handleCommand(username, message);
  });

  bot.on('end', () => setTimeout(createBot, 15000));
  bot.on('error', (err) => console.log('Error:', err));
}

createBot();

// Web Dashboard
app.get('/', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>CloudAFK Bot Dashboard</title>
    <meta http-equiv="refresh" content="5">
    <style>
      body {
        font-family: Arial, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        margin: 0;
        padding: 20px;
        min-height: 100vh;
      }
      .container {
        max-width: 1200px;
        margin: 0 auto;
        background: white;
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      }
      h1 {
        color: #667eea;
        text-align: center;
        margin-bottom: 30px;
        font-size: 2.5em;
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }
      .stat-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px;
        border-radius: 15px;
        text-align: center;
        transition: transform 0.3s;
      }
      .stat-card:hover {
        transform: translateY(-5px);
      }
      .stat-value {
        font-size: 2.5em;
        font-weight: bold;
        margin: 10px 0;
      }
      .stat-label {
        font-size: 0.9em;
        opacity: 0.9;
      }
      .section {
        margin: 20px 0;
        padding: 20px;
        background: #f5f5f5;
        border-radius: 10px;
      }
      .section h2 {
        color: #667eea;
        margin-top: 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      th, td {
        padding: 10px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }
      th {
        background: #667eea;
        color: white;
      }
      .online { color: #4CAF50; font-weight: bold; }
      .offline { color: #f44336; font-weight: bold; }
      .kicked { color: #ff9800; font-weight: bold; }
      .checking { color: #2196F3; font-weight: bold; }
      .player-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .player-tag {
        background: #667eea;
        color: white;
        padding: 5px 15px;
        border-radius: 20px;
        font-size: 0.9em;
      }
      .log-container {
        max-height: 400px;
        overflow-y: auto;
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 15px;
        border-radius: 10px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
      }
      .log-entry {
        margin: 5px 0;
        padding: 5px;
        border-left: 3px solid #667eea;
        padding-left: 10px;
      }
      .log-info { border-left-color: #4CAF50; }
      .log-warn { border-left-color: #ff9800; }
      .log-error { border-left-color: #f44336; }
      .log-command { border-left-color: #2196F3; }
      .log-chat { border-left-color: #9C27B0; }
      .log-whisper { border-left-color: #00BCD4; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🎮 CloudAFK Bot Dashboard</h1>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Server Status</div>
          <div class="stat-value ${botStats.serverStatus}">${botStats.serverStatus.toUpperCase()}</div>
          ${botStats.serverCheckedAt ? `<small>Last checked: ${new Date(botStats.serverCheckedAt).toLocaleTimeString()}</small>` : ''}
        </div>
        <div class="stat-card">
          <div class="stat-label">Bot Status</div>
          <div class="stat-value ${botStats.botStatus}">${botStats.botStatus.toUpperCase()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Current Players</div>
          <div class="stat-value">${botStats.currentPlayers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Max Players</div>
          <div class="stat-value">${botStats.maxPlayers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Joins</div>
          <div class="stat-value">${botStats.totalJoins}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Disconnects</div>
          <div class="stat-value">${botStats.totalDisconnects}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Kicks</div>
          <div class="stat-value">${botStats.totalKicks}</div>
        </div>
      </div>

      <div class="section">
        <h2>⏱️ Bot Uptime</h2>
        <div style="font-size: 1.5em; text-align: center;">${botStats.botUptime > 0 ? Math.floor(botStats.botUptime / 60000) + ' minutes' : 'Offline'}</div>
      </div>

      <div class="section">
        <h2>👥 Online Players</h2>
        <div class="player-list">
          ${botStats.playerList.length > 0 ? botStats.playerList.map(p => `<span class="player-tag">${p}</span>`).join('') : '<p>No other players online</p>'}
        </div>
      </div>

      <div class="section">
        <h2>📜 Bot Logs</h2>
        <div class="log-container">
          ${botLogs.slice(-50).reverse().map(log => `
            <div class="log-entry log-${log.type.toLowerCase()}">
              <strong>[${log.type}]</strong> ${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <h2>💬 Minecraft Logs</h2>
        <div class="log-container">
          ${minecraftLogs.slice(-50).reverse().map(log => `
            <div class="log-entry log-${log.type.toLowerCase()}">
              <strong>[${log.type}]</strong> ${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="section">
        <h2>📜 Connection History</h2>
        <h3>Joins (${botStats.joinHistory.length})</h3>
        <table>
          <tr><th>Time</th><th>Username</th></tr>
          ${botStats.joinHistory.slice(-10).reverse().map(h => `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.username}</td></tr>`).join('')}
        </table>
        
        <h3>Disconnects (${botStats.disconnectHistory.length})</h3>
        <table>
          <tr><th>Time</th><th>Reason</th></tr>
          ${botStats.disconnectHistory.slice(-10).reverse().map(h => `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.reason}</td></tr>`).join('')}
        </table>
        
        <h3>Kicks (${botStats.kickHistory.length})</h3>
        <table>
          <tr><th>Time</th><th>Reason</th></tr>
          ${botStats.kickHistory.slice(-10).reverse().map(h => `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.reason}</td></tr>`).join('')}
        </table>
      </div>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Dashboard available at http://localhost:3000');
});
