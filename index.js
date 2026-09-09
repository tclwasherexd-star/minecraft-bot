const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
const io = new Server(http);

const config = { 
  host: 'node-sg-free-01.tickhosting.com', 
  port: 50838, 
  version: '1.20.1', 
  auth: 'offline',
  checkTimeoutInterval: 300000,
  hideErrors: true,
  connectTimeout: 60000
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

app.use(express.json());

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
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
  createBot(botUsername);
  setTimeout(createNextBot, 10000);
}

function createBot(botUsername) {
  reconnectCount[botUsername] = reconnectCount[botUsername] || 0;
  
  if (reconnectCount[botUsername] > 3) {
    setTimeout(() => {
      reconnectCount[botUsername] = 0;
      createBot(botUsername);
    }, 120000);
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
      defaultMove.allow1by1towers = true;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.maxDropDown = 5;
      defaultMove.liquidCost = 5;
      defaultMove.avoidDamage = true;
      defaultMove.allowFreeMotion = true;
      defaultMove.allowEntityDetection = true;
      defaultMove.blocksToAvoid = new Set(['lava', 'fire', 'cactus']);
      
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.enablePathShortcuts = true;
      bot.pathfinder.thinkTimeout = 30;

      bot.followTarget = null;
      bot.attackTarget = null;
      bot.huntTarget = null;
      bot.comingTo = null;
      bot.linePosition = null;
      bot.mineBlock = null;
      bot.attackMobs = false;
      bot.freezeMode = false;
      bot.stuckCount = 0;
      bot.currentAction = 'Idle';

      bot.positionInterval = setInterval(() => {
        if (bot.entity) {
          botPositions[botUsername] = {
            x: Math.round(bot.entity.position.x),
            y: Math.round(bot.entity.position.y),
            z: Math.round(bot.entity.position.z),
            health: Math.round(bot.health),
            food: Math.round(bot.food)
          };
        }
      }, 1000);

      // FOLLOW LOOP
      bot.followInterval = setInterval(() => {
        if (bot.followTarget && !bot.freezeMode && bot.entity) {
          const target = bot.players[bot.followTarget]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            if (distance > 3) {
              bot.currentAction = `Following ${bot.followTarget}`;
              bot.setControlState('sprint', true);
              bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
              if (!bot.pathfinder.isMoving()) {
                bot.setControlState('jump', true);
                bot.setControlState('forward', true);
                setTimeout(() => {
                  bot.setControlState('jump', false);
                  bot.setControlState('forward', false);
                }, 400);
              }
            } else {
              bot.currentAction = 'Idle';
              bot.setControlState('sprint', false);
              bot.pathfinder.setGoal(null);
              bot.clearControlStates();
            }
          }
        }
      }, 300);

      // COME LOOP
      bot.comeInterval = setInterval(() => {
        if (bot.comingTo && !bot.freezeMode && bot.entity) {
          const target = bot.players[bot.comingTo]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            if (distance > 2) {
              bot.currentAction = `Coming to ${bot.comingTo}`;
              bot.setControlState('sprint', true);
              bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
              if (!bot.pathfinder.isMoving()) {
                bot.setControlState('jump', true);
                bot.setControlState('forward', true);
                setTimeout(() => {
                  bot.setControlState('jump', false);
                  bot.setControlState('forward', false);
                }, 400);
              }
            } else {
              bot.currentAction = 'Idle';
              bot.setControlState('sprint', false);
              bot.pathfinder.setGoal(null);
              bot.clearControlStates();
              bot.comingTo = null;
            }
          }
        }
      }, 300);

      // LINE LOOP
      bot.lineInterval = setInterval(() => {
        if (bot.linePosition && !bot.freezeMode && bot.entity) {
          const pos = bot.linePosition;
          const distance = bot.entity.position.distanceTo(pos);
          if (distance > 1) {
            bot.currentAction = 'Lining up';
            bot.setControlState('sprint', true);
            bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 1), true);
            if (!bot.pathfinder.isMoving()) {
              bot.setControlState('jump', true);
              setTimeout(() => bot.setControlState('jump', false), 400);
            }
          } else {
            bot.currentAction = 'Idle';
            bot.setControlState('sprint', false);
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            bot.linePosition = null;
          }
        }
      }, 300);

      // ATTACK LOOP
      bot.attackInterval = setInterval(() => {
        if (bot.attackTarget && !bot.freezeMode && bot.entity) {
          const target = bot.players[bot.attackTarget]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            bot.currentAction = `Attacking ${bot.attackTarget}`;
            bot.setControlState('sprint', true);
            if (distance > 3) {
              bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
              if (!bot.pathfinder.isMoving()) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 400);
              }
            } else {
              bot.pathfinder.setGoal(null);
              bot.lookAt(target.position.offset(0, target.height, 0));
              bot.attack(target);
            }
          }
        }
      }, 300);
    });

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg.toString();
      mcConsoleLogs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      if (mcConsoleLogs.length > 100) mcConsoleLogs.shift();
      io.emit('mcLog', `[${new Date().toLocaleTimeString()}] ${msg}`);
    });

    bot.on('error', (err) => {});
    bot.on('kicked', () => {
      botStatus[botUsername] = 'kicked';
      reconnectCount[botUsername]++;
    });
    bot.on('end', () => {
      botStatus[botUsername] = 'offline';
      setTimeout(() => createBot(botUsername), 15000);
    });

  } catch (e) {
    botStatus[botUsername] = 'error';
    setTimeout(() => createBot(botUsername), 20000);
  }

  function safeWhisper(botInstance, target, text) {
    try { if (botInstance.entity) botInstance.whisper(target, text); } catch (e) {}
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

  function handleCommand(username, message) {
    if (!myUsername.includes(username.toLowerCase())) {
      safeWhisper(bot, username, "Access denied.");
      return;
    }

    totalCommandsExecuted++;
    commandHistory.push(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
    if (commandHistory.length > 50) commandHistory.shift();
    io.emit('botCommand', `[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
    
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
    if (targetBots.length === 0) {
      safeWhisper(bot, username, "No bots online.");
      return;
    }
    
    targetBots.forEach(targetBot => executeCommand(targetBot, username, commandArgs, command));
  }

  function executeCommand(botInstance, username, args, command) {
    const botName = botInstance.username;
    try {
      if (!botInstance.entity) return;
      
      if (command === '!coords') { const p = botInstance.entity.position; safeWhisper(botInstance, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeWhisper(botInstance, username, `${botName} HP:${botInstance.health}/20 Food:${botInstance.food}/20`); return; }
      if (command === '!jump') { botInstance.setControlState('jump', true); setTimeout(() => botInstance.setControlState('jump', false), 500); return; }
      if (command === '!stop') {
        botInstance.pathfinder.setGoal(null); botInstance.clearControlStates();
        botInstance.followTarget = null; botInstance.attackTarget = null; botInstance.comingTo = null; botInstance.huntTarget = null; botInstance.linePosition = null;
        botInstance.currentAction = 'Idle';
        safeWhisper(botInstance, username, `${botName} stopped!`);
        return;
      }
      if (command === '!killbot') { botInstance.chat('/kill'); return; }
      if (command === '!tpbring') {
        const player = botInstance.players[username];
        if (player?.entity?.position) {
          botInstance.entity.position = player.entity.position.clone();
          safeWhisper(botInstance, username, `${botName} teleported!`);
        }
        return;
      }
      if (command === '!come') {
        botInstance.comingTo = username;
        botInstance.followTarget = null; botInstance.attackTarget = null; botInstance.huntTarget = null; botInstance.linePosition = null;
        safeWhisper(botInstance, username, `${botName} sprinting to you!`);
        return;
      }
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (botInstance.players[targetName]) {
          botInstance.followTarget = targetName;
          botInstance.comingTo = null; botInstance.attackTarget = null; botInstance.huntTarget = null; botInstance.linePosition = null;
          safeWhisper(botInstance, username, `${botName} following ${targetName}!`);
        }
        return;
      }
      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if (!isNaN(x)) {
          botInstance.comingTo = null; botInstance.followTarget = null; botInstance.linePosition = null;
          botInstance.setControlState('sprint', true);
          botInstance.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
          safeWhisper(botInstance, username, `${botName} sprinting to ${x},${y},${z}!`);
        }
        return;
      }
      if (command === '!line') {
        const ownerPlayer = botInstance.players[username];
        if (ownerPlayer?.entity) {
          const block = botInstance.blockAtCursor(20);
          if (block) {
            const targetPos = block.position;
            botInstance.linePosition = { x: targetPos.x, y: targetPos.y + 1, z: targetPos.z };
            botInstance.comingTo = null; botInstance.followTarget = null; botInstance.attackTarget = null;
            safeWhisper(botInstance, username, `${botName} lining up where you're looking!`);
          } else {
            const ownerPos = ownerPlayer.entity.position;
            const yaw = ownerPlayer.entity.yaw;
            const lookX = ownerPos.x + Math.sin(yaw) * 3;
            const lookZ = ownerPos.z + Math.cos(yaw) * 3;
            botInstance.linePosition = { x: lookX, y: ownerPos.y, z: lookZ };
            safeWhisper(botInstance, username, `${botName} lining up in your direction!`);
          }
        }
        return;
      }
      if (command === '!attack') {
        if (args[1] && botInstance.players[args[1]]) {
          botInstance.attackTarget = args[1];
          botInstance.followTarget = null; botInstance.comingTo = null; botInstance.huntTarget = null; botInstance.linePosition = null;
          safeWhisper(botInstance, username, `${botName} attacking ${args[1]}!`);
        }
        return;
      }
      if (command === '!hunt') {
        if (args[1] && botInstance.players[args[1]]) {
          botInstance.huntTarget = args[1];
          botInstance.attackTarget = null; botInstance.followTarget = null; botInstance.comingTo = null; botInstance.linePosition = null;
          safeWhisper(botInstance, username, `${botName} hunting ${args[1]}!`);
        }
        return;
      }
      if (command === '!talk') { 
        if (args[1]) {
          botInstance.chat(args.slice(1).join(' '));
          safeWhisper(botInstance, username, `${botName} said: ${args.slice(1).join(' ')}`);
        }
        return; 
      }
      if (command === '!shout') { 
        if (args[1]) {
          botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!');
          safeWhisper(botInstance, username, `${botName} shouted!`);
        }
        return; 
      }
      if (command === '!msg') { 
        if (args[1] && args[2]) {
          safeWhisper(botInstance, args[1], args.slice(2).join(' '));
          safeWhisper(botInstance, username, `${botName} sent message to ${args[1]}!`);
        }
        return; 
      }
      if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
      if (command === '!ping') { safeWhisper(botInstance, username, `${botName} Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
      if (command === '!players') { safeWhisper(botInstance, username, `Online: ${Object.keys(botInstance.players).join(', ')}`); return; }
      if (command === '!echo') { safeWhisper(botInstance, username, args.slice(1).join(' ')); return; }
      
    } catch (e) {
      safeWhisper(botInstance, username, `${botName} command failed.`);
    }
  }

  bot.on('whisper', (username, message) => handleCommand(username, message));
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!')) handleCommand(username, message);
  });
}

// Socket.io for real-time console
io.on('connection', (socket) => {
  socket.on('botCommand', (cmd) => {
    handleCommand(myUsername[0], cmd);
  });
  
  socket.on('mcCommand', (cmd) => {
    // Send Minecraft command to all bots
    Object.values(bots).forEach(b => {
      if (b && b.entity) b.chat(cmd);
    });
    mcConsoleLogs.push(`[${new Date().toLocaleTimeString()}] > ${cmd}`);
    io.emit('mcLog', `[${new Date().toLocaleTimeString()}] > ${cmd}`);
  });
});

// WEBSITE
app.get('/', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  const memUsage = process.memoryUsage();
  const uptime = fmtTime(Date.now() - (global.startTime || Date.now()));
  
  let botCards = botNames.map(name => {
    const status = botStatus[name] || 'offline';
    const playtime = fmtTime((botPlaytime[name] || 0) + (botJoinTime[name] ? Date.now() - botJoinTime[name] : 0));
    const pos = botPositions[name] || { x: '?', y: '?', z: '?', health: '?', food: '?' };
    const action = bots[name]?.currentAction || 'Idle';
    let statusColor = '#ff4444';
    if (status === 'online') statusColor = '#4CAF50';
    else if (status === 'connecting') statusColor = '#FFA500';
    
    return `
      <div style="background: rgba(255,255,255,0.05); border-radius: 15px; padding: 20px; border: 1px solid rgba(255,255,255,0.1);">
        <h3 style="margin-bottom: 10px;">${name}</h3>
        <div style="color: ${statusColor}; font-weight: bold; font-size: 1.2em; margin-bottom: 10px;">${status}</div>
        <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 5px;">Action: ${action}</div>
        <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 5px;">Pos: ${pos.x}, ${pos.y}, ${pos.z}</div>
        <div style="font-size: 0.9em; opacity: 0.8; margin-bottom: 5px;">HP: ${pos.health} | Food: ${pos.food}</div>
        <div style="color: #4CAF50; margin-top: 5px;">Playtime: ${playtime}</div>
      </div>
    `;
  }).join('');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot Army Dashboard</title>
      <meta http-equiv="refresh" content="5">
      <script src="/socket.io/socket.io.js"></script>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Arial, sans-serif; 
          background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
          min-height: 100vh; 
          color: white; 
          padding: 20px; 
        }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { 
          text-align: center; 
          margin-bottom: 10px; 
          color: #4CAF50; 
          font-size: 2.5em;
          text-shadow: 0 0 20px rgba(76, 175, 80, 0.5);
        }
        .subtitle { text-align: center; opacity: 0.7; margin-bottom: 30px; }
        .stats-grid { 
          display: grid; 
          grid-template-columns: repeat(4, 1fr); 
          gap: 15px; 
          margin-bottom: 30px; 
        }
        .stat-card { 
          background: rgba(255,255,255,0.1); 
          border-radius: 15px; 
          padding: 20px; 
          text-align: center;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .stat-card h3 { font-size: 0.9em; opacity: 0.7; margin-bottom: 10px; }
        .stat-card .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .bots-grid { 
          display: grid; 
          grid-template-columns: repeat(5, 1fr); 
          gap: 15px; 
          margin-bottom: 30px; 
        }
        .console { 
          background: rgba(0,0,0,0.5); 
          border-radius: 15px; 
          padding: 15px; 
          height: 300px; 
          overflow-y: auto; 
          margin-bottom: 10px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .console h2 { color: #4CAF50; margin-bottom: 10px; }
        .log { font-family: 'Courier New', monospace; font-size: 12px; padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .log-online { color: #4CAF50; }
        .log-error { color: #ff4444; }
        .console-input {
          display: flex;
          gap: 10px;
          margin-bottom: 20px;
        }
        .console-input input {
          flex: 1;
          padding: 10px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 8px;
          background: rgba(0,0,0,0.3);
          color: white;
          font-size: 14px;
        }
        .console-input button {
          padding: 10px 20px;
          background: #4CAF50;
          border: none;
          border-radius: 8px;
          color: white;
          cursor: pointer;
          font-weight: bold;
        }
        .console-input button:hover { background: #45a049; }
        .command-list {
          background: rgba(255,255,255,0.05);
          border-radius: 15px;
          padding: 20px;
          margin-bottom: 20px;
          border: 1px solid rgba(255,255,255,0.1);
        }
        .command-list h2 { color: #4CAF50; margin-bottom: 15px; }
        .command-item {
          background: rgba(0,0,0,0.3);
          padding: 8px;
          border-radius: 8px;
          margin-bottom: 5px;
          font-family: monospace;
          font-size: 13px;
        }
        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .bots-grid { grid-template-columns: repeat(2, 1fr); }
          h1 { font-size: 1.8em; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚡ CloudAFK Bot Army ⚡</h1>
        <p class="subtitle">Advanced Minecraft Bot Control Panel</p>
        
        <div class="stats-grid">
          <div class="stat-card"><h3>🤖 Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
          <div class="stat-card"><h3>💾 RAM Usage</h3><div class="value">${Math.round(memUsage.heapUsed / 1024 / 1024)}MB</div></div>
          <div class="stat-card"><h3>⏱️ Uptime</h3><div class="value">${uptime}</div></div>
          <div class="stat-card"><h3>📊 Commands</h3><div class="value">${totalCommandsExecuted}</div></div>
        </div>
        
        <div class="bots-grid">${botCards}</div>
        
        <div class="command-list">
          <h2>📋 All Available Commands</h2>
          <div class="command-item">!coords [bot] - Show bot coordinates</div>
          <div class="command-item">!status [bot] - Show bot HP/Food</div>
          <div class="command-item">!jump [bot] - Make bot jump</div>
          <div class="command-item">!stop [bot] - Stop all bot actions</div>
          <div class="command-item">!killbot [bot] - Kill the bot</div>
          <div class="command-item">!tpbring [bot] - Teleport bot to you</div>
          <div class="command-item">!come [bot] - Bot sprints to you</div>
          <div class="command-item">!follow [player] [bot] - Bot follows player</div>
          <div class="command-item">!goto [x] [y] [z] [bot] - Bot goes to coords</div>
          <div class="command-item">!line [bot] - Bot lines up where you're looking</div>
          <div class="command-item">!attack [player] [bot] - Bot attacks player</div>
          <div class="command-item">!hunt [player] [bot] - Bot hunts player</div>
          <div class="command-item">!talk [bot] [msg] - Bot says message</div>
          <div class="command-item">!shout [bot] [msg] - Bot shouts message</div>
          <div class="command-item">!msg [bot] [player] [msg] - Bot whispers to player</div>
          <div class="command-item">!kick [bot] [player] - Bot kicks player</div>
          <div class="command-item">!ping [bot] - Check bot ping</div>
          <div class="command-item">!players [bot] - List online players</div>
          <div class="command-item">!echo [bot] [msg] - Bot echoes message</div>
          <div class="command-item">!survival [bot] - Set bot to survival</div>
          <div class="command-item">!creative [bot] - Set bot to creative</div>
        </div>
        
        <div class="console" id="botConsole">
          <h2>📋 Bot Console (Commands You Run)</h2>
          ${commandHistory.slice(-30).map(l => `<div class="log log-online">${l}</div>`).join('')}
        </div>
        <div class="console-input">
          <input type="text" id="botInput" placeholder="Type bot command here... (e.g. !come all)">
          <button onclick="sendBotCommand()">Send Bot Command</button>
        </div>
        
        <div class="console" id="mcConsole">
          <h2>🎮 Minecraft Console (Server Chat)</h2>
          ${mcConsoleLogs.slice(-30).map(l => `<div class="log">${l}</div>`).join('')}
        </div>
        <div class="console-input">
          <input type="text" id="mcInput" placeholder="Type Minecraft command here... (e.g. /time set day)">
          <button onclick="sendMcCommand()">Send MC Command</button>
        </div>
      </div>
      
      <script>
        const socket = io();
        
        socket.on('botCommand', (log) => {
          const consoleBox = document.getElementById('botConsole');
          const logDiv = document.createElement('div');
          logDiv.className = 'log log-online';
          logDiv.textContent = log;
          consoleBox.appendChild(logDiv);
          consoleBox.scrollTop = consoleBox.scrollHeight;
        });
        
        socket.on('mcLog', (log) => {
          const consoleBox = document.getElementById('mcConsole');
          const logDiv = document.createElement('div');
          logDiv.className = 'log';
          logDiv.textContent = log;
          consoleBox.appendChild(logDiv);
          consoleBox.scrollTop = consoleBox.scrollHeight;
        });
        
        function sendBotCommand() {
          const input = document.getElementById('botInput');
          const cmd = input.value;
          if (cmd) {
            socket.emit('botCommand', cmd);
            input.value = '';
          }
        }
        
        function sendMcCommand() {
          const input = document.getElementById('mcInput');
          const cmd = input.value;
          if (cmd) {
            socket.emit('mcCommand', cmd);
            input.value = '';
          }
        }
        
        // Enter key support
        document.getElementById('botInput').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendBotCommand();
        });
        document.getElementById('mcInput').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') sendMcCommand();
        });
      </script>
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
