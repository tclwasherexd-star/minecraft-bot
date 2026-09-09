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

const NUMBER_OF_BOTS = 10;

let bots = {};
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};
let botPlaytime = {};
let botJoinTime = {};
let botsCreated = 0;

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  console.log(`Creating ${NUMBER_OF_BOTS} bots...`);
  global.startTime = Date.now();
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
    botPlaytime[botUsername] = 0;
    addConsoleLog(`${botUsername} connecting...`);

    const keepAliveInterval = setInterval(() => {
      if (bot && botStatus[botUsername] === 'online') {
        if (botJoinTime[botUsername]) {
          botPlaytime[botUsername] = Date.now() - botJoinTime[botUsername];
        }
      }
    }, 30000);

    bot.on('spawn', () => {
      botStatus[botUsername] = 'online';
      botJoinTime[botUsername] = Date.now();
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
      if (botJoinTime[botUsername]) {
        botPlaytime[botUsername] += Date.now() - botJoinTime[botUsername];
        botJoinTime[botUsername] = null;
      }
      clearInterval(keepAliveInterval);
    });

    bot.on('end', (reason) => {
      botStatus[botUsername] = 'offline';
      addConsoleLog(`${botUsername} disconnected: ${reason}`);
      if (botJoinTime[botUsername]) {
        botPlaytime[botUsername] += Date.now() - botJoinTime[botUsername];
        botJoinTime[botUsername] = null;
      }
      clearInterval(keepAliveInterval);
      
      setTimeout(() => {
        if (botStatus[botUsername] === 'offline') {
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
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec}s`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
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
    
    // For text commands: !talk [botname] [msg] or !talk all [msg]
    const textCommands = ['!talk', '!shout', '!msg', '!textspam', '!spamprivmsg', '!echo'];
    
    let botArg = null;
    let commandArgs = args;
    
    if (textCommands.includes(command)) {
      // Format: !talk [botname] [message...]
      const possibleBotArg = args[1];
      const botNames = ['all'];
      for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
        botNames.push(`bot${i}`);
        botNames.push(`cloudafk_bot${i}`);
      }
      
      if (possibleBotArg && botNames.includes(possibleBotArg.toLowerCase())) {
        botArg = possibleBotArg;
        // Remove command and botArg, keep message
        commandArgs = [args[0], ...args.slice(2)];
      }
    } else {
      // For non-text commands: !command [botname] or !command all
      const lastArg = args[args.length - 1];
      const botNames = ['all'];
      for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
        botNames.push(`bot${i}`);
        botNames.push(`cloudafk_bot${i}`);
      }
      
      if (lastArg && botNames.includes(lastArg.toLowerCase())) {
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
      
      // TEXT COMMANDS - Format: !talk [botname] [message]
      if (command === '!msg') { 
        // !msg [botname] [targetplayer] [message]
        if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); 
        return; 
      }
      if (command === '!talk') { 
        // !talk [botname] [message]
        if (args[1]) botInstance.chat(args.slice(1).join(' ')); 
        return; 
      }
      if (command === '!shout') { 
        // !shout [botname] [message]
        if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); 
        return; 
      }
      if (command === '!echo') { 
        // !echo [botname] [message]
        safeWhisper(botInstance, username, args.slice(1).join(' ')); 
        return; 
      }
      if (command === '!textspam') {
        // !textspam [botname] [targetplayer] [message]
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (botInstance.textSpamInterval) { clearInterval(botInstance.textSpamInterval); botInstance.textSpamInterval = null; }
        if (targetName && text) {
          botInstance.textSpamInterval = setInterval(() => safeWhisper(botInstance, targetName, text), 1000);
        }
        return;
      }
      if (command === '!spamprivmsg') {
        // !spamprivmsg [botname] [targetplayer] [message]
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (botInstance.spamPrivateInterval) { clearInterval(botInstance.spamPrivateInterval); botInstance.spamPrivateInterval = null; }
        if (targetName && text) {
          botInstance.spamPrivateInterval = setInterval(() => safeWhisper(botInstance, targetName, text), 1000);
        }
        return;
      }
      
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
  
  let botListHTML = '';
  for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
    const botName = `CloudAFK_Bot${i}`;
    const status = botStatus[botName] || 'not created';
    const playtime = botPlaytime[botName] || 0;
    const currentSession = botJoinTime[botName] ? Date.now() - botJoinTime[botName] : 0;
    const totalPlaytime = playtime + currentSession;
    
    let statusColor = '#ff4444';
    if (status === 'online') statusColor = '#4CAF50';
    else if (status === 'connecting') statusColor = '#FFA500';
    else if (status === 'error') statusColor = '#ff0000';
    else if (status === 'kicked') statusColor = '#ff6600';
    
    botListHTML += `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #333;">${botName}</td>
        <td style="padding: 10px; border-bottom: 1px solid #333; color: ${statusColor}; font-weight: bold;">${status}</td>
        <td style="padding: 10px; border-bottom: 1px solid #333; color: #4CAF50;">${fmtTime(totalPlaytime)}</td>
      </tr>
    `;
  }
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bots Dashboard</title>
      <meta http-equiv="refresh" content="5">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); 
          min-height: 100vh; 
          color: white; 
          padding: 20px; 
        }
        .container { max-width: 900px; margin: 0 auto; }
        h1 { 
          text-align: center; 
          margin-bottom: 30px; 
          color: #4CAF50; 
          font-size: 2.5em;
          text-shadow: 0 0 10px rgba(76, 175, 80, 0.5);
        }
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(3, 1fr); 
          gap: 15px; 
          margin-bottom: 30px; 
        }
        .stat-card { 
          background: rgba(255,255,255,0.1); 
          backdrop-filter: blur(10px);
          border-radius: 15px; 
          padding: 20px; 
          text-align: center;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .stat-card h3 { font-size: 0.9em; opacity: 0.7; margin-bottom: 10px; }
        .stat-card .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .bot-table {
          background: rgba(255,255,255,0.05);
          border-radius: 15px;
          padding: 20px;
          margin: 20px 0;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .bot-table h2 { margin-bottom: 15px; color: #4CAF50; }
        table { width: 100%; border-collapse: collapse; }
        th {
          text-align: left;
          padding: 10px;
          border-bottom: 2px solid #4CAF50;
          color: #4CAF50;
        }
        .console { 
          background: rgba(0,0,0,0.5); 
          border-radius: 15px; 
          padding: 15px; 
          height: 300px; 
          overflow-y: auto; 
          margin: 20px 0;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .console h2 { color: #4CAF50; margin-bottom: 10px; }
        .log { font-family: 'Courier New', monospace; font-size: 12px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-online { color: #4CAF50; }
        .log-error { color: #ff4444; }
        .log-kicked { color: #ff6600; }
        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: 1fr; }
          h1 { font-size: 1.8em; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚡ CloudAFK Bots Dashboard ⚡</h1>
        
        <div class="stats-grid">
          <div class="stat-card">
            <h3>Bots Online</h3>
            <div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div>
          </div>
          <div class="stat-card">
            <h3>Total Bots</h3>
            <div class="value">${NUMBER_OF_BOTS}</div>
          </div>
          <div class="stat-card">
            <h3>Uptime</h3>
            <div class="value">${fmtTime(Date.now() - (global.startTime || Date.now()))}</div>
          </div>
        </div>
        
        <div class="bot-table">
          <h2>🤖 Bot Status</h2>
          <table>
            <thead>
              <tr>
                <th>Bot Name</th>
                <th>Status</th>
                <th>Playtime</th>
              </tr>
            </thead>
            <tbody>
              ${botListHTML}
            </tbody>
          </table>
        </div>
        
        <div class="console">
          <h2>📋 Bot Console</h2>
          ${consoleLogs.slice(-30).map(l => {
            let logClass = 'log';
            if (l.includes('joined')) logClass += ' log-online';
            if (l.includes('Error') || l.includes('Failed')) logClass += ' log-error';
            if (l.includes('Kicked')) logClass += ' log-kicked';
            return `<div class="${logClass}">${l}</div>`;
          }).join('')}
        </div>
        
        <div class="console">
          <h2>🎮 MC Console</h2>
          ${mcConsoleLogs.slice(-30).map(l => `<div class="log">${l}</div>`).join('')}
        </div>
      </div>
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
