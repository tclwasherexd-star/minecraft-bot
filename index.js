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

let commandLeaderUsername = null;

function pickNewLeaderIfNeeded() {
  if (commandLeaderUsername && botStatus[commandLeaderUsername] === 'online') return;
  commandLeaderUsername = Object.keys(botStatus).find(n => botStatus[n] === 'online') || null;
}

const recentCommands = new Map();
const DUPLICATE_WINDOW_MS = 400;

function isDuplicate(username, message) {
  const key = `${username.toLowerCase()}::${message}`;
  const now = Date.now();
  const last = recentCommands.get(key);
  if (last && now - last < DUPLICATE_WINDOW_MS) return true;
  recentCommands.set(key, now);
  if (recentCommands.size > 200) {
    for (const [k, t] of recentCommands) {
      if (now - t > DUPLICATE_WINDOW_MS * 5) recentCommands.delete(k);
    }
  }
  return false;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const COMMAND_REFERENCE = [
  { group: 'Targeting', lines: [
    'Add a bot name OR "all" to any command below to choose who runs it.',
    'Example: !killbot all — kills every bot. !killbot ShadowBlade — kills just that one.',
    'If you leave it off, it defaults to all bots (or to you, for movement commands).'
  ]},
  { group: 'Info', lines: [
    '!coords [bot|all] — bot\'s X/Y/Z',
    '!status [bot|all] — bot\'s HP',
    '!ping [bot|all] — bot\'s ping',
    '!players [bot|all] — who\'s online',
    '!exp [bot|all] — bot\'s XP level',
    '!gamemode [bot|all] — bot\'s gamemode',
    '!uptime [bot|all] — time since last join',
    '!inventory [bot|all] — show bot\'s inventory'
  ]},
  { group: 'Movement (walking)', lines: [
    '!come [bot|all] — bot walks to you',
    '!follow [player] [bot|all] — bot walks and follows (defaults to you)',
    '!goto <x> <y> <z> [bot|all] — bot walks to coords',
    '!line [bot|all] — bots TELEPORT to line up behind you',
    '!stop [bot|all] — cancel movement/mining/spam'
  ]},
  { group: 'Teleport (via server /tp — needs bot to have permission)', lines: [
    '!tpbring [bot|all] — bot teleports to you'
  ]},
  { group: 'Chat', lines: [
    '!talk [bot|all] <message> — bot says it in chat',
    '!shout [bot|all] <message> — bot shouts it (ALL CAPS)',
    '!msg [bot|all] <player> <message> — bot whispers a player',
    '!echo [bot|all] <message> — bot whispers it back to you'
  ]},
  { group: 'Spam', lines: [
    '!link <url> [bot|all] — spam URL in chat (no delay)',
    '!spamtext <message> [bot|all] — spam text in chat (no delay)',
    '!msgspam <player> <message> [bot|all] — spam whisper to player (no delay)',
    '!stoplink [bot|all] — stop link spam',
    '!stopspam [bot|all] — stop all spam'
  ]},
  { group: 'Server / self', lines: [
    '!killbot [bot|all] — bot runs /kill on itself',
    '!survival / !creative [bot|all] — change bot\'s gamemode',
    '!kick <player> [bot|all] — bot runs /kick on a player',
    '!jump [bot|all] — single hop',
    '!sneak / !unsneak [bot|all]'
  ]},
  { group: 'Items / blocks', lines: [
    '!mine <block> [bot|all] — walk to and mine matching block',
    '!stopmine [bot|all] — stop mining',
    '!dig [bot|all] [block] — dig block at cursor, or start mining a block type',
    '!armor [bot|all] — equip armor from inventory (first match per slot)',
    '!drop / !dropall [bot|all] — drop held item / entire inventory',
    '!equip <item> [bot|all] — equip a matching item to hand'
  ]},
  { group: 'Lookup', lines: [
    '!nearbyplayers [bot|all]',
    '!health [player] [bot|all] — only reliable for the bot itself',
    '!whereis <player> [bot|all]'
  ]},
];

function sendHelp(username) {
  const anyBot = Object.values(bots).find(b => b && b.entity);
  if (!anyBot) return;
  const lines = [`Bots: ${botNames.join(', ')}`];
  COMMAND_REFERENCE.forEach(section => {
    lines.push(`--- ${section.group} ---`);
    lines.push(...section.lines);
  });
  lines.forEach((line, i) => {
    setTimeout(() => safeWhisper(anyBot, username, line), i * 300);
  });
}

function handleCommand(username, message) {
  if (!myUsername.includes(username.toLowerCase())) return;
  if (isDuplicate(username, message)) return;

  totalCommandsExecuted++;
  commandHistory.push(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
  if (commandHistory.length > 50) commandHistory.shift();

  const args = message.trim().split(' ');
  const command = args[0]?.toLowerCase();

  if (command === '!help' || command === '!commands') {
    sendHelp(username);
    return;
  }

  let botArg = null;

  // Commands where bot target can appear as second argument (before other args)
  const textCommands = ['!talk', '!shout', '!msg', '!echo', '!dig', '!link'];

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
    if (command === '!inventory') {
      const items = botInstance.inventory.items();
      if (items.length === 0) {
        safeWhisper(botInstance, username, `${botName} has empty inventory.`);
      } else {
        const itemList = items.map(i => `${i.name} x${i.count}`).join(', ');
        safeWhisper(botInstance, username, `${botName} inventory: ${itemList}`);
      }
      return;
    }

    // !tpbring - server-side /tp (bot to you)
    if (command === '!tpbring') {
      clearMovement(botInstance);
      botInstance.chat(`/tp ${botInstance.username} ${username}`);
      safeWhisper(botInstance, username, `${botName} requesting /tp to you!`);
      return;
    }

    // !come - WALKS to you
    if (command === '!come') {
      const target = botInstance.players[username]?.entity;
      if (target) {
        clearMovement(botInstance);
        botInstance.comingTo = username;
        safeWhisper(botInstance, username, `${botName} walking to you!`);
      } else {
        safeWhisper(botInstance, username, "Can't see you right now.");
      }
      return;
    }

    // !follow - WALKS to target
    if (command === '!follow') {
      const targetName = args[1] || username;
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        clearMovement(botInstance);
        botInstance.followTarget = targetName;
        safeWhisper(botInstance, username, `${botName} following ${targetName}!`);
      } else {
        safeWhisper(botInstance, username, `Can't see ${targetName}!`);
      }
      return;
    }

    // !goto - WALKS to coords
    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        clearMovement(botInstance);
        botInstance.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
        safeWhisper(botInstance, username, `${botName} walking to ${x},${y},${z}!`);
      }
      return;
    }

    // !line - TELEPORT bots into formation
    if (command === '!line') {
      const ownerPlayer = botInstance.players[username]?.entity;
      if (!ownerPlayer) {
        safeWhisper(botInstance, username, "Can't see you to line up.");
        return;
      }
      clearMovement(botInstance);
      const allOnlineBots = getTargetBots('all');
      const botIndex = allOnlineBots.indexOf(botInstance);
      const offset = (botIndex - (allOnlineBots.length - 1) / 2) * 2;
      const ownerPos = ownerPlayer.position;
      const yaw = ownerPlayer.yaw;
      const lineX = ownerPos.x + Math.sin(yaw) * 3 + Math.cos(yaw) * offset;
      const lineZ = ownerPos.z + Math.cos(yaw) * 3 - Math.sin(yaw) * offset;
      const lineY = ownerPos.y;
      botInstance.chat(`/tp ${botInstance.username} ${Math.floor(lineX)} ${Math.floor(lineY)} ${Math.floor(lineZ)}`);
      safeWhisper(botInstance, username, `${botName} teleporting to line up!`);
      return;
    }

    if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
    if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
    if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
    if (command === '!echo') { safeWhisper(botInstance, username, args.slice(1).join(' ')); return; }

    // !link - spam URL
    if (command === '!link') {
      const url = args[1];
      if (!url) {
        safeWhisper(botInstance, username, 'Please provide a URL: !link <url>');
        return;
      }
      if (botInstance.spamLinkInterval) clearInterval(botInstance.spamLinkInterval);
      botInstance.spamLinkInterval = setInterval(() => {
        if (!botInstance.entity) {
          clearInterval(botInstance.spamLinkInterval);
          botInstance.spamLinkInterval = null;
          return;
        }
        botInstance.chat(url);
      }, 0);
      safeWhisper(botInstance, username, `${botName} is now spamming: ${url}`);
      return;
    }

    // !spamtext - spam text message
    if (command === '!spamtext') {
      const text = args.slice(1).join(' ');
      if (!text) {
        safeWhisper(botInstance, username, 'Please provide text: !spamtext <message>');
        return;
      }
      if (botInstance.spamTextInterval) clearInterval(botInstance.spamTextInterval);
      botInstance.spamTextInterval = setInterval(() => {
        if (!botInstance.entity) {
          clearInterval(botInstance.spamTextInterval);
          botInstance.spamTextInterval = null;
          return;
        }
        botInstance.chat(text);
      }, 0);
      safeWhisper(botInstance, username, `${botName} is now spamming text: ${text}`);
      return;
    }

    // !msgspam - spam whisper to a player
    if (command === '!msgspam') {
      const targetPlayer = args[1];
      const msg = args.slice(2).join(' ');
      if (!targetPlayer || !msg) {
        safeWhisper(botInstance, username, 'Usage: !msgspam <player> <message>');
        return;
      }
      if (botInstance.spamMsgInterval) clearInterval(botInstance.spamMsgInterval);
      botInstance.spamMsgInterval = setInterval(() => {
        if (!botInstance.entity) {
          clearInterval(botInstance.spamMsgInterval);
          botInstance.spamMsgInterval = null;
          return;
        }
        safeWhisper(botInstance, targetPlayer, msg);
      }, 0);
      safeWhisper(botInstance, username, `${botName} is now spamming ${targetPlayer}: ${msg}`);
      return;
    }

    // !stoplink - stop link spam only
    if (command === '!stoplink') {
      if (botInstance.spamLinkInterval) {
        clearInterval(botInstance.spamLinkInterval);
        botInstance.spamLinkInterval = null;
        safeWhisper(botInstance, username, `${botName} stopped link spam.`);
      } else {
        safeWhisper(botInstance, username, `${botName} is not spamming links.`);
      }
      return;
    }

    // !stopspam - stop all spam
    if (command === '!stopspam') {
      let stoppedAny = false;
      if (botInstance.spamLinkInterval) { clearInterval(botInstance.spamLinkInterval); botInstance.spamLinkInterval = null; stoppedAny = true; }
      if (botInstance.spamTextInterval) { clearInterval(botInstance.spamTextInterval); botInstance.spamTextInterval = null; stoppedAny = true; }
      if (botInstance.spamMsgInterval) { clearInterval(botInstance.spamMsgInterval); botInstance.spamMsgInterval = null; stoppedAny = true; }
      safeWhisper(botInstance, username, stoppedAny ? `${botName} stopped all spam.` : `${botName} is not spamming.`);
      return;
    }

    if (command === '!stop') {
      clearMovement(botInstance);
      // Stop all spam
      if (botInstance.spamLinkInterval) { clearInterval(botInstance.spamLinkInterval); botInstance.spamLinkInterval = null; }
      if (botInstance.spamTextInterval) { clearInterval(botInstance.spamTextInterval); botInstance.spamTextInterval = null; }
      if (botInstance.spamMsgInterval) { clearInterval(botInstance.spamMsgInterval); botInstance.spamMsgInterval = null; }
      botInstance.pathfinder.setGoal(null);
      botInstance.clearControlStates();
      safeWhisper(botInstance, username, `${botName} stopped!`);
      return;
    }
    if (command === '!jump') {
      if (botInstance.pathfinder.isMoving()) {
        safeWhisper(botInstance, username, `${botName} is walking, can't jump on command right now.`);
        return;
      }
      botInstance.setControlState('jump', true);
      setTimeout(() => botInstance.setControlState('jump', false), 500);
      return;
    }
    if (command === '!killbot') {
      botInstance.chat(`/kill ${botInstance.username}`);
      safeWhisper(botInstance, username, `${botName} requesting /kill on self!`);
      return;
    }
    if (command === '!survival') { botInstance.chat('/gamemode survival'); return; }
    if (command === '!creative') { botInstance.chat('/gamemode creative'); return; }
    if (command === '!sneak') { botInstance.setControlState('sneak', true); return; }
    if (command === '!unsneak') { botInstance.setControlState('sneak', false); return; }
    if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
    if (command === '!mine') {
      if (args[1]) {
        clearMovement(botInstance);
        botInstance.mineBlock = args.slice(1).join('_');
        safeWhisper(botInstance, username, `${botName} now mining ${botInstance.mineBlock.replace(/_/g, ' ')}`);
      }
      return;
    }
    if (command === '!stopmine') {
      botInstance.mineBlock = null;
      botInstance.digTarget = null;
      if (botInstance._activeGoalKey?.startsWith('mine:')) {
        botInstance.pathfinder.setGoal(null);
        botInstance._activeGoalKey = null;
      }
      return;
    }

    // !dig - FIXED: if no block name, target block at cursor and walk to it before digging
    if (command === '!dig') {
      const blockName = args.slice(1).join('_');
      if (blockName) {
        clearMovement(botInstance);
        botInstance.mineBlock = blockName;
        botInstance.digTarget = null;
        safeWhisper(botInstance, username, `${botName} now digging ${blockName.replace(/_/g, ' ')}`);
      } else {
        const block = botInstance.blockAtCursor(10);
        if (!block) {
          safeWhisper(botInstance, username, `${botName} no block in sight.`);
          return;
        }
        clearMovement(botInstance);
        botInstance.mineBlock = null;
        botInstance.digTarget = block.position.clone();
        botInstance.pathfinder.setGoal(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1), true);
        botInstance._activeGoalKey = `digTarget:${block.position.x},${block.position.y},${block.position.z}`;
        safeWhisper(botInstance, username, `${botName} moving to dig block.`);
      }
      return;
    }

    // !armor - simple: equip first matching armor for each slot (no best sorting)
    if (command === '!armor') {
      const armorSlots = {
        'head': ['helmet', 'cap', 'hood', 'crown'],
        'torso': ['chestplate', 'tunic', 'plate', 'chest'],
        'legs': ['leggings', 'pants', 'legs'],
        'feet': ['boots', 'shoes', 'slippers']
      };
      const items = botInstance.inventory.items();
      const equipped = [];
      for (const slot in armorSlots) {
        const keywords = armorSlots[slot];
        const armorItem = items.find(i => keywords.some(k => i.name.includes(k)));
        if (armorItem) {
          botInstance.equip(armorItem, slot).catch(() => {});
          equipped.push(slot);
        }
      }
      safeWhisper(botInstance, username, equipped.length ? `${botName} equipped armor: ${equipped.join(', ')}` : `${botName} found no armor to equip.`);
      return;
    }

    if (command === '!drop') { const h = botInstance.heldItem; if (h) botInstance.tossStack(h).catch(() => {}); return; }
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
      const targetName = args[1] || username;
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        safeWhisper(botInstance, username, `${targetName}'s HP: ${target.health ?? 'unknown'}`);
      } else {
        safeWhisper(botInstance, username, `Can't see ${targetName}.`);
      }
      return;
    }
    if (command === '!whereis') {
      const targetName = args[1];
      if (!targetName) return;
      const target = botInstance.players[targetName]?.entity;
      if (target) {
        safeWhisper(botInstance, username, `${targetName}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
      } else {
        safeWhisper(botInstance, username, `Can't see ${targetName}.`);
      }
      return;
    }
  } catch (e) {}
}

function clearMovement(bot) {
  bot.followTarget = null;
  bot.comingTo = null;
  bot.mineBlock = null;
  bot.digTarget = null;
  bot._activeGoalKey = null;
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
  if (botStatus[botUsername] === 'connecting' || botStatus[botUsername] === 'online') return;

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
      pickNewLeaderIfNeeded();
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} joined!`);
      if (consoleLogs.length > 100) consoleLogs.shift();

      const mcData = require('minecraft-data')(bot.version);
      const defaultMove = new Movements(bot, mcData);
      defaultMove.canDig = true;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.allow1by1towers = true; // allow building up 1x1 pillars
      bot.pathfinder.setMovements(defaultMove);

      bot.followTarget = null;
      bot.comingTo = null;
      bot.mineBlock = null;
      bot.digTarget = null;
      bot._activeGoalKey = null;
      // Initialize spam intervals
      bot.spamLinkInterval = null;
      bot.spamTextInterval = null;
      bot.spamMsgInterval = null;
      let stuckTicks = 0;
      let lastActionTime = 0; // cooldown for stuck actions

      bot.followInterval = setInterval(() => {
        if (bot.followTarget && bot.entity) {
          const target = bot.players[bot.followTarget]?.entity;
          if (!target) return;
          const distance = bot.entity.position.distanceTo(target.position);
          const goalKey = `follow:${bot.followTarget}`;

          if (distance > 2) {
            if (bot._activeGoalKey !== goalKey) {
              bot.setControlState('sprint', true);
              bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
              bot._activeGoalKey = goalKey;
              stuckTicks = 0;
            }

            const isMoving = bot.pathfinder.isMoving();
            const targetY = target.position.y;
            const botY = bot.entity.position.y;

            if (!isMoving) {
              stuckTicks++;
              const now = Date.now();
              if (now - lastActionTime > 800) {
                lastActionTime = now;
                stuckTicks = 0;

                if (targetY > botY + 1.5) {
                  // Build pillar
                  const item = bot.inventory.items().find(i => 
                    i.name.includes('cobblestone') || i.name.includes('dirt') || 
                    i.name.includes('planks') || i.name.includes('stone') || 
                    i.name.includes('sand') || i.name.includes('gravel')
                  );
                  if (item) {
                    bot.equip(item, 'hand').then(() => {
                      bot.setControlState('jump', true);
                      setTimeout(() => {
                        const refBlock = bot.blockAt(bot.entity.position.offset(0, -2, 0));
                        const placePos = bot.entity.position.offset(0, -1, 0);
                        const blockAtPlace = bot.blockAt(placePos);
                        if (refBlock && refBlock.name !== 'air' && blockAtPlace && blockAtPlace.name === 'air') {
                          bot.placeBlock(refBlock, new mineflayer.Vec3(0, 1, 0)).catch(() => {});
                        }
                        bot.setControlState('jump', false);
                      }, 200);
                    }).catch(() => {});
                  } else {
                    bot.setControlState('jump', true);
                    setTimeout(() => bot.setControlState('jump', false), 300);
                  }
                } else {
                  // Try to break block in front (within 4 blocks) if not above target
                  const yaw = bot.entity.yaw;
                  const dx = -Math.sin(yaw);
                  const dz = -Math.cos(yaw);
                  // Check a few points in front (1,2,3 blocks ahead at head height)
                  let broke = false;
                  for (let i = 1; i <= 3; i++) {
                    const checkPos = bot.entity.position.offset(dx * i, 1, dz * i);
                    const block = bot.blockAt(checkPos);
                    if (block && block.name !== 'air' && bot.canDigBlock(block) && bot.entity.position.distanceTo(block.position) <= 4) {
                      bot.dig(block).catch(() => {});
                      broke = true;
                      break;
                    }
                  }
                  if (!broke) {
                    // Just jump
                    bot.setControlState('jump', true);
                    setTimeout(() => bot.setControlState('jump', false), 300);
                  }
                }
              }
            } else {
              stuckTicks = 0;
            }
          } else {
            if (bot._activeGoalKey === goalKey) {
              bot.setControlState('sprint', false);
              bot.pathfinder.setGoal(null);
              bot.clearControlStates();
              bot._activeGoalKey = null;
            }
          }
        } else if (bot._activeGoalKey?.startsWith('follow:')) {
          bot.setControlState('sprint', false);
          bot.pathfinder.setGoal(null);
          bot.clearControlStates();
          bot._activeGoalKey = null;
        }
      }, 500);

      bot.comeInterval = setInterval(() => {
        if (bot.comingTo && bot.entity) {
          const target = bot.players[bot.comingTo]?.entity;
          if (!target) return;
          const distance = bot.entity.position.distanceTo(target.position);
          const goalKey = `come:${bot.comingTo}`;

          if (distance > 2) {
            if (bot._activeGoalKey !== goalKey) {
              bot.setControlState('sprint', true);
              bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
              bot._activeGoalKey = goalKey;
              stuckTicks = 0;
            }
            if (!bot.pathfinder.isMoving()) {
              stuckTicks++;
              if (stuckTicks >= 2) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 400);
                stuckTicks = 0;
              }
            } else {
              stuckTicks = 0;
            }
          } else {
            bot.setControlState('sprint', false);
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            bot._activeGoalKey = null;
            bot.comingTo = null;
          }
        } else if (bot._activeGoalKey?.startsWith('come:')) {
          bot.setControlState('sprint', false);
          bot.pathfinder.setGoal(null);
          bot.clearControlStates();
          bot._activeGoalKey = null;
        }
      }, 500);

      // Mining / digging loop
      bot.mineInterval = setInterval(() => {
        if (!bot.entity) return;
        if (bot.digTarget) {
          const block = bot.blockAt(bot.digTarget);
          if (!block) {
            bot.digTarget = null;
            bot.pathfinder.setGoal(null);
            bot._activeGoalKey = null;
            return;
          }
          const distance = bot.entity.position.distanceTo(block.position);
          if (distance <= 3) {
            bot.pathfinder.setGoal(null);
            bot._activeGoalKey = null;
            bot.digTarget = null;
            if (bot.canDigBlock(block)) bot.dig(block).catch(() => {});
          } else {
            const goalKey = `digTarget:${block.position.x},${block.position.y},${block.position.z}`;
            if (bot._activeGoalKey !== goalKey) {
              bot.pathfinder.setGoal(new goals.GoalNear(block.position.x, block.position.y, block.position.z, 1), true);
              bot._activeGoalKey = goalKey;
            }
          }
          return;
        }

        if (bot.mineBlock && !bot.followTarget && !bot.comingTo) {
          const blocks = bot.findBlocks({ matching: b => b.name.includes(bot.mineBlock), count: 10 });
          if (blocks.length > 0) {
            const blockPos = blocks[Math.floor(Math.random() * blocks.length)];
            const block = bot.blockAt(blockPos);
            if (!block) return;
            const distance = bot.entity.position.distanceTo(block.position);
            if (distance <= 3) {
              if (bot.canDigBlock(block)) bot.dig(block).catch(() => {});
            } else {
              const goalKey = `mine:${bot.mineBlock}:${blockPos.x},${blockPos.y},${blockPos.z}`;
              if (bot._activeGoalKey !== goalKey) {
                bot.pathfinder.setGoal(new goals.GoalNear(blockPos.x, blockPos.y, blockPos.z, 1), true);
                bot._activeGoalKey = goalKey;
              }
            }
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

    bot.once('kicked', (reason) => {
      botStatus[botUsername] = 'kicked';
      pickNewLeaderIfNeeded();
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} kicked: ${reason}`);
      if (consoleLogs.length > 100) consoleLogs.shift();
      cleanupBot(bot);
    });

    bot.once('end', () => {
      if (bots[botUsername] !== bot) return;
      botStatus[botUsername] = 'offline';
      pickNewLeaderIfNeeded();
      botPlaytime[botUsername] = (botPlaytime[botUsername] || 0) + (botJoinTime[botUsername] ? Date.now() - botJoinTime[botUsername] : 0);
      consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} disconnected`);
      if (consoleLogs.length > 100) consoleLogs.shift();
      cleanupBot(bot);
      setTimeout(() => createBot(botUsername), 5000);
    });

    bot.on('whisper', (username, message) => {
      if (myUsername.includes(username.toLowerCase())) handleCommand(username, message);
    });
    bot.on('chat', (username, message) => {
      if (bot.username !== commandLeaderUsername) return;
      if (username !== bot.username && message.startsWith('!') && myUsername.includes(username.toLowerCase())) {
        handleCommand(username, message);
      }
    });

  } catch (e) {
    botStatus[botUsername] = 'error';
    consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${botUsername} failed to start: ${e.message}`);
    if (consoleLogs.length > 100) consoleLogs.shift();
    setTimeout(() => createBot(botUsername), 5000);
  }
}

function cleanupBot(bot) {
  clearInterval(bot.followInterval);
  clearInterval(bot.comeInterval);
  clearInterval(bot.mineInterval);
  // Clear all spam intervals
  clearInterval(bot.spamLinkInterval);
  clearInterval(bot.spamTextInterval);
  clearInterval(bot.spamMsgInterval);
}

// API endpoint for website auto-update
app.get('/api/status', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  const uptime = fmtTime(Date.now() - (global.startTime || Date.now()));
  const botCards = botNames.map(name => {
    const status = botStatus[name] || 'offline';
    const playtime = fmtTime((botPlaytime[name] || 0) + (botJoinTime[name] && status === 'online' ? Date.now() - botJoinTime[name] : 0));
    return { name, status, playtime };
  });
  res.json({
    onlineCount,
    uptime,
    totalCommandsExecuted,
    botCards,
    consoleLogs: consoleLogs.slice(-15),
    mcConsoleLogs: mcConsoleLogs.slice(-15)
  });
});

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
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot Army</title>
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
      </style>
    </head>
    <body>
      <h1>CloudAFK Bot Army</h1>
      <div class="grid">
        <div class="card"><h3>Bots Online</h3><div class="value" id="onlineCount">0</div></div>
        <div class="card"><h3>Uptime</h3><div class="value" id="uptime">0s</div></div>
        <div class="card"><h3>Commands</h3><div class="value" id="commandCount">0</div></div>
      </div>
      <div class="bots" id="botCards"></div>

      <div class="console" style="height: 220px;">
        <h3>Commands</h3>
        ${COMMAND_REFERENCE.map(section => `
          <div class="log" style="color:#FFA500; font-weight:bold; margin-top:6px;">${section.group}</div>
          ${section.lines.map(l => `<div class="log">${l}</div>`).join('')}
        `).join('')}
      </div>

      <div class="console" id="botConsole">
        <h3>Bot Console</h3>
      </div>
      <form action="/api/botcommand" method="POST"><input type="text" name="command" placeholder="Bot command... !come all" required><button>Send</button></form>

      <div class="console" id="mcConsole">
        <h3>MC Console</h3>
      </div>
      <form action="/api/mccommand" method="POST"><input type="text" name="command" placeholder="MC command... /time set day" required><button>Send</button></form>

      <script>
        function updateStatus() {
          fetch('/api/status')
            .then(res => res.json())
            .then(data => {
              document.getElementById('onlineCount').textContent = data.onlineCount + ' / ${NUMBER_OF_BOTS}';
              document.getElementById('uptime').textContent = data.uptime;
              document.getElementById('commandCount').textContent = data.totalCommandsExecuted;

              const botCardsDiv = document.getElementById('botCards');
              botCardsDiv.innerHTML = data.botCards.map(bot => {
                let statusColor = '#ff4444';
                if (bot.status === 'online') statusColor = '#4CAF50';
                else if (bot.status === 'connecting') statusColor = '#FFA500';
                return '<div style="background: #16213e; border-radius: 10px; padding: 15px; text-align: center;"><h3>' + bot.name + '</h3><div style="color: ' + statusColor + '; font-weight: bold;">' + bot.status + '</div><div style="color: #4CAF50;">' + bot.playtime + '</div></div>';
              }).join('');

              const botConsole = document.getElementById('botConsole');
              botConsole.innerHTML = '<h3>Bot Console</h3>' + (data.consoleLogs.map(l => '<div class="log" style="color:#4CAF50;">' + l + '</div>').join('') || '<div class="log">No logs</div>');

              const mcConsole = document.getElementById('mcConsole');
              mcConsole.innerHTML = '<h3>MC Console</h3>' + (data.mcConsoleLogs.map(l => '<div class="log">' + l + '</div>').join('') || '<div class="log">No messages</div>');
            })
            .catch(err => console.error('Update failed', err));
        }

        updateStatus();
        setInterval(updateStatus, 3000);
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
