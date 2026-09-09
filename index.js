const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { 
  host: 'node-sg-free-01.tickhosting.com', 
  port: 50838, 
  version: '1.20.1', 
  auth: 'offline',
  checkTimeoutInterval: 60000,
  reconnectDelay: 3000
};

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';

const NUMBER_OF_BOTS = 5; // 5 bots

let bots = {};
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};
let botsCreated = 0;

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  console.log(`Creating ${NUMBER_OF_BOTS} bots...`);
  createNextBot();
});

function createNextBot() {
  if (botsCreated >= NUMBER_OF_BOTS) {
    console.log(`All ${NUMBER_OF_BOTS} bots created!`);
    return;
  }
  
  botsCreated++;
  const botUsername = `CloudAFK_Bot${botsCreated}`;
  console.log(`Creating bot ${botsCreated}/${NUMBER_OF_BOTS}: ${botUsername}`);
  
  createBot(botUsername);
  
  setTimeout(createNextBot, 5000);
}

function createBot(botUsername) {
  const botConfig = { ...config, username: botUsername };
  let bot;
  
  try {
    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    bots[botUsername] = bot;
    botStatus[botUsername] = 'connecting';
    addConsoleLog(`${botUsername} connecting...`);

    const keepAliveInterval = setInterval(() => {
      if (bot && botStatus[botUsername] === 'online') {
        bot.chat('/ping');
      }
    }, 30000);

    bot.on('spawn', () => {
      botStatus[botUsername] = 'online';
      addConsoleLog(`${botUsername} joined!`);
      
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      
      defaultMove.canDig = true;
      defaultMove.allow1by1towers = true;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.maxDropDown = 5;
      defaultMove.liquidCost = 5;
      defaultMove.avoidDamage = true;
      defaultMove.allowFreeMotion = true;
      defaultMove.allowEntityDetection = true;
      defaultMove.blocksToAvoid = new Set(['lava', 'water', 'fire', 'cactus']);
      
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.enablePathShortcuts = true;
      bot.pathfinder.thinkTimeout = 50;

      bot.followTarget = null;
      bot.attackTarget = null;
      bot.huntTarget = null;
      bot.mineBlock = null;
      bot.attackMobs = false;
      bot.protectMode = false;
      bot.freezeMode = false;
      bot.wanderMode = false;
      bot.attachTarget = null;
      bot.attachType = null;
      bot.autoBreakBlock = null;
      bot.textSpamInterval = null;
      bot.spamPrivateInterval = null;

      setInterval(() => {
        if (bot.followTarget && !bot.freezeMode) {
          const target = bot.players[bot.followTarget]?.entity;
          if (target) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
          }
        }
      }, 1000);

      setInterval(() => {
        if (bot.attackTarget && !bot.freezeMode) {
          const target = bot.players[bot.attackTarget]?.entity;
          if (target) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            if (bot.entity.position.distanceTo(target.position) < 3) {
              bot.attack(target);
            }
          }
        }
      }, 1000);
    });

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      if (!msg.includes('ping')) {
        addMCConsoleLog(`[${botUsername}] ${msg}`);
      }
    });

    bot.on('error', (err) => {
      addConsoleLog(`${botUsername} Error: ${err.message}`);
      botStatus[botUsername] = 'error';
    });

    bot.on('kicked', (reason) => {
      addConsoleLog(`${botUsername} Kicked: ${reason}`);
      botStatus[botUsername] = 'kicked';
      clearInterval(keepAliveInterval);
    });

    bot.on('end', (reason) => {
      botStatus[botUsername] = 'offline';
      addConsoleLog(`${botUsername} disconnected: ${reason}`);
      clearInterval(keepAliveInterval);
      
      setTimeout(() => {
        if (botStatus[botUsername] === 'offline') {
          addConsoleLog(`${botUsername} reconnecting...`);
          createBot(botUsername);
        }
      }, 5000);
    });

  } catch (e) {
    addConsoleLog(`${botUsername} Failed: ${e.message}`);
    botStatus[botUsername] = 'error';
    setTimeout(() => createBot(botUsername), 10000);
  }

  function addConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleLogs.push(log);
    if (consoleLogs.length > 200) consoleLogs.shift();
  }

  function addMCConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    mcConsoleLogs.push(log);
    if (mcConsoleLogs.length > 200) mcConsoleLogs.shift();
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
  }

  function safeWhisper(botInstance, target, text) {
    try { botInstance.whisper(target, text); } catch (e) {}
  }

  function getTargetBots(botArg) {
    if (!botArg || botArg.toLowerCase() === 'all') {
      return Object.values(bots).filter(b => b && botStatus[b.username] === 'online');
    }
    
    const targetBot = bots[botArg];
    if (targetBot && botStatus[botArg] === 'online') {
      return [targetBot];
    }
    
    const matchedBot = Object.values(bots).find(b => 
      b && b.username.toLowerCase().includes(botArg.toLowerCase()) && botStatus[b.username] === 'online'
    );
    
    return matchedBot ? [matchedBot] : [];
  }

  function handleCommand(username, message) {
    if (!myUsername.includes(username.toLowerCase())) {
      safeWhisper(bot, username, "Access denied.");
      return;
    }

    const args = message.trim().split(' ');
    const command = args[0]?.toLowerCase();
    
    let botArg = null;
    const lastArg = args[args.length - 1];
    const botNames = ['all'];
    for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
      botNames.push(`bot${i}`);
      botNames.push(`cloudafk_bot${i}`);
    }
    
    if (lastArg && botNames.includes(lastArg.toLowerCase())) {
      botArg = lastArg;
      args.pop();
    }
    
    const targetBots = getTargetBots(botArg);
    
    if (targetBots.length === 0) {
      safeWhisper(bot, username, "No bots online.");
      return;
    }

    targetBots.forEach(targetBot => {
      executeCommand(targetBot, username, args, command);
    });
  }

  function executeCommand(botInstance, username, args, command) {
    const botName = botInstance.username;
    
    try {
      if (command === '!coords') { const p = botInstance.entity.position; safeWhisper(botInstance, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeWhisper(botInstance, username, `${botName} HP:${botInstance.health}/20`); return; }
      if (command === '!players') { safeWhisper(botInstance, username, `Online: ${Object.keys(botInstance.players).join(', ')}`); return; }
      if (command === '!jump') { botInstance.setControlState('jump', true); setTimeout(() => botInstance.setControlState('jump', false), 500); return; }
      if (command === '!stop') {
        botInstance.pathfinder.setGoal(null); botInstance.clearControlStates();
        botInstance.followTarget = null; botInstance.attackTarget = null; botInstance.huntTarget = null;
        return;
      }
      if (command === '!killbot') { botInstance.chat('/kill'); return; }
      if (command === '!tpbring') {
        botInstance.chat(`/tp ${botInstance.username} ${username}`);
        const player = botInstance.players[username];
        if (player?.entity?.position) botInstance.entity.position = player.entity.position.clone();
        return;
      }
      if (command === '!tp') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) botInstance.entity.position = target.position.clone();
        return;
      }
      if (command === '!call') {
        const pos = botInstance.entity.position;
        botInstance.chat(`/tp ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        return;
      }
      if (command === '!come') {
        botInstance.followTarget = null;
        const target = botInstance.players[username]?.entity;
        if (!target) return;
        const distance = botInstance.entity.position.distanceTo(target.position);
        if (distance > 100) {
          botInstance.entity.position = target.position.clone();
        } else {
          botInstance.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
        }
        return;
      }
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (botInstance.players[targetName]) botInstance.followTarget = targetName;
        return;
      }
      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if (!isNaN(x)) botInstance.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
        return;
      }
      if (command === '!dig') {
        const block = botInstance.blockAtCursor(10);
        if (block && botInstance.canDigBlock(block)) botInstance.dig(block).catch(() => {});
        return;
      }
      if (command === '!mine') {
        if (args[1] === 'stop') { botInstance.mineBlock = null; }
        else if (args[1]) { botInstance.mineBlock = args.slice(1).join('_'); }
        return;
      }
      if (command === '!attack') {
        if (args[1] && botInstance.players[args[1]]) botInstance.attackTarget = args[1];
        return;
      }
      if (command === '!hunt') {
        if (args[1] && botInstance.players[args[1]]) botInstance.huntTarget = args[1];
        return;
      }
      if (command === '!attackmobs') { botInstance.attackMobs = !botInstance.attackMobs; return; }
      if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
      if (command === '!survival' || command === '!survial') { botInstance.chat('/gamemode survival'); return; }
      if (command === '!creative') { botInstance.chat('/gamemode creative'); return; }
      if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
      if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
      if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
      if (command === '!skydrivebot') { botInstance.chat('/effect give ' + botInstance.username + ' minecraft:levitation 10 100'); return; }
      if (command === '!healthgen') { botInstance.chat('/effect give ' + botInstance.username + ' minecraft:instant_health 1 255'); return; }
      if (command === '!stopserver') { botInstance.chat('/stop'); return; }
      if (command === '!leakcoords') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) botInstance.chat(`${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!drop') { const h = botInstance.heldItem; if (h) botInstance.tossStack(h); return; }
      if (command === '!dropall') { botInstance.inventory.items().forEach(i => botInstance.tossStack(i).catch(() => {})); return; }
      if (command === '!equip') {
        const item = botInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        if (item) botInstance.equip(item, 'hand').catch(() => {});
        return;
      }
      if (command === '!nearbyplayers') {
        const list = Object.values(botInstance.players).filter(p => p.entity && p.username !== botInstance.username).map(p => p.username);
        safeWhisper(botInstance, username, list.length ? `Nearby: ${list.join(', ')}` : "No players");
        return;
      }
      if (command === '!health') {
        const target = botInstance.players[args[1]]?.entity || botInstance.players[username]?.entity;
        if (target) safeWhisper(botInstance, username, `HP: ${target.health || 'unknown'}`);
        return;
      }
      if (command === '!whereis') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) safeWhisper(botInstance, username, `${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!ping') { safeWhisper(botInstance, username, `Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
      if (command === '!sneak') { botInstance.setControlState('sneak', true); return; }
      if (command === '!unsneak') { botInstance.setControlState('sneak', false); return; }
      if (command === '!freeze') {
        botInstance.freezeMode = !botInstance.freezeMode;
        if (botInstance.freezeMode) { botInstance.pathfinder.setGoal(null); botInstance.clearControlStates(); }
        return;
      }
      if (command === '!wander') { botInstance.wanderMode = { radius: parseInt(args[1]) || 10, origin: botInstance.entity.position.clone() }; return; }
      if (command === '!stopwander') { botInstance.wanderMode = false; botInstance.pathfinder.setGoal(null); return; }
      
    } catch (e) {}
  }

  bot.on('whisper', (username, message) => handleCommand(username, message));
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!')) handleCommand(username, message);
  });
}

// Website
app.get('/', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bots</title>
      <meta http-equiv="refresh" content="5">
      <style>
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; margin: 10px 0; }
        .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 300px; overflow-y: auto; margin: 10px 0; }
        .log { font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bots Dashboard</h1>
      <div class="card"><h3>Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
      <div class="console"><h3>Bot Console</h3>${consoleLogs.slice(-30).map(l => `<div class="log">${l}</div>`).join('')}</div>
    </body>
    </html>
  `);
});

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
}
