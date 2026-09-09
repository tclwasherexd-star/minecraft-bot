const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();
const http = require('http').createServer(app);

const config = { 
  host: 'node-sg-free-01.tickhosting.com', 
  port: 50838, 
  version: '1.20.1', 
  auth: 'offline',
  checkTimeoutInterval: 600000,
  hideErrors: true,
  connectTimeout: 120000,
  physicsEnabled: false
};

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';

const botNames = [
  'ShadowBlade',
  'NightStalker',
  'DarkReaper',
  'GhostWalker',
  'StormBreaker'
];

const NUMBER_OF_BOTS = 5;

let bots = {};
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};
let botPlaytime = {};
let botJoinTime = {};
let botsCreated = 0;
let reconnectCount = {};
let totalCommandsExecuted = 0;
let botPositions = {};
let commandHistory = [];
let processedCommands = new Set();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function handleCommand(username, message) {
  if (!myUsername.includes(username.toLowerCase())) return;

  const recentKey = `${username}:${message}`;
  if (processedCommands.has(recentKey)) return;
  processedCommands.add(recentKey);
  setTimeout(() => processedCommands.delete(recentKey), 2000);

  totalCommandsExecuted++;
  commandHistory.push(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
  if (commandHistory.length > 50) commandHistory.shift();
  
  const args = message.trim().split(' ');
  const command = args[0]?.toLowerCase();
  let botArg = null;
  let commandArgs = args;
  
  const textCommands = ['!talk', '!shout', '!msg', '!echo'];
  
  if (textCommands.includes(command)) {
    const possibleBotArg = args[1];
    const allBotNames = ['all', ...botNames.map(n => n.toLowerCase())];
    if (possibleBotArg && allBotNames.includes(possibleBotArg.toLowerCase())) {
      botArg = possibleBotArg;
      commandArgs = [args[0], ...args.slice(2)];
    }
  } else {
    const lastArg = args[args.length - 1];
    const allBotNames = ['all', ...botNames.map(n => n.toLowerCase())];
    if (lastArg && allBotNames.includes(lastArg.toLowerCase())) {
      botArg = lastArg;
      commandArgs = args.slice(0, -1);
    }
  }
  
  const targetBots = getTargetBots(botArg);
  
  if (command === '!line') {
    const ownerPlayer = bots[targetBots[0]?.username]?.players[username]?.entity;
    if (ownerPlayer) {
      const ownerPos = ownerPlayer.position;
      const yaw = ownerPlayer.yaw;
      
      targetBots.forEach((targetBot, index) => {
        const offset = (index - (targetBots.length - 1) / 2) * 2;
        const lineX = ownerPos.x + Math.sin(yaw) * 3;
        const lineZ = ownerPos.z + Math.cos(yaw) * 3;
        
        targetBot.entity.position.set(
          lineX + Math.cos(yaw) * offset,
          ownerPos.y,
          lineZ - Math.sin(yaw) * offset
        );
      });
    }
    return;
  }
  
  targetBots.forEach((targetBot, index) => {
    setTimeout(() => {
      executeCommand(targetBot, username, commandArgs, command);
    }, index * 300);
  });
}

function getTargetBots(botArg) {
  if (!botArg || botArg.toLowerCase() === 'all') {
    return Object.values(bots).filter(b => b && b.entity && botStatus[b.username] === 'online');
  }
  const targetBot = bots[botArg];
  if (targetBot && targetBot.entity && botStatus[botArg] === 'online') return [targetBot];
  const matchedBot = Object.values(bots).find(b => 
    b && b.entity && b.username.toLowerCase().includes(botArg.toLowerCase()) && botStatus[b.username] === 'online'
  );
  return matchedBot ? [matchedBot] : [];
}

function executeCommand(botInstance, username, args, command) {
  const botName = botInstance.username;
  try {
    if (!botInstance.entity) return;
    
    if (command === '!coords') { const p = botInstance.entity.position; safeWhisper(botInstance, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { safeWhisper(botInstance, username, `${botName} HP:${botInstance.health}/20`); return; }
    if (command === '!jump') { botInstance.setControlState('jump', true); setTimeout(() => botInstance.setControlState('jump', false), 500); return; }
    if (command === '!stop') {
      botInstance.pathfinder.setGoal(null); botInstance.clearControlStates();
      botInstance.followTarget = null; botInstance.attackTarget = null; botInstance.comingTo = null; botInstance.linePosition = null;
      return;
    }
    if (command === '!killbot') { botInstance.chat('/kill'); return; }
    
    if (command === '!tpbring') {
      const player = botInstance.players[username];
      if (player?.entity?.position) {
        botInstance.entity.position = player.entity.position.clone();
      } else {
        botInstance.chat(`/tp ${botInstance.username} ${username}`);
      }
      return;
    }
    
    if (command === '!tp') {
      const target = botInstance.players[args[1]]?.entity;
      if (target) {
        botInstance.entity.position = target.position.clone();
      } else if (args[1]) {
        botInstance.chat(`/tp ${botInstance.username} ${args[1]}`);
      }
      return;
    }
    
    if (command === '!come') {
      const target = botInstance.players[username]?.entity;
      if (target?.position) {
        botInstance.entity.position = target.position.clone();
      }
      botInstance.comingTo = null;
      return;
    }
    
    if (command === '!follow') {
      const targetName = args[1] || username;
      const target = botInstance.players[targetName]?.entity;
      if (target?.position) {
        botInstance.entity.position = target.position.clone();
        botInstance.followTarget = targetName;
      }
      return;
    }
    
    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if (!isNaN(x)) {
        botInstance.entity.position.set(x, y, z);
      }
      return;
    }
    
    if (command === '!attack') {
      const targetName = args[1];
      const target = botInstance.players[targetName]?.entity;
      if (target?.position) {
        botInstance.entity.position = target.position.clone();
        botInstance.attackTarget = targetName;
        botInstance.attack(target);
      }
      return;
    }
    
    if (command === '!hunt') {
      const targetName = args[1];
      const target = botInstance.players[targetName]?.entity;
      if (target?.position) {
        botInstance.entity.position = target.position.clone();
        botInstance.huntTarget = targetName;
        botInstance.attack(target);
      }
      return;
    }
    
    if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
    if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
    if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
    if (command === '!echo') { safeWhisper(botInstance, username, args.slice(1).join(' ')); return; }
    
    if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
    if (command === '!ping') { safeWhisper(botInstance, username, `Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
    if (command === '!players') { safeWhisper(botInstance, username, `Online: ${Object.keys(botInstance.players).join(', ')}`); return; }
    if (command === '!survival') { botInstance.chat('/gamemode survival'); return; }
    if (command === '!creative') { botInstance.chat('/gamemode creative'); return; }
    if (command === '!mine') { if (args[1]) botInstance.mineBlock = args.slice(1).join('_'); return; }
    if (command === '!stopmine') { botInstance.mineBlock = null; return; }
    if (command === '!dig') { const block = botInstance.blockAtCursor(10); if (block) botInstance.dig(block).catch(() => {}); return; }
    if (command === '!drop') { const h = botInstance.heldItem; if (h) botInstance.tossStack(h); return; }
    if (command === '!dropall') { botInstance.inventory.items().forEach(i => botInstance.tossStack(i).catch(() => {})); return; }
    if (command === '!equip') { const item = botInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_'))); if (item) botInstance.equip(item, 'hand').catch(() => {}); return; }
    if (command === '!armor') {
      const armor = botInstance.inventory.items().filter(i => i.name.includes('helmet') || i.name.includes('chestplate') || i.name.includes('leggings') || i.name.includes('boots'));
      armor.forEach(item => {
        try {
          if (item.name.includes('helmet')) botInstance.equip(item, 'head');
          if (item.name.includes('chestplate')) botInstance.equip(item, 'torso');
          if (item.name.includes('leggings')) botInstance.equip(item, 'legs');
          if (item.name.includes('boots')) botInstance.equip(item, 'feet');
        } catch (e) {}
      });
      return;
    }
    if (command === '!sneak') { botInstance.setControlState('sneak', true); return; }
    if (command === '!unsneak') { botInstance.setControlState('sneak', false); return; }
    if (command === '!wander') { botInstance.wanderMode = { radius: parseInt(args[1]) || 10, origin: botInstance.entity.position.clone() }; return; }
    if (command === '!stopwander') { botInstance.wanderMode = false; return; }
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
    if (command === '!exp') { safeWhisper(botInstance, username, `XP: ${botInstance.experience.level}`); return; }
    if (command === '!gamemode') { safeWhisper(botInstance, username, `Gamemode: ${botInstance.game.gameMode}`); return; }
    if (command === '!uptime') { safeWhisper(botInstance, username, `Uptime: ${fmtTime(Date.now() - botJoinTime[botName])}`); return; }
    
  } catch (e) {}
}

function safeWhisper(botInstance, target, text) {
  try { if (botInstance.entity) botInstance.whisper(target, text); } catch (e) {}
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  global.startTime = Date.now();
  createNextBot();
});

function createNextBot() {
  if (botsCreated >= NUMBER_OF_BOTS) return;
  const botUsername = botNames[botsCreated];
  botsCreated++;
  createBot(botUsername);
  setTimeout(createNextBot, 20000);
}

function createBot(botUsername) {
  if (bots[botUsername] && bots[botUsername].entity) return;
  
  reconnectCount[botUsername] = reconnectCount[botUsername] || 0;
  if (reconnectCount[botUsername] > 5) {
    setTimeout(() => { reconnectCount[botUsername] = 0; createBot(botUsername); }, 300000);
    return;
  }

  const botConfig = { ...config, username: botUsername };
  let bot;
  
  try {
    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    bots[botUsername] = bot;
    botStatus[botUsername] = 'connecting';
    botPlaytime[botUsername] = botPlaytime[botUsername] || 0;

    bot.once('spawn', () => {
      botStatus[botUsername] = 'online';
      botJoinTime[botUsername] = Date.now();
      reconnectCount[botUsername] = 0;
      
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = true;
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.thinkTimeout = 100;

      bot.followTarget = null;
      bot.attackTarget = null;
      bot.huntTarget = null;
      bot.comingTo = null;
      bot.linePosition = null;
      bot.mineBlock = null;
      bot.wanderMode = false;
    });

    bot.on('error', (err) => {});
    bot.on('kicked', () => { botStatus[botUsername] = 'kicked'; reconnectCount[botUsername]++; });
    bot.on('end', () => { botStatus[botUsername] = 'offline'; setTimeout(() => createBot(botUsername), 30000); });

  } catch (e) {
    botStatus[botUsername] = 'error';
    setTimeout(() => createBot(botUsername), 30000);
  }

  bot.on('whisper', (username, message) => {
    if (myUsername.includes(username.toLowerCase())) handleCommand(username, message);
  });
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!') && myUsername.includes(username.toLowerCase())) {
      handleCommand(username, message);
    }
  });
}

// WEBSITE
app.post('/api/botcommand', (req, res) => {
  const cmd = req.body.command;
  if (cmd) handleCommand(myUsername[0], cmd);
  res.redirect('/');
});

app.get('/', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  const memUsage = process.memoryUsage();
  const uptime = fmtTime(Date.now() - (global.startTime || Date.now()));
  
  let botCards = botNames.map(name => {
    const status = botStatus[name] || 'offline';
    const playtime = fmtTime((botPlaytime[name] || 0) + (botJoinTime[name] ? Date.now() - botJoinTime[name] : 0));
    let statusColor = '#ff4444';
    if (status === 'online') statusColor = '#4CAF50';
    else if (status === 'connecting') statusColor = '#FFA500';
    return `<div style="background: rgba(255,255,255,0.05); border-radius: 15px; padding: 20px; text-align: center;"><h3>${name}</h3><div style="color: ${statusColor}; font-weight: bold; font-size: 1.2em;">${status}</div><div style="color: #4CAF50;">${playtime}</div></div>`;
  }).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot Army</title>
      <meta http-equiv="refresh" content="10">
      <style>
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; }
        .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .bots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin: 20px 0; }
        form { display: flex; gap: 10px; margin: 10px 0; }
        input { flex: 1; padding: 10px; border-radius: 5px; border: none; background: #16213e; color: white; }
        button { padding: 10px 20px; background: #4CAF50; border: none; border-radius: 5px; color: white; cursor: pointer; }
        .command-list { background: #16213e; border-radius: 10px; padding: 15px; margin: 20px 0; max-height: 300px; overflow-y: auto; }
        .command-list h2 { color: #4CAF50; margin-bottom: 10px; }
        .cmd { font-family: monospace; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #333; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bot Army</h1>
      <div class="grid">
        <div class="card"><h3>Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
        <div class="card"><h3>RAM</h3><div class="value">${Math.round(memUsage.heapUsed / 1024 / 1024)}MB</div></div>
        <div class="card"><h3>Uptime</h3><div class="value">${uptime}</div></div>
        <div class="card"><h3>Commands</h3><div class="value">${totalCommandsExecuted}</div></div>
      </div>
      <div class="bots">${botCards}</div>
      <div class="command-list">
        <h2>All Commands (NO DISTANCE LIMIT)</h2>
        <div class="cmd">!come [bot] - TP to you</div>
        <div class="cmd">!tpbring [bot] - TP to you</div>
        <div class="cmd">!follow [player] [bot] - TP + follow</div>
        <div class="cmd">!goto [x] [y] [z] [bot] - TP to coords</div>
        <div class="cmd">!attack [player] [bot] - TP + attack</div>
        <div class="cmd">!hunt [player] [bot] - TP + attack</div>
        <div class="cmd">!line [bot] - Line up</div>
        <div class="cmd">!talk [bot] [msg] - Say message</div>
        <div class="cmd">!shout [bot] [msg] - Shout</div>
        <div class="cmd">!msg [bot] [player] [msg] - Whisper</div>
        <div class="cmd">!stop [bot] - Stop all</div>
        <div class="cmd">!jump [bot] - Jump</div>
        <div class="cmd">!killbot [bot] - Kill bot</div>
        <div class="cmd">!coords [bot] - Show coords</div>
        <div class="cmd">!status [bot] - Show HP</div>
        <div class="cmd">!ping [bot] - Check ping</div>
        <div class="cmd">!players [bot] - List players</div>
        <div class="cmd">!survival [bot] - Survival</div>
        <div class="cmd">!creative [bot] - Creative</div>
        <div class="cmd">!mine [bot] [block] - Auto mine</div>
        <div class="cmd">!stopmine [bot] - Stop mining</div>
        <div class="cmd">!dig [bot] - Dig block</div>
        <div class="cmd">!drop [bot] - Drop item</div>
        <div class="cmd">!dropall [bot] - Drop all</div>
        <div class="cmd">!equip [bot] [item] - Equip</div>
        <div class="cmd">!armor [bot] - Wear armor</div>
        <div class="cmd">!sneak [bot] - Sneak</div>
        <div class="cmd">!unsneak [bot] - Stand</div>
        <div class="cmd">!wander [bot] - Wander</div>
        <div class="cmd">!stopwander [bot] - Stop wander</div>
        <div class="cmd">!nearbyplayers [bot] - Nearby</div>
        <div class="cmd">!health [bot] [player] - HP</div>
        <div class="cmd">!whereis [bot] [player] - Find</div>
        <div class="cmd">!exp [bot] - XP</div>
        <div class="cmd">!gamemode [bot] - Gamemode</div>
        <div class="cmd">!uptime [bot] - Uptime</div>
        <div class="cmd">!kick [bot] [player] - Kick</div>
        <div class="cmd">!echo [bot] [msg] - Echo</div>
      </div>
      <form action="/api/botcommand" method="POST"><input type="text" name="command" placeholder="Bot command... !come all" required><button>Send</button></form>
    </body>
    </html>
  `);
});

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}
