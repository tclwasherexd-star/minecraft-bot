const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { 
  host: 'node-sg-free-01.tickhosting.com', 
  port: 50838, 
  version: '1.20.1', 
  auth: 'offline',
  checkTimeoutInterval: 300000,
  hideErrors: true,
  connectTimeout: 30000
};

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';

// 6 bots with realistic names
const botNames = [
  'Steve_Pro',
  'Alex_Miner',
  'Diamond_Knight',
  'Creeper_Slayer',
  'Enderman_Hunter',
  'Redstone_Wiz'
];

const NUMBER_OF_BOTS = 6;

let bots = {};
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};
let botPlaytime = {};
let botJoinTime = {};
let botsCreated = 0;
let reconnectCount = {};

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  console.log(`Running ${NUMBER_OF_BOTS} bots`);
  global.startTime = Date.now();
  createNextBot();
});

function createNextBot() {
  if (botsCreated >= NUMBER_OF_BOTS) {
    console.log(`All ${NUMBER_OF_BOTS} bots created!`);
    return;
  }
  
  const botUsername = botNames[botsCreated];
  botsCreated++;
  console.log(`Creating bot ${botsCreated}/${NUMBER_OF_BOTS}: ${botUsername}`);
  
  createBot(botUsername);
  
  setTimeout(createNextBot, 15000);
}

function createBot(botUsername) {
  if (bots[botUsername] && bots[botUsername].entity) {
    return;
  }
  
  reconnectCount[botUsername] = reconnectCount[botUsername] || 0;
  if (reconnectCount[botUsername] > 5) {
    addConsoleLog(`${botUsername} too many reconnects, waiting 5 minutes...`);
    setTimeout(() => {
      reconnectCount[botUsername] = 0;
      createBot(botUsername);
    }, 300000);
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
    addConsoleLog(`${botUsername} connecting...`);

    const connectionTimeout = setTimeout(() => {
      if (botStatus[botUsername] === 'connecting') {
        addConsoleLog(`${botUsername} connection timeout, retrying...`);
        bot.end('Connection timeout');
      }
    }, 30000);

    bot.on('spawn', () => {
      clearTimeout(connectionTimeout);
      botStatus[botUsername] = 'online';
      botJoinTime[botUsername] = Date.now();
      reconnectCount[botUsername] = 0;
      addConsoleLog(`${botUsername} joined!`);
      
      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      
      defaultMove.canDig = true;
      defaultMove.allow1by1towers = true;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.maxDropDown = 5;
      
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.enablePathShortcuts = true;
      bot.pathfinder.thinkTimeout = 100;

      bot.followTarget = null;
      bot.attackTarget = null;
    });

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      if (!msg.includes('ping') && !msg.includes('keepalive')) {
        addMCConsoleLog(`[${botUsername}] ${msg}`);
      }
    });

    bot.on('error', (err) => {
      // Silently handle errors
    });

    bot.on('kicked', (reason) => {
      clearTimeout(connectionTimeout);
      addConsoleLog(`${botUsername} Kicked: ${JSON.stringify(reason).substring(0, 100)}`);
      botStatus[botUsername] = 'kicked';
      if (botJoinTime[botUsername]) {
        botPlaytime[botUsername] += Date.now() - botJoinTime[botUsername];
        botJoinTime[botUsername] = null;
      }
      reconnectCount[botUsername]++;
    });

    bot.on('end', (reason) => {
      clearTimeout(connectionTimeout);
      botStatus[botUsername] = 'offline';
      if (botJoinTime[botUsername]) {
        botPlaytime[botUsername] += Date.now() - botJoinTime[botUsername];
        botJoinTime[botUsername] = null;
      }
      addConsoleLog(`${botUsername} disconnected, reconnecting in 30s...`);
      
      setTimeout(() => {
        if (botStatus[botUsername] !== 'online') {
          createBot(botUsername);
        }
      }, 30000);
    });

  } catch (e) {
    addConsoleLog(`${botUsername} Failed: ${e.message}`);
    botStatus[botUsername] = 'error';
    reconnectCount[botUsername]++;
    setTimeout(() => createBot(botUsername), 30000);
  }

  function addConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleLogs.push(log);
    if (consoleLogs.length > 100) consoleLogs.shift();
  }

  function addMCConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    mcConsoleLogs.push(log);
    if (mcConsoleLogs.length > 100) mcConsoleLogs.shift();
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function safeWhisper(botInstance, target, text) {
    try { if (botInstance.entity) botInstance.whisper(target, text); } catch (e) {}
  }

  function getTargetBots(botArg) {
    if (!botArg || botArg.toLowerCase() === 'all') {
      return Object.values(bots).filter(b => b && b.entity && botStatus[b.username] === 'online');
    }
    
    const targetBot = bots[botArg];
    if (targetBot && targetBot.entity && botStatus[botArg] === 'online') {
      return [targetBot];
    }
    
    const matchedBot = Object.values(bots).find(b => 
      b && b.entity && b.username.toLowerCase().includes(botArg.toLowerCase()) && botStatus[b.username] === 'online'
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
    let commandArgs = args;
    
    const textCommands = ['!talk', '!shout', '!msg'];
    
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
    
    if (targetBots.length === 0) {
      safeWhisper(bot, username, "No bots online.");
      return;
    }

    targetBots.forEach(targetBot => {
      executeCommand(targetBot, username, commandArgs, command);
    });
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
        botInstance.followTarget = null; botInstance.attackTarget = null;
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
      if (command === '!come') {
        botInstance.followTarget = null;
        const target = botInstance.players[username]?.entity;
        if (!target) return;
        botInstance.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
        return;
      }
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (botInstance.players[targetName]) botInstance.followTarget = targetName;
        return;
      }
      if (command === '!attack') {
        if (args[1] && botInstance.players[args[1]]) botInstance.attackTarget = args[1];
        return;
      }
      if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
      if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
      if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
      if (command === '!ping') { safeWhisper(botInstance, username, `Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
      
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
      <meta http-equiv="refresh" content="10">
      <style>
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; margin: 10px 0; }
        .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #333; }
        th { color: #4CAF50; }
        .online { color: #4CAF50; }
        .offline { color: #ff4444; }
        .connecting { color: #FFA500; }
        .kicked { color: #ff6600; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bots Dashboard</h1>
      <div class="card"><h3>Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
      <table>
        <thead>
          <tr><th>Bot Name</th><th>Status</th><th>Playtime</th></tr>
        </thead>
        <tbody>
          ${botNames.map(name => `
            <tr>
              <td>${name}</td>
              <td class="${botStatus[name] || 'offline'}">${botStatus[name] || 'not connected'}</td>
              <td>${fmtTime((botPlaytime[name] || 0) + (botJoinTime[name] ? Date.now() - botJoinTime[name] : 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
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
