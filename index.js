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
  hideErrors: true,
  checkTimeoutInterval: 120000
};

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];

const botNames = [
  'ShadowBlade',
  'NightStalker',
  'DarkReaper',
  'GhostWalker',
  'StormBreaker'
];

const NUMBER_OF_BOTS = 5;

let bots = {};
let botStatus = {};
let botPlaytime = {};
let botJoinTime = {};
let totalCommandsExecuted = 0;
let commandHistory = [];
let mcConsoleLogs = [];
let consoleLogs = [];

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function handleCommand(username, message) {
  if (!myUsername.includes(username.toLowerCase())) return;

  totalCommandsExecuted++;
  commandHistory.push(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
  if (commandHistory.length > 50) commandHistory.shift();
  
  const args = message.trim().split(' ');
  const command = args[0]?.toLowerCase();
  let botArg = null;
  
  const textCommands = ['!talk', '!shout', '!msg', '!echo'];
  
  if (textCommands.includes(command)) {
    const possibleBotArg = args[1];
    const allBotNames = ['all', ...botNames.map(n => n.toLowerCase())];
    if (possibleBotArg && allBotNames.includes(possibleBotArg.toLowerCase())) {
      botArg = possibleBotArg;
      args.splice(1, 1);
    }
  } else {
    const lastArg = args[args.length - 1];
    const allBotNames = ['all', ...botNames.map(n => n.toLowerCase())];
    if (lastArg && allBotNames.includes(lastArg.toLowerCase())) {
      botArg = lastArg;
      args.pop();
    }
  }
  
  const targetBots = getTargetBots(botArg);
  if (targetBots.length === 0) return;
  
  targetBots.forEach((targetBot, index) => {
    setTimeout(() => {
      executeCommand(targetBot, username, args, command);
    }, index * 200);
  });
}

function getTargetBots(botArg) {
  if (!botArg || botArg.toLowerCase() === 'all') {
    return Object.values(bots).filter(b => b && b.entity);
  }
  const targetBot = bots[botArg];
  if (targetBot && targetBot.entity) return [targetBot];
  const matchedBot = Object.values(bots).find(b => 
    b && b.entity && b.username.toLowerCase().includes(botArg.toLowerCase())
  );
  return matchedBot ? [matchedBot] : [];
}

function executeCommand(botInstance, username, args, command) {
  const botName = botInstance.username;
  try {
    if (!botInstance.entity) return;
    
    if (command === '!coords') { const p = botInstance.entity.position; safeWhisper(botInstance, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { safeWhisper(botInstance, username, `${botName} HP:${botInstance.health}/20`); return; }
    if (command === '!ping') { safeWhisper(botInstance, username, `${botName} Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
    if (command === '!players') { safeWhisper(botInstance, username, `Online: ${Object.keys(botInstance.players).join(', ')}`); return; }
    if (command === '!exp') { safeWhisper(botInstance, username, `XP: ${botInstance.experience.level}`); return; }
    if (command === '!gamemode') { safeWhisper(botInstance, username, `Gamemode: ${botInstance.game.gameMode}`); return; }
    if (command === '!uptime') { safeWhisper(botInstance, username, `Uptime: ${fmtTime(Date.now() - botJoinTime[botName])}`); return; }
    if (command === '!tpbring') {
      const player = botInstance.players[username];
      if (player?.entity?.position) {
        botInstance.entity.position.set(player.entity.position.x, player.entity.position.y, player.entity.position.z);
        safeWhisper(botInstance, username, `${botName} teleported to you!`);
      }
      return;
    }
    if (command === '!tp') {
      const target = botInstance.players[args[1]]?.entity;
      if (target) {
        botInstance.entity.position.set(target.position.x, target.position.y, target.position.z);
        safeWhisper(botInstance, username, `${botName} teleported to ${args[1]}!`);
      }
      return;
    }
    if (command === '!come') {
      const target = botInstance.players[username]?.entity;
      if (target) {
        botInstance.entity.position.set(target.position.x, target.position.y, target.position.z);
        safeWhisper(botInstance, username, `${botName} teleported to you!`);
      }
      return;
    }
    if (command === '!follow') {
      const targetName = args[1] || username;
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        botInstance.entity.position.set(target.position.x, target.position.y, target.position.z);
        botInstance.followTarget = targetName;
        safeWhisper(botInstance, username, `${botName} teleported and following ${targetName}!`);
      }
      return;
    }
    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        botInstance.entity.position.set(x, y, z);
        safeWhisper(botInstance, username, `${botName} teleported to ${x},${y},${z}!`);
      }
      return;
    }
    if (command === '!line') {
      const ownerPlayer = botInstance.players[username]?.entity;
      if (ownerPlayer) {
        const allOnlineBots = getTargetBots('all');
        const botIndex = allOnlineBots.indexOf(botInstance);
        const offset = (botIndex - (allOnlineBots.length - 1) / 2) * 2;
        const ownerPos = ownerPlayer.position;
        const yaw = ownerPlayer.yaw;
        const lineX = ownerPos.x + Math.sin(yaw) * 3;
        const lineZ = ownerPos.z + Math.cos(yaw) * 3;
        
        botInstance.entity.position.set(
          lineX + Math.cos(yaw) * offset,
          ownerPos.y,
          lineZ - Math.sin(yaw) * offset
        );
        safeWhisper(botInstance, username, `${botName} lined up!`);
      }
      return;
    }
    if (command === '!attack') {
      const targetName = args[1];
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        botInstance.entity.position.set(target.position.x, target.position.y, target.position.z);
        botInstance.attack(target);
        safeWhisper(botInstance, username, `${botName} teleported and attacking ${targetName}!`);
      }
      return;
    }
    if (command === '!hunt') {
      const targetName = args[1];
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        botInstance.entity.position.set(target.position.x, target.position.y, target.position.z);
        botInstance.attack(target);
        safeWhisper(botInstance, username, `${botName} hunting ${targetName}!`);
      }
      return;
    }
    if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
    if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
    if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
    if (command === '!echo') { safeWhisper(botInstance, username, args.slice(1).join(' ')); return; }
    if (command === '!stop') {
      botInstance.followTarget = null;
      botInstance.attackTarget = null;
      safeWhisper(botInstance, username, `${botName} stopped!`);
      return;
    }
    if (command === '!jump') { botInstance.setControlState('jump', true); setTimeout(() => botInstance.setControlState('jump', false), 500); return; }
    if (command === '!killbot') { botInstance.chat('/kill'); return; }
    if (command === '!survival') { botInstance.chat('/gamemode survival'); return; }
    if (command === '!creative') { botInstance.chat('/gamemode creative'); return; }
    if (command === '!sneak') { botInstance.setControlState('sneak', true); return; }
    if (command === '!unsneak') { botInstance.setControlState('sneak', false); return; }
    if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
    if (command === '!mine') { if (args[1]) botInstance.mineBlock = args.slice(1).join('_'); return; }
    if (command === '!stopmine') { botInstance.mineBlock = null; return; }
    if (command === '!dig') { const block = botInstance.blockAtCursor(10); if (block) botInstance.dig(block).catch(() => {}); return; }
    if (command === '!drop') { const h = botInstance.heldItem; if (h) botInstance.tossStack(h); return; }
    if (command === '!dropall') { botInstance.inventory.items().forEach(i => botInstance.tossStack(i).catch(() => {})); return; }
    if (command === '!equip') { const item = botInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_'))); if (item) botInstance.equip(item, 'hand').catch(() => {}); return; }
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
  } catch (e) {}
}

function safeWhisper(botInstance, target, text) {
  try { if (botInstance.entity) botInstance.whisper(target, text); } catch (e) {}
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  global.startTime = Date.now();
  createAllBots();
});

function createAllBots() {
  botNames.forEach((name, index) => {
    setTimeout(() => {
      createBot(name);
    }, index * 5000);
  });
}

function createBot(botUsername) {
  if (bots[botUsername] && bots[botUsername].entity && botStatus[botUsername] === 'online') return;

  const botConfig = { ...config, username: botUsername };
  let bot;
  
  try {
    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    bots[botUsername] = bot;
    botStatus[botUsername] = 'connecting';
    botPlaytime[botUsername] = botPlaytime[botUsername] || 0;
    consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} connecting...`);
    if (consoleLogs.length > 100) consoleLogs.shift();

    bot.once('spawn', () => {
      botStatus[botUsername] = 'online';
      botJoinTime[botUsername] = Date.now();
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} joined!`);
      if (consoleLogs.length > 100) consoleLogs.shift();
      
      bot.followTarget = null;
      bot.attackTarget = null;
      bot.mineBlock = null;
      
      bot.followInterval = setInterval(() => {
        if (bot.followTarget && bot.entity) {
          const target = bot.players[bot.followTarget]?.entity;
          if (target) {
            bot.entity.position.set(target.position.x, target.position.y, target.position.z);
          }
        }
      }, 1000);
      
      bot.mineInterval = setInterval(() => {
        if (bot.mineBlock && bot.entity) {
          const blocks = bot.findBlocks({ matching: b => b.name.includes(bot.mineBlock), maxDistance: 16, count: 1 });
          if (blocks.length > 0) {
            const block = bot.blockAt(blocks[0]);
            if (block && bot.canDigBlock(block)) bot.dig(block).catch(() => {});
          }
        }
      }, 500);
    });

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      mcConsoleLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      if (mcConsoleLogs.length > 50) mcConsoleLogs.shift();
    });

    bot.on('error', () => {
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} error`);
      if (consoleLogs.length > 100) consoleLogs.shift();
    });

    bot.on('kicked', () => {
      botStatus[botUsername] = 'kicked';
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} kicked, reconnecting...`);
      if (consoleLogs.length > 100) consoleLogs.shift();
      setTimeout(() => createBot(botUsername), 5000);
    });

    bot.on('end', () => {
      botStatus[botUsername] = 'offline';
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} disconnected, reconnecting...`);
      if (consoleLogs.length > 100) consoleLogs.shift();
      setTimeout(() => createBot(botUsername), 5000);
    });

  } catch (e) {
    botStatus[botUsername] = 'error';
    consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} failed, retrying...`);
    if (consoleLogs.length > 100) consoleLogs.shift();
    setTimeout(() => createBot(botUsername), 5000);
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

app.post('/api/mccommand', (req, res) => {
  const cmd = req.body.command;
  if (cmd) {
    Object.values(bots).forEach(b => { if (b && b.entity) b.chat(cmd); });
  }
  res.redirect('/');
});

app.get('/', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  const uptime = fmtTime(Date.now() - (global.startTime || Date.now()));
  
  let botCards = botNames.map(name => {
    const status = botStatus[name] || 'offline';
    const playtime = fmtTime((botPlaytime[name] || 0) + (botJoinTime[name] ? Date.now() - botJoinTime[name] : 0));
    let statusColor = '#ff4444';
    if (status === 'online') statusColor = '#4CAF50';
    else if (status === 'connecting') statusColor = '#FFA500';
    return `<div style="background: #16213e; border-radius: 10px; padding: 15px; text-align: center;"><h3>${name}</h3><div style="color: ${statusColor}; font-weight: bold;">${status}</div><div style="color: #4CAF50;">${playtime}</div></div>`;
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
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; }
        .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .bots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; margin: 20px 0; }
        form { display: flex; gap: 10px; margin: 10px 0; }
        input { flex: 1; padding: 10px; border-radius: 5px; border: none; background: #16213e; color: white; }
        button { padding: 10px 20px; background: #4CAF50; border: none; border-radius: 5px; color: white; cursor: pointer; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 150px; overflow-y: auto; margin: 10px 0; }
        .console h3 { color: #4CAF50; margin-bottom: 10px; }
        .log { font-family: monospace; font-size: 12px; padding: 3px 0; }
        .command-list { background: #16213e; border-radius: 10px; padding: 15px; margin: 20px 0; max-height: 300px; overflow-y: auto; }
        .command-list h2 { color: #4CAF50; margin-bottom: 10px; }
        .cmd { font-family: monospace; font-size: 13px; padding: 5px 0; border-bottom: 1px solid #333; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bot Army</h1>
      <div class="grid">
        <div class="card"><h3>Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
        <div class="card"><h3>Uptime</h3><div class="value">${uptime}</div></div>
        <div class="card"><h3>Commands</h3><div class="value">${totalCommandsExecuted}</div></div>
      </div>
      <div class="bots">${botCards}</div>
      
      <div class="command-list">
        <h2>All Commands</h2>
        <div class="cmd">!come [bot] - TP to you</div>
        <div class="cmd">!tpbring [bot] - TP to you</div>
        <div class="cmd">!follow [player] [bot] - TP + follow</div>
        <div class="cmd">!goto [x] [y] [z] [bot] - TP to coords</div>
        <div class="cmd">!attack [player] [bot] - TP + attack</div>
        <div class="cmd">!hunt [player] [bot] - TP + attack</div>
        <div class="cmd">!line [bot] - Line up</div>
        <div class="cmd">!talk [bot] [msg] - Say</div>
        <div class="cmd">!shout [bot] [msg] - Shout</div>
        <div class="cmd">!msg [bot] [player] [msg] - Whisper</div>
        <div class="cmd">!echo [bot] [msg] - Echo</div>
        <div class="cmd">!stop [bot] - Stop</div>
        <div class="cmd">!jump [bot] - Jump</div>
        <div class="cmd">!killbot [bot] - Kill</div>
        <div class="cmd">!coords [bot] - Coords</div>
        <div class="cmd">!status [bot] - HP</div>
        <div class="cmd">!ping [bot] - Ping</div>
        <div class="cmd">!players [bot] - Players</div>
        <div class="cmd">!survival [bot] - Survival</div>
        <div class="cmd">!creative [bot] - Creative</div>
        <div class="cmd">!mine [bot] [block] - Mine</div>
        <div class="cmd">!stopmine [bot] - Stop mine</div>
        <div class="cmd">!dig [bot] - Dig</div>
        <div class="cmd">!drop [bot] - Drop</div>
        <div class="cmd">!dropall [bot] - Drop all</div>
        <div class="cmd">!equip [bot] [item] - Equip</div>
        <div class="cmd">!sneak [bot] - Sneak</div>
        <div class="cmd">!unsneak [bot] - Stand</div>
        <div class="cmd">!nearbyplayers [bot] - Nearby</div>
        <div class="cmd">!health [bot] [player] - HP</div>
        <div class="cmd">!whereis [bot] [player] - Find</div>
        <div class="cmd">!exp [bot] - XP</div>
        <div class="cmd">!gamemode [bot] - Gamemode</div>
        <div class="cmd">!uptime [bot] - Uptime</div>
        <div class="cmd">!kick [bot] [player] - Kick</div>
      </div>
      
      <div class="console">
        <h3>Bot Console</h3>
        ${consoleLogs.slice(-15).map(l => `<div class="log" style="color:#4CAF50;">${l}</div>`).join('') || '<div class="log">No logs</div>'}
      </div>
      <form action="/api/botcommand" method="POST"><input type="text" name="command" placeholder="Bot command... !come all" required><button>Send</button></form>
      
      <div class="console">
        <h3>MC Console</h3>
        ${mcConsoleLogs.slice(-15).map(l => `<div class="log">${l}</div>`).join('') || '<div class="log">No messages</div>'}
      </div>
      <form action="/api/mccommand" method="POST"><input type="text" name="command" placeholder="MC command... /time set day" required><button>Send</button></form>
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
