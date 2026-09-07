const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const net = require('net');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, collectItemsMode = false, followTarget = null, spinAttackMode = false, patrolMode = false, guardTarget = null, autoEatMode = false, autoFishMode = false, spinMode = false;

// Menu system
let menuState = {};
let playerMenus = {};

// Enhanced Statistics
let botStats = {
  totalJoins: 0,
  totalDisconnects: 0,
  totalKicks: 0,
  currentPlayers: 0,
  maxPlayers: 0,
  realPlayers: 0,
  botPlayers: 0,
  joinHistory: [],
  disconnectHistory: [],
  kickHistory: [],
  playerDisconnects: [],
  playerJoins: [],
  botStatus: 'offline',
  lastJoinTime: null,
  lastDisconnectTime: null,
  lastKickTime: null,
  botUptime: 0,
  playerList: [],
  realPlayerList: [],
  botPlayerList: [],
  serverStatus: 'checking',
  serverCheckedAt: null,
  lastEvents: [],
  commandCount: 0,
  commandsUsed: {},
  totalMessages: 0,
  totalWhispers: 0,
  crashPrevention: {
    totalBlocked: 0,
    lastBlocked: null,
    blockedCommands: []
  }
};

let botLogs = [];
let minecraftLogs = [];
let consoleLogs = [];

// Rate limiting
let messageQueue = [];
let isProcessingQueue = false;
let lastMessageTime = 0;
const MESSAGE_INTERVAL = 500;
const MAX_QUEUE_SIZE = 10;

function cleanupLogs() {
  const maxLogs = 100;
  const maxEvents = 50;
  
  if (botLogs.length > maxLogs) botLogs = botLogs.slice(-maxLogs);
  if (minecraftLogs.length > maxLogs) minecraftLogs = minecraftLogs.slice(-maxLogs);
  if (consoleLogs.length > maxLogs) consoleLogs = consoleLogs.slice(-maxLogs);
  if (botStats.joinHistory.length > 20) botStats.joinHistory = botStats.joinHistory.slice(-20);
  if (botStats.disconnectHistory.length > 20) botStats.disconnectHistory = botStats.disconnectHistory.slice(-20);
  if (botStats.kickHistory.length > 20) botStats.kickHistory = botStats.kickHistory.slice(-20);
  if (botStats.lastEvents.length > 30) botStats.lastEvents = botStats.lastEvents.slice(0, 30);
}

setInterval(cleanupLogs, 60000);

function addBotLog(type, message) {
  const timestamp = new Date().toISOString();
  botLogs.push({ timestamp, type, message });
  console.log('\x1b[36m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [BOT] [${type}] ${message}`);
  consoleLogs.push({ timestamp, source: 'BOT', type, message });
  cleanupLogs();
}

function addMinecraftLog(type, message) {
  const timestamp = new Date().toISOString();
  minecraftLogs.push({ timestamp, type, message });
  console.log('\x1b[32m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [MC] [${type}] ${message}`);
  consoleLogs.push({ timestamp, source: 'MC', type, message });
  cleanupLogs();
}

function addEvent(type, player, action, details = '') {
  const event = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type: type,
    player: player,
    action: action,
    details: details,
    icon: type === 'join' ? '✅' : type === 'leave' ? '👋' : type === 'kick' ? '🚫' : type === 'chat' ? '💬' : '⚡'
  };
  
  botStats.lastEvents.unshift(event);
  if (botStats.lastEvents.length > 30) botStats.lastEvents = botStats.lastEvents.slice(0, 30);
}

function safeSendMessage(type, username, message) {
  const now = Date.now();
  
  if (now - lastMessageTime < MESSAGE_INTERVAL) {
    if (messageQueue.length < MAX_QUEUE_SIZE) {
      messageQueue.push({ type, username, message });
    }
    return;
  }
  
  lastMessageTime = now;
  
  if (type === 'whisper') {
    bot.whisper(username, message);
  } else {
    bot.chat(message);
  }
}

setInterval(() => {
  if (isProcessingQueue || messageQueue.length === 0) return;
  
  isProcessingQueue = true;
  const msg = messageQueue.shift();
  
  if (msg.type === 'whisper') {
    bot.whisper(msg.username, msg.message);
  } else {
    bot.chat(msg.message);
  }
  
  lastMessageTime = Date.now();
  isProcessingQueue = false;
}, MESSAGE_INTERVAL);

// Menu definitions
const menus = {
  main: {
    title: "=== CLOUDAFK BOT MENU ===",
    options: [
      { id: '1', label: "Info Commands", action: 'menu_info' },
      { id: '2', label: "Movement Commands", action: 'menu_movement' },
      { id: '3', label: "Combat Commands", action: 'menu_combat' },
      { id: '4', label: "Armor Commands", action: 'menu_armor' },
      { id: '5', label: "Action Commands", action: 'menu_actions' },
      { id: '6', label: "Building Commands", action: 'menu_building' },
      { id: '7', label: "Inventory Commands", action: 'menu_inventory' },
      { id: '8', label: "Quick Actions", action: 'menu_quick' }
    ]
  },
  info: {
    title: "=== INFO COMMANDS ===",
    options: [
      { id: '1', label: "!coords - Show coordinates", action: 'exec_coords' },
      { id: '2', label: "!status - Show HP/Food", action: 'exec_status' },
      { id: '3', label: "!players - Show online players", action: 'exec_players' },
      { id: '4', label: "!inventory - Show inventory", action: 'exec_inventory' },
      { id: '5', label: "!serverstatus - Server status", action: 'exec_serverstatus' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  movement: {
    title: "=== MOVEMENT COMMANDS ===",
    options: [
      { id: '1', label: "!come - Come to you", action: 'exec_come' },
      { id: '2', label: "!follow - Follow you", action: 'exec_follow' },
      { id: '3', label: "!stop - Stop all actions", action: 'exec_stop' },
      { id: '4', label: "!spin - Spin fast", action: 'exec_spin' },
      { id: '5', label: "!wander - Wander around", action: 'exec_wander' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  combat: {
    title: "=== COMBAT COMMANDS ===",
    options: [
      { id: '1', label: "!attack - Attack player", action: 'exec_attack' },
      { id: '2', label: "!protect - Protect mode", action: 'exec_protect' },
      { id: '3', label: "!spinattack - Spin attack", action: 'exec_spinattack' },
      { id: '4', label: "!guard - Guard player", action: 'exec_guard' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  armor: {
    title: "=== ARMOR COMMANDS ===",
    options: [
      { id: '1', label: "!armor - Equip all armor", action: 'exec_armor' },
      { id: '2', label: "!armor helmet", action: 'exec_armor_helmet' },
      { id: '3', label: "!armor chestplate", action: 'exec_armor_chestplate' },
      { id: '4', label: "!armor leggings", action: 'exec_armor_leggings' },
      { id: '5', label: "!armor boots", action: 'exec_armor_boots' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  actions: {
    title: "=== ACTION COMMANDS ===",
    options: [
      { id: '1', label: "!eat - Eat food", action: 'exec_eat' },
      { id: '2', label: "!fish - Start fishing", action: 'exec_fish' },
      { id: '3', label: "!collectitems - Collect items", action: 'exec_collectitems' },
      { id: '4', label: "!sneak - Toggle sneak", action: 'exec_sneak' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  building: {
    title: "=== BUILDING COMMANDS ===",
    options: [
      { id: '1', label: "!dig - Dig block", action: 'exec_dig' },
      { id: '2', label: "!blockinfo - Block info", action: 'exec_blockinfo' },
      { id: '3', label: "!collect - Collect blocks", action: 'exec_collect' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  inventory: {
    title: "=== INVENTORY COMMANDS ===",
    options: [
      { id: '1', label: "!hand - Show held item", action: 'exec_hand' },
      { id: '2', label: "!drop - Drop held item", action: 'exec_drop' },
      { id: '3', label: "!dropall - Drop all items", action: 'exec_dropall' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  },
  quick: {
    title: "=== QUICK ACTIONS ===",
    options: [
      { id: '1', label: "Teleport to me", action: 'exec_come' },
      { id: '2', label: "Follow me", action: 'exec_follow' },
      { id: '3', label: "Stop everything", action: 'exec_stop' },
      { id: '4', label: "Equip armor", action: 'exec_armor' },
      { id: 'b', label: "Back to Main Menu", action: 'menu_main' }
    ]
  }
};

function showMenu(username, menuId) {
  const menu = menus[menuId];
  if (!menu) return;
  
  playerMenus[username] = menuId;
  
  safeSendMessage('whisper', username, menu.title);
  
  menu.options.forEach(option => {
    safeSendMessage('whisper', username, `${option.id}. ${option.label}`);
  });
  
  safeSendMessage('whisper', username, "Type the number to select");
}

function executeAction(username, action) {
  switch(action) {
    case 'menu_main':
      showMenu(username, 'main');
      break;
    case 'menu_info':
      showMenu(username, 'info');
      break;
    case 'menu_movement':
      showMenu(username, 'movement');
      break;
    case 'menu_combat':
      showMenu(username, 'combat');
      break;
    case 'menu_armor':
      showMenu(username, 'armor');
      break;
    case 'menu_actions':
      showMenu(username, 'actions');
      break;
    case 'menu_building':
      showMenu(username, 'building');
      break;
    case 'menu_inventory':
      showMenu(username, 'inventory');
      break;
    case 'menu_quick':
      showMenu(username, 'quick');
      break;
    case 'exec_coords':
      const p = bot.entity.position;
      safeSendMessage('whisper', username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      break;
    case 'exec_status':
      safeSendMessage('whisper', username, `HP:${bot.health}/20 | Food:${bot.food}/20`);
      break;
    case 'exec_players':
      safeSendMessage('whisper', username, `Total: ${botStats.currentPlayers} | Real: ${botStats.realPlayers} | Bots: ${botStats.botPlayers}`);
      break;
    case 'exec_inventory':
      const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', ');
      safeSendMessage('whisper', username, items ? `Holding: ${items}` : "Empty");
      break;
    case 'exec_serverstatus':
      safeSendMessage('whisper', username, `Server is ${botStats.serverStatus.toUpperCase()}`);
      break;
    case 'exec_come':
      handleCommand(username, '!come');
      break;
    case 'exec_follow':
      handleCommand(username, '!follow');
      break;
    case 'exec_stop':
      handleCommand(username, '!stop');
      break;
    case 'exec_spin':
      handleCommand(username, '!spin');
      break;
    case 'exec_wander':
      handleCommand(username, '!wander 10');
      break;
    case 'exec_attack':
      safeSendMessage('whisper', username, "Use !attack [playername] to attack a specific player");
      break;
    case 'exec_protect':
      handleCommand(username, '!protect');
      break;
    case 'exec_spinattack':
      handleCommand(username, '!spinattack');
      break;
    case 'exec_guard':
      safeSendMessage('whisper', username, "Use !guard [playername] to guard a specific player");
      break;
    case 'exec_armor':
      handleCommand(username, '!armor');
      break;
    case 'exec_armor_helmet':
      handleCommand(username, '!armor helmet');
      break;
    case 'exec_armor_chestplate':
      handleCommand(username, '!armor chestplate');
      break;
    case 'exec_armor_leggings':
      handleCommand(username, '!armor leggings');
      break;
    case 'exec_armor_boots':
      handleCommand(username, '!armor boots');
      break;
    case 'exec_eat':
      handleCommand(username, '!eat');
      break;
    case 'exec_fish':
      handleCommand(username, '!fish');
      break;
    case 'exec_collectitems':
      handleCommand(username, '!collectitems');
      break;
    case 'exec_sneak':
      handleCommand(username, '!sneak');
      break;
    case 'exec_dig':
      handleCommand(username, '!dig');
      break;
    case 'exec_blockinfo':
      handleCommand(username, '!blockinfo');
      break;
    case 'exec_collect':
      safeSendMessage('whisper', username, "Use !collect [block] [amount] to collect specific blocks");
      break;
    case 'exec_hand':
      handleCommand(username, '!hand');
      break;
    case 'exec_drop':
      handleCommand(username, '!drop');
      break;
    case 'exec_dropall':
      handleCommand(username, '!dropall');
      break;
  }
}

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

setInterval(async () => {
  const isOnline = await checkServerStatus();
  botStats.serverStatus = isOnline ? 'online' : 'offline';
  botStats.serverCheckedAt = new Date().toISOString();
}, 30000);

checkServerStatus().then(isOnline => {
  botStats.serverStatus = isOnline ? 'online' : 'offline';
  botStats.serverCheckedAt = new Date().toISOString();
});

function createBot() {
  try {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);

    bot.on('spawn', () => {
      console.log('\x1b[35m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [SYSTEM] ${bot.username} joined!`);
      spawnTime = Date.now();
      botStats.totalJoins++;
      botStats.botStatus = 'online';
      botStats.lastJoinTime = new Date().toISOString();
      botStats.joinHistory.push({
        time: new Date().toISOString(),
        username: bot.username,
        type: 'bot'
      });
      addBotLog('INFO', 'Bot joined the server');
      addMinecraftLog('INFO', `${bot.username} joined the game`);
      addEvent('join', bot.username, 'joined', 'Bot connected');
      
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
          safeSendMessage('chat', null, `/register ${accountPassword} ${accountPassword}`);
          safeSendMessage('chat', null, `/login ${accountPassword}`);
        }, 2000);
      }

      setTimeout(() => equipAllArmor(), 2000);
      autoEatMode = true;

      // Track players
      const trackedPlayers = new Set();
      Object.keys(bot.players).forEach(p => trackedPlayers.add(p));
      
      setInterval(() => {
        const currentPlayers = new Set(Object.keys(bot.players));
        
        trackedPlayers.forEach(player => {
          if (!currentPlayers.has(player)) {
            const isBot = player === bot.username || player.toLowerCase().includes('bot') || player.toLowerCase().includes('afk');
            
            botStats.playerDisconnects.push({
              player: player,
              time: new Date().toISOString(),
              type: isBot ? 'bot' : 'real'
            });
            
            if (isBot) {
              addMinecraftLog('INFO', `[BOT] ${player} disconnected from the server`);
              addEvent('leave', player, 'left', 'Bot disconnected');
            } else {
              addMinecraftLog('INFO', `[PLAYER] ${player} disconnected from the server`);
              addEvent('leave', player, 'left', 'Player disconnected');
            }
          }
        });
        
        currentPlayers.forEach(player => {
          if (!trackedPlayers.has(player)) {
            const isBot = player === bot.username || player.toLowerCase().includes('bot') || player.toLowerCase().includes('afk');
            
            botStats.playerJoins.push({
              player: player,
              time: new Date().toISOString(),
              type: isBot ? 'bot' : 'real'
            });
            
            if (isBot) {
              addMinecraftLog('INFO', `[BOT] ${player} joined the server`);
              addEvent('join', player, 'joined', 'Bot connected');
            } else {
              addMinecraftLog('INFO', `[PLAYER] ${player} joined the server`);
              addEvent('join', player, 'joined', 'Player connected');
            }
          }
        });
        
        trackedPlayers.clear();
        currentPlayers.forEach(player => trackedPlayers.add(player));
        
        botStats.playerList = Array.from(currentPlayers);
        botStats.realPlayerList = botStats.playerList.filter(p => !p.toLowerCase().includes('bot') && !p.toLowerCase().includes('afk'));
        botStats.botPlayerList = botStats.playerList.filter(p => p.toLowerCase().includes('bot') || p.toLowerCase().includes('afk'));
        
        botStats.currentPlayers = botStats.playerList.length;
        botStats.realPlayers = botStats.realPlayerList.length;
        botStats.botPlayers = botStats.botPlayerList.length;
        
        if (botStats.currentPlayers > botStats.maxPlayers) {
          botStats.maxPlayers = botStats.currentPlayers;
        }
        
        cleanupLogs();
      }, 1000);

      // Update bot uptime
      setInterval(() => {
        if (spawnTime) {
          botStats.botUptime = Date.now() - spawnTime;
        }
      }, 1000);

      // Auto-eat
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

      // Auto-fish
      setInterval(() => {
        if (!autoFishMode) return;
        const fishingRod = bot.inventory.items().find(i => i.name.includes('fishing_rod'));
        if (fishingRod && !bot.fishing) {
          bot.equip(fishingRod, 'hand').then(() => {
            bot.fish();
            addBotLog('INFO', 'Started fishing');
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

      // Smart walking
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

      // Spin Mode
      setInterval(() => {
        if (!spinMode) return;
        let yaw = bot.entity.yaw;
        yaw += Math.PI / 8;
        bot.look(yaw, bot.entity.pitch, true);
      }, 1);

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
          safeSendMessage('chat', null, `Lost track of ${targetName}, stopping attack.`);
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
      console.log('\x1b[31m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [KICK] Bot was kicked: ${reason}`);
      botStats.totalKicks++;
      botStats.botStatus = 'kicked';
      botStats.lastKickTime = new Date().toISOString();
      botStats.kickHistory.push({
        time: new Date().toISOString(),
        reason: reason
      });
      addBotLog('WARN', `Bot was kicked: ${reason}`);
      addMinecraftLog('WARN', `${bot.username} was kicked: ${reason}`);
      addEvent('kick', bot.username, 'kicked', reason);
    });

    bot.on('end', (reason) => {
      console.log('\x1b[31m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [DISCONNECT] Bot disconnected: ${reason}`);
      botStats.totalDisconnects++;
      botStats.botStatus = 'offline';
      botStats.lastDisconnectTime = new Date().toISOString();
      botStats.disconnectHistory.push({
        time: new Date().toISOString(),
        reason: reason
      });
      addBotLog('INFO', `Bot disconnected: ${reason}`);
      addMinecraftLog('INFO', `${bot.username} left the game: ${reason}`);
      addEvent('leave', bot.username, 'disconnected', reason);
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
      console.log('\x1b[31m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [ERROR] ${err.message}`);
      addBotLog('ERROR', `Bot error: ${err.message}`);
    });

    bot.on('message', (jsonMsg) => {
      const message = jsonMsg.toString();
      console.log('\x1b[90m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [CHAT] ${message}`);
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

    function handleCommand(username, message) {
      const msg = message.trim();
      const args = msg.split(' ');
      if (!args || args.length === 0) return;
      const command = args[0].toLowerCase();
      
      // Handle menu navigation
      if (playerMenus[username] && !command.startsWith('!')) {
        const menu = menus[playerMenus[username]];
        if (menu) {
          const option = menu.options.find(o => o.id === command.toLowerCase());
          if (option) {
            executeAction(username, option.action);
            return;
          }
        }
      }
      
      botStats.commandCount++;
      botStats.commandsUsed[command] = (botStats.commandsUsed[command] || 0) + 1;
      
      addBotLog('COMMAND', `${username} executed: ${message}`);
      addEvent('command', username, 'used command', message);

      if (command === '!menu' || command === '!gui' || command === '!help' || command === '!commands') {
        showMenu(username, 'main');
        return;
      }

      if (command === '!cmdlist') {
        const commands = [
          "=== CLOUDAFK BOT COMMANDS ===",
          "Type !menu for interactive menu",
          "",
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

      if (command === '!coords') { const p = bot.entity.position; safeSendMessage('whisper', username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeSendMessage('whisper', username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
      if (command === '!info') { safeSendMessage('whisper', username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
      if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); safeSendMessage('whisper', username, items ? `Holding: ${items}` : "Empty"); return; }
      if (command === '!players') { safeSendMessage('whisper', username, `Total: ${botStats.currentPlayers} | Real: ${botStats.realPlayers} | Bots: ${botStats.botPlayers}`); return; }
      if (command === '!time') { safeSendMessage('whisper', username, `Time: ${bot.time.timeOfDay}`); return; }
      if (command === '!weather') { safeSendMessage('whisper', username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
      if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); safeSendMessage('whisper', username, "Jumped!"); return; }
      if (command === '!serverstatus') { 
        safeSendMessage('whisper', username, `Server is ${botStats.serverStatus.toUpperCase()}`);
        if (botStats.serverCheckedAt) {
          safeSendMessage('whisper', username, `Last checked: ${new Date(botStats.serverCheckedAt).toLocaleString()}`);
        }
        return; 
      }

      // Spin command
      if (command === '!spin') {
        if (args[1] === 'stop') {
          spinMode = false;
          safeSendMessage('whisper', username, "Stopped spinning.");
          return;
        }
        
        spinMode = true;
        safeSendMessage('whisper', username, "Spinning at maximum speed!");
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
        safeSendMessage('whisper', username, "Cleared actions.");
        return;
      }

      if (command === '!come') {
        attachTarget = null; attachType = null;
        attackTarget = null; collectItemsMode = false; followTarget = null; spinAttackMode = false;
        patrolMode = false; guardTarget = null; spinMode = false;
        const target = bot.players[username]?.entity;
        if (!target) return safeSendMessage('whisper', username, "Can't see you.");
        const p = target.position;
        bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
        safeSendMessage('whisper', username, "Coming!");
        return;
      }

      if (command === '!follow') {
        const targetName = args[1] || username;
        
        if (!bot.players[targetName]) {
          return safeSendMessage('whisper', username, `Player ${targetName} not found or offline.`);
        }
        
        const target = bot.players[targetName].entity;
        if (!target) {
          return safeSendMessage('whisper', username, `Cannot see ${targetName} (out of render distance).`);
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
        
        safeSendMessage('whisper', username, `Following ${targetName}!`);
        return;
      }

      // Add remaining commands here...
      if (customCommands[command]) { safeSendMessage('whisper', username, customCommands[command]); }
    }

    bot.on('whisper', (username, message) => {
      console.log('\x1b[35m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [WHISPER] ${username}: ${message}`);
      addMinecraftLog('WHISPER', `${username}: ${message}`);
      botStats.totalWhispers++;
      handleCommand(username, message);
    });

    bot.on('chat', (username, message) => {
      if (username === bot.username) return;
      console.log('\x1b[35m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [CHAT] ${username}: ${message}`);
      addMinecraftLog('CHAT', `${username}: ${message}`);
      botStats.totalMessages++;
      if (message.startsWith('!')) handleCommand(username, message);
    });

    bot.on('end', () => setTimeout(createBot, 15000));
    bot.on('error', (err) => console.log('Error:', err));
  } catch (err) {
    console.error('Failed to create bot:', err);
    addBotLog('ERROR', `Failed to create bot: ${err.message}`);
    setTimeout(createBot, 15000);
  }
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
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        margin: 0;
        padding: 20px;
        min-height: 100vh;
      }
      .container {
        max-width: 1400px;
        margin: 0 auto;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
        backdrop-filter: blur(10px);
      }
      h1 {
        color: #667eea;
        text-align: center;
        margin-bottom: 30px;
        font-size: 2.5em;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
      }
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 20px;
        margin-bottom: 30px;
      }
      .stat-card {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 25px;
        border-radius: 15px;
        text-align: center;
        transition: transform 0.3s, box-shadow 0.3s;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
      }
      .stat-card:hover {
        transform: translateY(-5px);
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      }
      .stat-value {
        font-size: 2.5em;
        font-weight: bold;
        margin: 10px 0;
        text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
      }
      .stat-label {
        font-size: 0.9em;
        opacity: 0.9;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .section {
        margin: 20px 0;
        padding: 25px;
        background: linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%);
        border-radius: 15px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      }
      .section h2 {
        color: #667eea;
        margin-top: 0;
        font-size: 1.5em;
        border-bottom: 2px solid #667eea;
        padding-bottom: 10px;
        margin-bottom: 20px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 10px;
      }
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #ddd;
      }
      th {
        background: #667eea;
        color: white;
        font-weight: bold;
        text-transform: uppercase;
        letter-spacing: 1px;
        font-size: 0.9em;
      }
      tr:hover {
        background: rgba(102, 126, 234, 0.1);
      }
      .online { color: #4CAF50; font-weight: bold; }
      .offline { color: #f44336; font-weight: bold; }
      .kicked { color: #ff9800; font-weight: bold; }
      .checking { color: #2196F3; font-weight: bold; }
      .player-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 15px;
      }
      .player-tag {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 20px;
        border-radius: 25px;
        font-size: 0.9em;
        box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        transition: transform 0.3s;
      }
      .player-tag:hover {
        transform: scale(1.05);
      }
      .bot-tag {
        background: linear-gradient(135deg, #ff9800 0%, #f44336 100%);
      }
      .log-container {
        max-height: 400px;
        overflow-y: auto;
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 20px;
        border-radius: 10px;
        font-family: 'Courier New', monospace;
        font-size: 0.9em;
        box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
      }
      .log-entry {
        margin: 8px 0;
        padding: 8px;
        border-left: 3px solid #667eea;
        padding-left: 15px;
        border-radius: 3px;
        transition: background 0.3s;
      }
      .log-entry:hover {
        background: rgba(255,255,255,0.05);
      }
      .log-info { border-left-color: #4CAF50; }
      .log-warn { border-left-color: #ff9800; }
      .log-error { border-left-color: #f44336; }
      .log-command { border-left-color: #2196F3; }
      .log-chat { border-left-color: #9C27B0; }
      .log-whisper { border-left-color: #00BCD4; }
      .uptime-badge {
        display: inline-block;
        background: #4CAF50;
        color: white;
        padding: 10px 20px;
        border-radius: 25px;
        font-size: 1.2em;
        font-weight: bold;
        animation: pulse 2s infinite;
      }
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      .grid-2col {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      @media (max-width: 768px) {
        .grid-2col {
          grid-template-columns: 1fr;
        }
        .container {
          padding: 15px;
        }
      }
      .badge {
        display: inline-block;
        padding: 5px 10px;
        border-radius: 15px;
        font-size: 0.8em;
        font-weight: bold;
        margin-left: 10px;
      }
      .badge-real { background: #4CAF50; color: white; }
      .badge-bot { background: #ff9800; color: white; }
      .event-card {
        background: white;
        padding: 15px;
        border-radius: 10px;
        margin: 10px 0;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .event-icon {
        font-size: 1.5em;
        margin-right: 10px;
      }
      .crash-prevention {
        background: #ff9800;
        color: white;
        padding: 5px 10px;
        border-radius: 15px;
        font-size: 0.8em;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>🎮 CloudAFK Bot Dashboard</h1>
      
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Server Status</div>
          <div class="stat-value ${botStats.serverStatus}">${botStats.serverStatus.toUpperCase()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Bot Status</div>
          <div class="stat-value ${botStats.botStatus}">${botStats.botStatus.toUpperCase()}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Players</div>
          <div class="stat-value">${botStats.currentPlayers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Real Players</div>
          <div class="stat-value">${botStats.realPlayers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Bot Players</div>
          <div class="stat-value">${botStats.botPlayers}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Commands Used</div>
          <div class="stat-value">${botStats.commandCount}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Crash Prevention</div>
          <div class="stat-value">${botStats.crashPrevention.totalBlocked}</div>
          ${botStats.crashPrevention.totalBlocked > 0 ? '<span class="crash-prevention">Active</span>' : ''}
        </div>
      </div>

      <div class="section">
        <h2>⏱️ Bot Uptime</h2>
        <div style="text-align: center;">
          <span class="uptime-badge">${botStats.botUptime > 0 ? Math.floor(botStats.botUptime / 60000) + ' minutes' : 'Offline'}</span>
        </div>
      </div>

      <div class="grid-2col">
        <div class="section">
          <h2>👥 All Players <span class="badge badge-real">Real: ${botStats.realPlayers}</span> <span class="badge badge-bot">Bots: ${botStats.botPlayers}</span></h2>
          <div class="player-list">
            ${botStats.realPlayerList.map(p => `<span class="player-tag">${p}</span>`).join('')}
            ${botStats.botPlayerList.map(p => `<span class="player-tag bot-tag">${p} (Bot)</span>`).join('')}
            ${botStats.playerList.length === 0 ? '<p>No players online</p>' : ''}
          </div>
        </div>

        <div class="section">
          <h2>📊 Live Activity Feed</h2>
          ${botStats.lastEvents.slice(0, 10).map(event => `
            <div class="event-card">
              <span class="event-icon">${event.icon}</span>
              <div>
                <strong>${event.player}</strong> ${event.action}
                <br>
                <small>${new Date(event.timestamp).toLocaleTimeString()} - ${event.details}</small>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="grid-2col">
        <div class="section">
          <h2>📜 Bot Console</h2>
          <div class="log-container">
            ${consoleLogs.filter(log => log.source === 'BOT').slice(-50).reverse().map(log => `
              <div class="log-entry log-${log.type.toLowerCase()}">
                <strong>[${log.type}]</strong> ${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <h2>💬 Minecraft Console</h2>
          <div class="log-container">
            ${consoleLogs.filter(log => log.source === 'MC').slice(-50).reverse().map(log => `
              <div class="log-entry log-${log.type.toLowerCase()}">
                <strong>[${log.type}]</strong> ${new Date(log.timestamp).toLocaleTimeString()} - ${log.message}
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <div class="section">
        <h2>📜 Connection History</h2>
        <h3>Recent Joins</h3>
        <table>
          <tr><th>Time</th><th>Username</th><th>Type</th></tr>
          ${botStats.joinHistory.slice(-10).reverse().map(h => `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.username}</td><td>${h.type}</td></tr>`).join('')}
        </table>
        
        <h3>Recent Disconnects</h3>
        <table>
          <tr><th>Time</th><th>Reason</th></tr>
          ${botStats.disconnectHistory.slice(-10).reverse().map(h => `<tr><td>${new Date(h.time).toLocaleString()}</td><td>${h.reason}</td></tr>`).join('')}
        </table>
        
        <h3>Recent Kicks</h3>
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

app.use((err, req, res, next) => {
  console.error('Web server error:', err);
  res.status(500).send('Internal Server Error');
});

app.listen(process.env.PORT || 3000, () => {
  console.log('\x1b[32m%s\x1b[0m', `[${new Date().toLocaleTimeString()}] [SYSTEM] Dashboard available at http://localhost:3000`);
  addBotLog('INFO', 'Web dashboard started');
});
});
