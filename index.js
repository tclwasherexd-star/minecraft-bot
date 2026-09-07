const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const net = require('net');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, collectItemsMode = false, followTarget = null, spinAttackMode = false, patrolMode = false, guardTarget = null, autoEatMode = false, autoFishMode = false, spinMode = false;

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
  playerDisconnects: [],
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
  try {
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
      addMinecraftLog('INFO', `${bot.username} joined the game');
      
      if (botStats.joinHistory.length > 100) botStats.joinHistory.shift();
      
      const mcData = require('minecraft-data')(bot.version);
      defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = true;
      defaultMove.allow1by1towers = false;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.allowEntityDetection = true;
      defaultMove.maxDropDown = 4;
      defaultMove.scafoldingBlocks = [];
      bot.pathfinder.setMovements(defaultMove);

      if (useAuthPlugin) {
        setTimeout(() => {
          bot.chat(`/register ${accountPassword} ${accountPassword}`);
          bot.chat(`/login ${accountPassword}`);
        }, 2000);
      }

      // Auto-equip armor on spawn
      setTimeout(() => equipAllArmor(), 2000);
      // Auto-eat
      autoEatMode = true;

      // Track player disconnects
      const trackedPlayers = new Set(Object.keys(bot.players));
      setInterval(() => {
        const currentPlayers = new Set(Object.keys(bot.players));
        
        trackedPlayers.forEach(player => {
          if (!currentPlayers.has(player) && player !== bot.username) {
            botStats.playerDisconnects.push({
              player: player,
              time: new Date().toISOString(),
              type: 'disconnect'
            });
            addMinecraftLog('INFO', `${player} disconnected from the server`);
            if (botStats.playerDisconnects.length > 50) botStats.playerDisconnects.shift();
          }
        });
        
        currentPlayers.forEach(player => {
          if (!trackedPlayers.has(player) && player !== bot.username) {
            addMinecraftLog('INFO', `${player} joined the server`);
          }
        });
        
        trackedPlayers.clear();
        currentPlayers.forEach(player => trackedPlayers.add(player));
        
        botStats.playerList = Array.from(currentPlayers).filter(p => p !== bot.username);
        botStats.currentPlayers = botStats.playerList.length;
        if (botStats.currentPlayers > botStats.maxPlayers) {
          botStats.maxPlayers = botStats.currentPlayers;
        }
      }, 1000);

      // Update bot uptime every second
      setInterval(() => {
        if (spawnTime) {
          botStats.botUptime = Date.now() - spawnTime;
        }
      }, 1000);

      // Auto-eat system
      setInterval(() => {
        if (!autoEatMode || !bot.food) return;
        if (bot.food < 18) {
          const food = bot.inventory.items().find(i => i.name.includes('apple') || i.name.includes('beef') || i.name.includes('porkchop') || i.name.includes('chicken') || i.name.includes('bread') || i.name.includes('carrot') || i.name.includes('potato') || i.name.includes('fish'));
          if (food) {
            bot.equip(food, 'hand').then(() => {
              bot.consume();
              addBotLog('INFO', `Auto-eating ${food.name}`);
            }).catch(() => {});
          }
        }
      }, 5000);

      // Auto-fish system
      setInterval(() => {
        if (!autoFishMode) return;
        const fishingRod = bot.inventory.items().find(i => i.name.includes('fishing_rod'));
        if (fishingRod && !bot.fishing) {
          bot.equip(fishingRod, 'hand').then(() => {
            bot.fish();
          }).catch(() => {});
        }
      }, 10000);

      // Guard mode
      setInterval(() => {
        if (!guardTarget) return;
        const target = bot.players[guardTarget]?.entity;
        if (!target) return;
        
        const hostile = bot.nearestEntity(e => (e.type === 'hostile' || e.type === 'monster') && e.position.distanceTo(target.position) < 10);
        if (hostile) {
          bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
          if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
        } else {
          bot.pathfinder.setGoal(new goals.GoalFollow(target, 3), true);
        }
      }, 1000);

      // Patrol mode
      let patrolPoints = [];
      let currentPatrolIndex = 0;
      setInterval(() => {
        if (!patrolMode || patrolPoints.length === 0) return;
        
        if (!bot.pathfinder.isMoving()) {
          const point = patrolPoints[currentPatrolIndex];
          bot.pathfinder.setGoal(new goals.GoalNear(point.x, point.y, point.z, 1));
          currentPatrolIndex = (currentPatrolIndex + 1) % patrolPoints.length;
        }
      }, 3000);

      // Smart walking system
      setInterval(() => {
        const isMoving = bot.pathfinder.isMoving();
        const hasGoal = bot.pathfinder.goal !== null;
        
        if (isMoving && hasGoal && !attachTarget && !followTarget) {
          const pos = bot.entity.position;
          const blockBelow = bot.blockAt(pos.offset(0, -1, 0));
          const blockAhead = bot.blockAt(pos.offset(0, 0, 1));
          const blockAbove = bot.blockAt(pos.offset(0, 2, 0));
          
          if (!blockBelow || blockBelow.name === 'air' || blockBelow.name === 'cave_air' || blockBelow.name === 'void_air') {
            bot.setControlState('jump', false);
            bot.setControlState('sneak', true);
          } else {
            bot.setControlState('sneak', false);
            bot.setControlState('jump', true);
          }
          
          if (blockAhead && blockAhead.name !== 'air' && blockAhead.name !== 'cave_air' && blockAhead.name !== 'void_air' && blockAhead.name !== 'water' && blockAhead.name !== 'lava') {
            bot.setControlState('jump', true);
            bot.setControlState('forward', true);
          }
          
          if (blockAbove && blockAbove.name !== 'air' && blockAbove.name !== 'cave_air' && blockAbove.name !== 'void_air') {
            if (bot.canDigBlock(blockAbove)) {
              bot.dig(blockAbove);
            }
          }
        }
      }, 100);

      // Stuck Detector
      let lastPos = null;
      let stuckCount = 0;
      setInterval(() => {
        const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
        if (!hasGoal) { 
          lastPos = null; 
          stuckCount = 0;
          bot.setControlState('forward', false);
          bot.setControlState('jump', false);
          return; 
        }

        const pos = bot.entity.position;
        if (lastPos && pos.distanceTo(lastPos) < 0.1) {
          stuckCount++;
          if (stuckCount > 3) {
            bot.setControlState('jump', true);
            bot.setControlState('forward', true);
            
            const blockInFront = bot.blockAtCursor(3);
            if (blockInFront && bot.canDigBlock(blockInFront)) {
              bot.dig(blockInFront);
            }
            
            if (stuckCount > 10) {
              bot.pathfinder.setGoal(null);
              stuckCount = 0;
              setTimeout(() => {
                bot.setControlState('forward', false);
                bot.setControlState('jump', false);
              }, 500);
            }
          }
        } else {
          stuckCount = 0;
          bot.setControlState('forward', false);
        }
        lastPos = pos.clone();
      }, 200);

      // Follow system
      setInterval(() => {
        if (followTarget && bot.players[followTarget]?.entity) {
          const target = bot.players[followTarget].entity;
          const distance = bot.entity.position.distanceTo(target.position);
          
          if (distance > 2) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
            bot.setControlState('sprint', true);
            if (distance > 4) {
              bot.setControlState('jump', true);
            }
          } else {
            bot.setControlState('sprint', false);
            bot.setControlState('jump', false);
            bot.pathfinder.setGoal(null);
            bot.lookAt(target.position.offset(0, target.height, 0));
          }
        }
      }, 100);

      // Spin Mode - Ultra fast spinning
      setInterval(() => {
        if (!spinMode) return;
        let yaw = bot.entity.yaw;
        yaw += Math.PI / 8; // 22.5 degrees
        bot.look(yaw, bot.entity.pitch, true);
      }, 1); // 1ms speed = ultra fast

      // Spin Attack Mode
      setInterval(() => {
        if (!spinAttackMode) return;
        
        const hostile = bot.nearestEntity(e => (e.type === 'hostile' || e.type === 'monster' || e.type === 'player') && e !== bot.entity && bot.entity.position.distanceTo(e.position) < 8);
        
        if (hostile) {
          bot.attack(hostile);
          let yaw = bot.entity.yaw;
          yaw += Math.PI / 4;
          bot.look(yaw, bot.entity.pitch, true);
          bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
          bot.setControlState('jump', true);
        } else {
          let yaw = bot.entity.yaw;
          yaw += Math.PI / 8;
          bot.look(yaw, bot.entity.pitch, true);
        }
      }, 100);

      // Ground Item Collection
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

      // Smooth Riding
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

      // Protect Mode
      setInterval(() => {
        if (!protectMode) return;
        const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
        if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
          bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
          if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
        }
      }, 1000);

      // Attack Mode
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

      // Wander
      setInterval(() => {
        if (!wanderMode || bot.pathfinder.isMoving()) return;
        const radius = wanderMode.radius || 10;
        const origin = wanderMode.origin;
        const dx = (Math.random() * 2 - 1) * radius;
        const dz = (Math.random() * 2 - 1) * radius;
        bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
      }, 8000);
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
      spinAttackMode = false;
      patrolMode = false;
      guardTarget = null;
      autoFishMode = false;
      spinMode = false;
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

    function equipAllArmor() {
      const armorTypes = [
        { type: 'helmet', slot: 'head' },
        { type: 'chestplate', slot: 'torso' },
        { type: 'leggings', slot: 'legs' },
        { type: 'boots', slot: 'feet' }
      ];
      
      const items = bot.inventory.items();
      let equippedCount = 0;
      
      for (const armorType of armorTypes) {
        const armor = items.find(i => i.name.includes(armorType.type));
        if (armor) {
          try {
            bot.equip(armor, armorType.slot);
            equippedCount++;
            addBotLog('INFO', `Equipped ${armor.name} to ${armorType.slot}`);
          } catch (e) {
            addBotLog('ERROR', `Failed to equip ${armor.name}: ${e.message}`);
          }
        }
      }
      
      return equippedCount > 0;
    }

    function equipSingleArmor(armorType) {
      const slotMap = {
        'helmet': 'head',
        'chestplate': 'torso',
        'leggings': 'legs',
        'boots': 'feet'
      };
      
      const slot = slotMap[armorType];
      if (!slot) return false;
      
      const items = bot.inventory.items();
      const armor = items.find(i => i.name.includes(armorType));
      
      if (armor) {
        try {
          bot.equip(armor, slot);
          addBotLog('INFO', `Equipped ${armor.name} to ${slot}`);
          return true;
        } catch (e) {
          addBotLog('ERROR', `Failed to equip ${armor.name}: ${e.message}`);
          return false;
        }
      }
      return false;
    }

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

    function sendCommandsInChunks(username, commands) {
      const chunkSize = 3;
      let index = 0;
      
      function sendNextChunk() {
        if (index >= commands.length) return;
        
        const chunk = commands.slice(index, index + chunkSize);
        chunk.forEach(cmd => {
          bot.whisper(username, cmd);
        });
        
        index += chunkSize;
        setTimeout(sendNextChunk, 1000);
      }
      
      sendNextChunk();
    }

    function handleCommand(username, message) {
      const msg = message.trim();
      const args = msg.split(' ');
      if (!args || args.length === 0) return;
      const command = args[0].toLowerCase();
      
      addBotLog('COMMAND', `${username} executed: ${message}`);

      if (command === '!cmdlist' || command === '!help' || command === '!commands') {
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
          "!spin - Bot spins super fast",
          "!spin stop - Stops spinning",
          "!stop - Stops all actions",
          "!patrol - Patrols between points",
          "",
          "Combat:",
          "!attack [p] - Hunts and attacks player",
          "!protect - Guards area from hostiles",
          "!attachplayer [p] - Attaches and attacks player",
          "!attachmob - Attaches to nearest mob",
          "!click - Attacks nearest entity",
          "!spinattack - Spins and attacks nearby enemies",
          "!guard [p] - Guards specified player",
          "",
          "Armor:",
          "!armor - Equips all armor from inventory",
          "!armor helmet - Equips only helmet",
          "!armor chestplate - Equips only chestplate",
          "!armor leggings - Equips only leggings",
          "!armor boots - Equips only boots",
          "!armor stop - Removes all armor",
          "",
          "Actions:",
          "!talk [msg] - Says message in chat",
          "!shout [msg] - Shouts message",
          "!sneak - Bot sneaks",
          "!activate - Activates block/entity",
          "!lookat [p] - Looks at player",
          "!sleeptest - Tries to sleep",
          "!eat - Bot eats food",
          "!fish - Bot starts fishing",
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
          "",
          "Sandbox:",
          "!addcmd !name reply - Creates command",
          "!delcmd !name - Deletes command",
          "!listcmds - Lists custom commands",
          "!clean - Clears custom commands"
        ];
        
        sendCommandsInChunks(username, commands);
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

      // Spin command
      if (command === '!spin') {
        if (args[1] === 'stop') {
          spinMode = false;
          bot.whisper(username, "Stopped spinning.");
          return;
        }
        
        spinMode = true;
        bot.whisper(username, "Spinning at maximum speed!");
        return;
      }

      if (command === '!patrol') {
        const action = args[1]?.toLowerCase();
        
        if (action === 'add') {
          const x = parseFloat(args[2]), y = parseFloat(args[3]), z = parseFloat(args[4]);
          if ([x, y, z].some(isNaN)) return bot.whisper(username, "Use: !patrol add [x] [y] [z]");
          if (!patrolPoints) patrolPoints = [];
          patrolPoints.push({ x, y, z });
          bot.whisper(username, `Added patrol point at ${x}, ${y}, ${z}`);
          return;
        }
        
        if (action === 'start') {
          if (!patrolPoints || patrolPoints.length === 0) return bot.whisper(username, "No patrol points set. Use !patrol add first.");
          patrolMode = true;
          followTarget = null;
          bot.whisper(username, `Started patrolling with ${patrolPoints.length} points!`);
          return;
        }
        
        if (action === 'stop') {
          patrolMode = false;
          bot.pathfinder.setGoal(null);
          bot.whisper(username, "Stopped patrolling.");
          return;
        }
        
        if (action === 'clear') {
          patrolPoints = [];
          patrolMode = false;
          bot.pathfinder.setGoal(null);
          bot.whisper(username, "Cleared patrol points.");
          return;
        }
        
        bot.whisper(username, "Patrol commands: add, start, stop, clear");
        return;
      }

      if (command === '!guard') {
        const targetName = args[1];
        if (!targetName || targetName === 'stop') {
          guardTarget = null;
          bot.pathfinder.setGoal(null);
          bot.whisper(username, "Stopped guarding.");
          return;
        }
        
        if (!bot.players[targetName]) return bot.whisper(username, `Player ${targetName} not found.`);
        
        guardTarget = targetName;
        followTarget = null;
        bot.whisper(username, `Guarding ${targetName}! Bot will protect them from hostiles.`);
        return;
      }

      if (command === '!fish') {
        if (args[1] === 'stop') {
          autoFishMode = false;
          bot.whisper(username, "Stopped fishing.");
          return;
        }
        
        autoFishMode = true;
        bot.whisper(username, "Fishing mode activated! Bot will fish automatically.");
        return;
      }

      if (command === '!eat') {
        const food = bot.inventory.items().find(i => i.name.includes('apple') || i.name.includes('beef') || i.name.includes('porkchop') || i.name.includes('chicken') || i.name.includes('bread') || i.name.includes('carrot') || i.name.includes('potato') || i.name.includes('fish'));
        if (!food) return bot.whisper(username, "No food found in inventory.");
        
        bot.equip(food, 'hand').then(() => {
          bot.consume();
          bot.whisper(username, `Eating ${food.name}!`);
        }).catch(e => bot.whisper(username, `Failed to eat: ${e.message}`));
        return;
      }

      if (command === '!armor') {
        const armorType = args[1]?.toLowerCase();
        
        if (armorType === 'stop') {
          const armorSlots = ['head', 'torso', 'legs', 'feet'];
          armorSlots.forEach(slot => {
            const armor = bot.inventory.slots[bot.getEquipmentDestSlot(slot)];
            if (armor) {
              bot.unequip(slot);
            }
          });
          bot.whisper(username, "Removed all armor.");
          return;
        }
        
        if (armorType && ['helmet', 'chestplate', 'leggings', 'boots'].includes(armorType)) {
          const success = equipSingleArmor(armorType);
          bot.whisper(username, success ? `Equipped ${armorType}!` : `No ${armorType} found in inventory.`);
          return;
        }
        
        const success = equipAllArmor();
        bot.whisper(username, success ? "Equipped all armor from inventory!" : "No armor found in inventory.");
        return;
      }

      if (command === '!spinattack') {
        if (args[1] === 'stop') {
          spinAttackMode = false;
          bot.pathfinder.setGoal(null);
          bot.whisper(username, "Spin attack stopped.");
          return;
        }
        
        spinAttackMode = true;
        attackTarget = null;
        attachTarget = null;
        attachType = null;
        protectMode = false;
        wanderMode = false;
        followTarget = null;
        collectItemsMode = false;
        patrolMode = false;
        guardTarget = null;
        spinMode = false;
        bot.whisper(username, "Spin attack mode activated! Bot will spin and attack nearby enemies!");
        return;
      }

      if (command === '!stop') {
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        attachTarget = null; attachType = null;
        protectMode = false; attackTarget = null; wanderMode = false;
        collectItemsMode = false; followTarget = null; spinAttackMode = false;
        patrolMode = false; guardTarget = null; autoFishMode = false;
        spinMode = false;
        bot.whisper(username, "Cleared actions.");
        return;
      }

      if (command === '!come') {
        attachTarget = null; attachType = null;
        attackTarget = null; collectItemsMode = false; followTarget = null; spinAttackMode = false;
        patrolMode = false; guardTarget = null; spinMode = false;
        const target = bot.players[username]?.entity;
        if (!target) return bot.whisper(username, "Can't see you.");
        const p = target.position;
        bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
        bot.whisper(username, "Coming!");
        return;
      }

      if (command === '!follow') {
        const targetName = args[1] || username;
        
        if (!bot.players[targetName]) {
          return bot.whisper(username, `Player ${targetName} not found or offline.`);
        }
        
        const target = bot.players[targetName].entity;
        if (!target) {
          return bot.whisper(username, `Cannot see ${targetName} (out of render distance).`);
        }
        
        attachTarget = null; 
        attachType = null;
        attackTarget = null;
        collectItemsMode = false;
        wanderMode = false;
        spinAttackMode = false;
        patrolMode = false;
        guardTarget = null;
        spinMode = false;
        
        followTarget = targetName;
        
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
        bot.setControlState('sprint', true);
        
        bot.whisper(username, `Following ${targetName}!`);
        return;
      }

      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if ([x, y, z].some(isNaN)) return bot.whisper(username, "Use: !goto [x] [y] [z]");
        attachTarget = null; attachType = null;
        attackTarget = null; collectItemsMode = false; followTarget = null; spinAttackMode = false;
        patrolMode = false; guardTarget = null; spinMode = false;
        bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
        bot.whisper(username, `Heading to ${x}, ${y}, ${z}`);
        return;
      }

      if (command === '!wander') {
        if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Wander off."); return; }
        const radius = parseInt(args[1]) || 10;
        wanderMode = { radius, origin: bot.entity.position.clone() };
        collectItemsMode = false; followTarget = null; spinAttackMode = false;
        patrolMode = false; guardTarget = null; spinMode = false;
        bot.whisper(username, `Wandering within ${radius} blocks.
