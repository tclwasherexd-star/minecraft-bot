const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const { Vec3 } = require('vec3');
const net = require('net');

const app = express();
const http = require('http').createServer(app);

const config = {
  host: 'node-sg-free-01.tickhosting.com',
  port: 50838,
  version: '1.20.1',
  auth: 'offline',
  hideErrors: true,
  checkTimeoutInterval: 120000,
};

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];

const botNames = [
  'ShadowBlade',
  'NightStalker',
  'DarkReaper',
  'GhostWalker',
  'StormBreaker',
];

const NUMBER_OF_BOTS = botNames.length;
const PORT = process.env.PORT || 3000;

const RECONNECT_BASE_MS = 5000;
const RECONNECT_MAX_MS = 60000;
const FOLLOW_UPDATE_MS = 350;
const COME_UPDATE_MS = 300;
const MINE_UPDATE_MS = 500;
const LOOK_UPDATE_MS = 150;
const STUCK_CHECK_MS = 750;
const STUCK_DISTANCE = 0.08;
const STUCK_LIMIT = 4;
const WATER_RECOVERY_MS = 1000;
const PATH_RETRY_MS = 1500;
const FOLLOW_DISTANCE = 2.2;
const COME_DISTANCE = 2.0;
const DUPLICATE_WINDOW_MS = 400;
const SPAM_INTERVAL_MS = 1000;

const bots = Object.create(null);
const botStatus = Object.create(null);
const botPlaytime = Object.create(null);
const botJoinTime = Object.create(null);
const reconnectAttempts = Object.create(null);

let totalCommandsExecuted = 0;
const commandHistory = [];
const mcConsoleLogs = [];
const consoleLogs = [];
let commandLeaderUsername = null;
const mcServerState = { status: 'checking', latency: null, lastChecked: 0, error: '' };
let mcProbeInFlight = false;
const recentCommands = new Map();

function logConsole(message) {
  consoleLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (consoleLogs.length > 100) consoleLogs.shift();
  console.log(message);
}

function logMc(message) {
  mcConsoleLogs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
  if (mcConsoleLogs.length > 50) mcConsoleLogs.shift();
}

function pickNewLeaderIfNeeded() {
  if (commandLeaderUsername && botStatus[commandLeaderUsername] === 'online') return;
  commandLeaderUsername = botNames.find((name) => botStatus[name] === 'online') || null;
}

function isDuplicate(username, message) {
  const key = `${username.toLowerCase()}::${message}`;
  const now = Date.now();
  const last = recentCommands.get(key);
  if (last && now - last < DUPLICATE_WINDOW_MS) return true;
  recentCommands.set(key, now);

  for (const [k, t] of recentCommands) {
    if (now - t > DUPLICATE_WINDOW_MS * 5) recentCommands.delete(k);
  }
  return false;
}

function getBotNamesForTargeting() {
  return ['all', ...botNames.map((name) => name.toLowerCase())];
}

function findBotByName(name) {
  if (!name) return null;
  const lower = name.toLowerCase();
  return botNames.find((botName) => botName.toLowerCase() === lower) || null;
}

function getTargetBots(botArg) {
  if (!botArg || botArg.toLowerCase() === 'all') {
    return Object.values(bots).filter((bot) => bot && bot.entity);
  }

  const exactName = findBotByName(botArg);
  if (exactName && bots[exactName]?.entity) return [bots[exactName]];

  const partial = botNames.find((name) =>
    name.toLowerCase().includes(botArg.toLowerCase()) && bots[name]?.entity
  );
  return partial ? [bots[partial]] : [];
}

function safeWhisper(bot, target, text) {
  try {
    if (bot?.entity) bot.whisper(target, String(text));
  } catch (error) {
    logConsole(`${bot?.username || 'bot'} whisper error: ${error.message}`);
  }
}

function clearIntervalSafe(bot, key) {
  if (bot && bot[key]) {
    clearInterval(bot[key]);
    bot[key] = null;
  }
}

function stopSpam(bot) {
  clearIntervalSafe(bot, 'spamLinkInterval');
  clearIntervalSafe(bot, 'spamTextInterval');
  clearIntervalSafe(bot, 'spamMsgInterval');
}

function clearMovement(bot) {
  bot.followTarget = null;
  bot.comingTo = null;
  bot.mineBlock = null;
  bot.digTarget = null;
  bot.lookAtTarget = null;
  bot._activeGoalKey = null;
  bot._followGoalTime = 0;
  bot._lastMineBlockKey = null;
  bot._stuckTicks = 0;

  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  } catch (_) {}
}

function stopOnlyMovement(bot) {
  bot.followTarget = null;
  bot.comingTo = null;
  bot.mineBlock = null;
  bot.digTarget = null;
  bot._activeGoalKey = null;
  bot._followGoalTime = 0;
  bot._lastMineBlockKey = null;
  bot._stuckTicks = 0;
  try {
    bot.pathfinder.setGoal(null);
    bot.clearControlStates();
  } catch (_) {}
}

function normalizePlayerName(bot, wantedName) {
  if (!wantedName) return null;
  const wanted = wantedName.toLowerCase();
  const exact = Object.keys(bot.players).find((name) => name.toLowerCase() === wanted);
  if (exact) return exact;
  const partial = Object.keys(bot.players).find((name) => name.toLowerCase().includes(wanted));
  return partial || null;
}

function parseTargetArgument(command, args) {
  let botArg = null;
  const allowed = getBotNamesForTargeting();
  const possibleFirst = args[1]?.toLowerCase();
  const possibleLast = args[args.length - 1]?.toLowerCase();

  // Commands that naturally support a bot target as the first argument after the command.
  const firstTargetCommands = new Set(['!talk', '!shout', '!msg', '!echo', '!dig', '!link', '!spamtext', '!msgspam']);

  if (firstTargetCommands.has(command) && possibleFirst && allowed.includes(possibleFirst)) {
    botArg = args[1];
    args.splice(1, 1);
    return botArg;
  }

  // Otherwise accept the target as the final argument.
  if (possibleLast && allowed.includes(possibleLast)) {
    botArg = args[args.length - 1];
    args.pop();
  }

  return botArg;
}

const COMMAND_REFERENCE = [
  {
    group: 'Targeting',
    lines: [
      'Add a bot name OR "all" to any command that supports [bot|all].',
      'Example: !killbot all',
      'Example: !killbot ShadowBlade',
      'Example: !lookat tcl all',
    ],
  },
  {
    group: 'Info',
    lines: [
      '!coords [bot|all] â€” bot X/Y/Z',
      '!status [bot|all] â€” bot HP',
      '!ping [bot|all] â€” bot ping',
      '!players [bot|all] â€” online players',
      '!exp [bot|all] â€” bot XP level',
      '!gamemode [bot|all] â€” bot gamemode',
      '!uptime [bot|all] â€” time since last join',
      '!inventory [bot|all] â€” bot inventory',
      '!botcount â€” online bot count',
    ],
  },
  {
    group: 'Movement',
    lines: [
      '!come [bot|all] â€” walk to you',
      '!follow [player] [bot|all] â€” continuously follow a player',
      '!goto <x> <y> <z> [bot|all] â€” walk to coordinates',
      '!line [bot|all] â€” teleport into a line behind you',
      '!stop [bot|all] â€” stop movement/mining/spam',
      '!jump [bot|all] â€” single jump',
      '!sneak [bot|all]',
      '!unsneak [bot|all]',
    ],
  },
  {
    group: 'Looking',
    lines: [
      '!lookat <player> [bot|all] â€” continuously track a player',
      '!lookatstop [bot|all] â€” stop tracking',
    ],
  },
  {
    group: 'Teleport',
    lines: [
      '!tpbring [bot|all] â€” request server teleport to you',
    ],
  },
  {
    group: 'Chat',
    lines: [
      '!talk [bot|all] <message>',
      '!shout [bot|all] <message>',
      '!msg [bot|all] <player> <message>',
      '!echo [bot|all] <message>',
    ],
  },
  {
    group: 'Spam',
    lines: [
      '!link <url> [bot|all] â€” rate-limited chat repeat',
      '!spamtext <message> [bot|all] â€” rate-limited chat repeat',
      '!msgspam <player> <message> [bot|all] â€” rate-limited whisper repeat',
      '!stoplink [bot|all]',
      '!stopspam [bot|all]',
    ],
  },
  {
    group: 'Server / self',
    lines: [
      '!killbot [bot|all]',
      '!survival [bot|all]',
      '!creative [bot|all]',
      '!kick <player> [bot|all]',
    ],
  },
  {
    group: 'Items / blocks',
    lines: [
      '!mine <block> [bot|all] â€” repeatedly find the nearest matching block',
      '!stopmine [bot|all]',
      '!dig [block] [bot|all] â€” repeatedly mine a block type, or cursor target when no block is given',
      '!armor [bot|all]',
      '!drop [bot|all]',
      '!dropall [bot|all]',
      '!equip <item> [bot|all]',
    ],
  },
  {
    group: 'Lookup',
    lines: [
      '!nearbyplayers [bot|all]',
      '!health [player] [bot|all]',
      '!whereis <player> [bot|all]',
    ],
  },
];

function sendHelp(username) {
  const bot = Object.values(bots).find((candidate) => candidate?.entity);
  if (!bot) return;

  const lines = [`Bots: ${botNames.join(', ')}`];
  for (const section of COMMAND_REFERENCE) {
    lines.push(`--- ${section.group} ---`);
    lines.push(...section.lines);
  }

  lines.forEach((line, index) => {
    setTimeout(() => safeWhisper(bot, username, line), index * 250);
  });
}

function handleCommand(username, message) {
  if (!username || !myUsername.includes(username.toLowerCase())) return;
  if (typeof message !== 'string' || !message.trim()) return;
  if (isDuplicate(username, message)) return;

  totalCommandsExecuted += 1;
  commandHistory.push(`[${new Date().toLocaleTimeString()}] ${username}: ${message}`);
  if (commandHistory.length > 50) commandHistory.shift();

  const args = message.trim().split(/\s+/);
  const command = args[0]?.toLowerCase();

  if (command === '!help' || command === '!commands') {
    sendHelp(username);
    return;
  }

  const botArg = parseTargetArgument(command, args);

  if (command === '!botcount') {
    const online = botNames.filter((name) => botStatus[name] === 'online').length;
    const onlineNames = botNames.filter((name) => botStatus[name] === 'online');
    const text = onlineNames.length
      ? `Online bots: ${online}/${NUMBER_OF_BOTS} â€” ${onlineNames.join(', ')}`
      : `Online bots: 0/${NUMBER_OF_BOTS}`;
    const anyBot = Object.values(bots).find((candidate) => candidate?.entity);
    if (anyBot) safeWhisper(anyBot, username, text);
    return;
  }

  const targetBots = getTargetBots(botArg);
  if (targetBots.length === 0) return;

  targetBots.forEach((targetBot, index) => {
    setTimeout(() => executeCommand(targetBot, username, args, command), index * 150);
  });
}

function executeCommand(bot, username, args, command) {
  const botName = bot.username;

  try {
    if (!bot.entity) return;

    if (command === '!coords') {
      const p = bot.entity.position;
      safeWhisper(bot, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!status') {
      safeWhisper(bot, username, `${botName} HP:${bot.health}/20`);
      return;
    }

    if (command === '!ping') {
      safeWhisper(bot, username, `${botName} Ping: ${bot.player?.ping ?? 'unknown'}ms`);
      return;
    }

    if (command === '!players') {
      safeWhisper(bot, username, `Online: ${Object.keys(bot.players).join(', ') || 'none'}`);
      return;
    }

    if (command === '!exp') {
      safeWhisper(bot, username, `${botName} XP: ${bot.experience.level}`);
      return;
    }

    if (command === '!gamemode') {
      safeWhisper(bot, username, `${botName} Gamemode: ${bot.game.gameMode}`);
      return;
    }

    if (command === '!uptime') {
      const join = botJoinTime[botName];
      safeWhisper(bot, username, `${botName} Uptime: ${join ? fmtTime(Date.now() - join) : '0s'}`);
      return;
    }

    if (command === '!inventory') {
      const items = bot.inventory.items();
      safeWhisper(
        bot,
        username,
        items.length
          ? `${botName} inventory: ${items.map((item) => `${item.name} x${item.count}`).join(', ')}`
          : `${botName} has empty inventory.`,
      );
      return;
    }

    if (command === '!tpbring') {
      stopOnlyMovement(bot);
      bot.chat(`/tp ${bot.username} ${username}`);
      safeWhisper(bot, username, `${botName} requesting /tp to you!`);
      return;
    }

    if (command === '!come') {
      const targetName = normalizePlayerName(bot, username);
      const target = targetName ? bot.players[targetName]?.entity : null;
      if (!target) {
        safeWhisper(bot, username, `Can't see ${username} right now.`);
        return;
      }
      bot.followTarget = null;
      bot.mineBlock = null;
      bot.digTarget = null;
      bot.comingTo = targetName;
      bot._followGoalTime = 0;
      bot._stuckTicks = 0;
      clearPathGoal(bot);
      repathToPlayer(bot, target, 'come');
      safeWhisper(bot, username, `${botName} walking to ${targetName}!`);
      return;
    }

    if (command === '!follow') {
      const targetRequested = args[1] || username;
      const targetName = normalizePlayerName(bot, targetRequested);
      const target = targetName ? bot.players[targetName]?.entity : null;

      if (!target) {
        safeWhisper(bot, username, `Can't see ${targetRequested}!`);
        return;
      }

      bot.comingTo = null;
      bot.mineBlock = null;
      bot.digTarget = null;
      bot.followTarget = targetName;
      bot._activeGoalKey = null;
      bot._followGoalTime = 0;
      bot._stuckTicks = 0;
      clearPathGoal(bot);
      repathToPlayer(bot, target, 'follow');
      safeWhisper(bot, username, `${botName} following ${targetName}!`);
      return;
    }

    if (command === '!goto') {
      const x = Number.parseFloat(args[1]);
      const y = Number.parseFloat(args[2]);
      const z = Number.parseFloat(args[3]);
      if ([x, y, z].every(Number.isFinite)) {
        clearMovement(bot);
        setPathGoal(bot, new goals.GoalNear(x, y, z, 1), `goto:${x},${y},${z}`);
        safeWhisper(bot, username, `${botName} walking to ${x},${y},${z}!`);
      } else {
        safeWhisper(bot, username, 'Usage: !goto <x> <y> <z> [bot|all]');
      }
      return;
    }

    if (command === '!line') {
      const owner = normalizePlayerName(bot, username);
      const ownerPlayer = owner ? bot.players[owner]?.entity : null;
      if (!ownerPlayer) {
        safeWhisper(bot, username, "Can't see you to line up.");
        return;
      }

      stopOnlyMovement(bot);
      const onlineBots = getTargetBots('all');
      const botIndex = Math.max(0, onlineBots.indexOf(bot));
      const offset = (botIndex - (onlineBots.length - 1) / 2) * 2;
      const ownerPos = ownerPlayer.position;
      const yaw = ownerPlayer.yaw;
      const lineX = ownerPos.x + Math.sin(yaw) * 3 + Math.cos(yaw) * offset;
      const lineZ = ownerPos.z + Math.cos(yaw) * 3 - Math.sin(yaw) * offset;

      bot.chat(`/tp ${bot.username} ${Math.floor(lineX)} ${Math.floor(ownerPos.y)} ${Math.floor(lineZ)}`);
      safeWhisper(bot, username, `${botName} teleporting to line up!`);
      return;
    }

    if (command === '!lookat') {
      const targetRequested = args[1];
      if (!targetRequested) {
        safeWhisper(bot, username, 'Usage: !lookat <player> [bot|all]');
        return;
      }
      const targetName = normalizePlayerName(bot, targetRequested);
      if (!targetName || !bot.players[targetName]?.entity) {
        safeWhisper(bot, username, `${botName} can't see ${targetRequested}.`);
        return;
      }
      bot.lookAtTarget = targetName;
      safeWhisper(bot, username, `${botName} is now tracking ${targetName}.`);
      return;
    }

    if (command === '!lookatstop') {
      bot.lookAtTarget = null;
      safeWhisper(bot, username, `${botName} stopped tracking.`);
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (text) bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (text) bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!msg') {
      const target = args[1];
      const text = args.slice(2).join(' ');
      if (target && text) safeWhisper(bot, target, text);
      return;
    }

    if (command === '!echo') {
      const text = args.slice(1).join(' ');
      if (text) safeWhisper(bot, username, text);
      return;
    }

    if (command === '!link') {
      const url = args[1];
      if (!url) {
        safeWhisper(bot, username, 'Usage: !link <url> [bot|all]');
        return;
      }
      clearIntervalSafe(bot, 'spamLinkInterval');
      bot.spamLinkInterval = setInterval(() => {
        if (!bot.entity) return;
        try { bot.chat(url); } catch (_) {}
      }, SPAM_INTERVAL_MS);
      safeWhisper(bot, username, `${botName} repeating link every ${SPAM_INTERVAL_MS}ms.`);
      return;
    }

    if (command === '!spamtext') {
      const text = args.join(' ').trim();
      if (!text) {
        safeWhisper(bot, username, 'Usage: !spamtext <message> [bot|all]');
        return;
      }
      clearIntervalSafe(bot, 'spamTextInterval');
      bot.spamTextInterval = setInterval(() => {
        if (!bot.entity) return;
        try { bot.chat(text); } catch (_) {}
      }, SPAM_INTERVAL_MS);
      safeWhisper(bot, username, `${botName} repeating text every ${SPAM_INTERVAL_MS}ms.`);
      return;
    }

    if (command === '!msgspam') {
      const targetPlayer = args[1];
      const text = args.slice(2).join(' ').trim();
      if (!targetPlayer || !text) {
        safeWhisper(bot, username, 'Usage: !msgspam <player> <message> [bot|all]');
        return;
      }
      clearIntervalSafe(bot, 'spamMsgInterval');
      bot.spamMsgInterval = setInterval(() => {
        if (!bot.entity) return;
        safeWhisper(bot, targetPlayer, text);
      }, SPAM_INTERVAL_MS);
      safeWhisper(bot, username, `${botName} repeating whisper every ${SPAM_INTERVAL_MS}ms.`);
      return;
    }

    if (command === '!stoplink') {
      clearIntervalSafe(bot, 'spamLinkInterval');
      safeWhisper(bot, username, `${botName} stopped link spam.`);
      return;
    }

    if (command === '!stopspam') {
      stopSpam(bot);
      safeWhisper(bot, username, `${botName} stopped all spam.`);
      return;
    }

    if (command === '!stop') {
      stopOnlyMovement(bot);
      stopSpam(bot);
      safeWhisper(bot, username, `${botName} stopped.`);
      return;
    }

    if (command === '!jump') {
      if (!bot.entity.onGround) {
        safeWhisper(bot, username, `${botName} can't jump right now.`);
        return;
      }
      bot.setControlState('jump', true);
      setTimeout(() => {
        try { bot.setControlState('jump', false); } catch (_) {}
      }, 300);
      return;
    }

    if (command === '!killbot') {
      bot.chat(`/kill ${bot.username}`);
      return;
    }

    if (command === '!survival') {
      bot.chat('/gamemode survival');
      return;
    }

    if (command === '!creative') {
      bot.chat('/gamemode creative');
      return;
    }

    if (command === '!sneak') {
      bot.setControlState('sneak', true);
      return;
    }

    if (command === '!unsneak') {
      bot.setControlState('sneak', false);
      return;
    }

    if (command === '!kick') {
      const player = args[1];
      if (player) bot.chat(`/kick ${player}`);
      return;
    }

    if (command === '!mine') {
      const blockName = args.join('_').toLowerCase();
      if (!blockName) {
        safeWhisper(bot, username, 'Usage: !mine <block> [bot|all]');
        return;
      }
      bot.followTarget = null;
      bot.comingTo = null;
      bot.digTarget = null;
      bot.mineBlock = blockName;
      bot._activeGoalKey = null;
      safeWhisper(bot, username, `${botName} mining nearest matching ${blockName.replace(/_/g, ' ')}.`);
      return;
    }

    if (command === '!stopmine') {
      bot.mineBlock = null;
      bot.digTarget = null;
      bot._lastMineBlockKey = null;
      clearPathGoal(bot);
      safeWhisper(bot, username, `${botName} stopped mining.`);
      return;
    }

    if (command === '!dig') {
      const blockName = args.join('_').toLowerCase();

      if (blockName) {
        bot.followTarget = null;
        bot.comingTo = null;
        bot.mineBlock = blockName;
        bot.digTarget = null;
        bot._activeGoalKey = null;
        safeWhisper(bot, username, `${botName} digging nearest ${blockName.replace(/_/g, ' ')}.`);
        return;
      }

      const block = bot.blockAtCursor(64);
      if (!block || block.name === 'air') {
        safeWhisper(bot, username, `${botName} no solid block in sight.`);
        return;
      }

      bot.followTarget = null;
      bot.comingTo = null;
      bot.mineBlock = null;
      bot.digTarget = block.position.clone();
      bot._activeGoalKey = null;
      safeWhisper(bot, username, `${botName} moving to dig ${block.name}.`);
      return;
    }

    if (command === '!armor') {
      const armorSlots = {
        head: ['helmet', 'cap', 'hood', 'crown'],
        torso: ['chestplate', 'tunic', 'plate', 'chest'],
        legs: ['leggings', 'pants', 'legs'],
        feet: ['boots', 'shoes', 'slippers'],
      };
      const items = bot.inventory.items();
      const promises = [];
      const equipped = [];

      for (const slot of Object.keys(armorSlots)) {
        const item = items.find((candidate) => armorSlots[slot].some((word) => candidate.name.includes(word)));
        if (item) {
          promises.push(bot.equip(item, slot).then(() => equipped.push(slot)).catch(() => {}));
        }
      }

      Promise.all(promises).then(() => {
        safeWhisper(bot, username, equipped.length
          ? `${botName} equipped: ${equipped.join(', ')}`
          : `${botName} found no armor.`);
      });
      return;
    }

    if (command === '!drop') {
      const held = bot.heldItem;
      if (held) bot.tossStack(held).catch(() => {});
      return;
    }

    if (command === '!dropall') {
      const items = [...bot.inventory.items()];
      (async () => {
        for (const item of items) {
          try { await bot.tossStack(item); } catch (_) {}
        }
      })();
      return;
    }

    if (command === '!equip') {
      const wanted = args.join('_').toLowerCase();
      if (!wanted) return;
      const item = bot.inventory.items().find((candidate) => candidate.name.includes(wanted));
      if (item) bot.equip(item, 'hand').catch(() => {});
      return;
    }

    if (command === '!nearbyplayers') {
      const names = Object.values(bot.players)
        .filter((player) => player.entity && player.username !== bot.username)
        .map((player) => player.username);
      safeWhisper(bot, username, names.length ? `Nearby: ${names.join(', ')}` : 'No players nearby.');
      return;
    }

    if (command === '!health') {
      const requested = args[1] || username;
      const targetName = normalizePlayerName(bot, requested);
      const target = targetName ? bot.players[targetName]?.entity : null;
      safeWhisper(bot, username, target
        ? `${targetName} HP: ${target.health ?? 'unknown'}`
        : `Can't see ${requested}.`);
      return;
    }

    if (command === '!whereis') {
      const requested = args[1];
      if (!requested) return;
      const targetName = normalizePlayerName(bot, requested);
      const target = targetName ? bot.players[targetName]?.entity : null;
      if (!target) {
        safeWhisper(bot, username, `Can't see ${requested}.`);
        return;
      }
      const p = target.position;
      safeWhisper(bot, username, `${targetName}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }
  } catch (error) {
    logConsole(`${botName} command ${command} error: ${error.stack || error.message}`);
  }
}


function setPathGoal(bot, goal, key = '') {
  if (!bot?.entity || !bot.pathfinder) return false;
  try {
    if (key && bot._activeGoalKey === key) return true;
    bot.pathfinder.setGoal(goal, true);
    bot._activeGoalKey = key || null;
    bot._lastPathSetAt = Date.now();
    bot._pathFailures = 0;
    return true;
  } catch (error) {
    bot._pathFailures = (bot._pathFailures || 0) + 1;
    logConsole(`${bot.username} pathfinder goal error: ${error.message}`);
    return false;
  }
}

function clearPathGoal(bot) {
  try {
    bot.pathfinder.setGoal(null);
  } catch (_) {}
  bot._activeGoalKey = null;
  bot._lastPathSetAt = 0;
}

function isPassableBlock(block) {
  if (!block) return false;
  return block.name === 'air' ||
    block.boundingBox === 'empty' ||
    block.name === 'water' ||
    block.name === 'flowing_water';
}

function isSolidSupport(block) {
  return !!block && block.boundingBox === 'block';
}

function hasHeadroom(bot, x, y, z) {
  const feet = bot.blockAt(new Vec3(x, y, z));
  const head = bot.blockAt(new Vec3(x, y + 1, z));
  return isPassableBlock(feet) && isPassableBlock(head);
}

function nearestWalkableAround(bot, center, radius = 3) {
  if (!bot?.entity || !center) return null;

  let best = null;
  let bestScore = Infinity;

  const cx = Math.floor(center.x);
  const cy = Math.floor(center.y);
  const cz = Math.floor(center.z);

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dy = -2; dy <= 2; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        const z = cz + dz;

        if (!hasHeadroom(bot, x, y, z)) continue;

        const below = bot.blockAt(new Vec3(x, y - 1, z));
        if (!isSolidSupport(below) && !isWaterBlock(below)) continue;

        const pos = new Vec3(x + 0.5, y, z + 0.5);
        const score = pos.distanceTo(bot.entity.position) + pos.distanceTo(center) * 0.15;

        if (score < bestScore) {
          best = pos;
          bestScore = score;
        }
      }
    }
  }

  return best;
}

function repathToPlayer(bot, target, mode = 'follow') {
  if (!bot?.entity || !target) return false;

  const distance = bot.entity.position.distanceTo(target.position);

  if (mode === 'follow' && distance <= FOLLOW_DISTANCE) {
    clearPathGoal(bot);
    bot.clearControlStates();
    return true;
  }

  if (mode === 'come' && distance <= COME_DISTANCE) {
    clearPathGoal(bot);
    bot.clearControlStates();
    return true;
  }

  const key = `${mode}:${Math.floor(target.position.x)},${Math.floor(target.position.y)},${Math.floor(target.position.z)}`;

  if (mode === 'follow') {
    return setPathGoal(bot, new goals.GoalFollow(target, FOLLOW_DISTANCE), key);
  }

  return setPathGoal(
    bot,
    new goals.GoalNear(target.position.x, target.position.y, target.position.z, COME_DISTANCE),
    key
  );
}

function findNearestMatchingBlock(bot, fragment, maxDistance = 64) {
  const needle = fragment.toLowerCase();
  return bot.findBlock({
    matching: (block) => block && block.name && block.name.toLowerCase().includes(needle),
    maxDistance,
  });
}

function isDiggable(bot, block) {
  try {
    return !!block && block.name !== 'air' && bot.canDigBlock(block);
  } catch (_) {
    return false;
  }
}

async function digBlockSafely(bot, block) {
  if (!bot.entity || !block || bot.targetDigBlock) return false;
  if (!isDiggable(bot, block)) return false;

  try {
    const distance = bot.entity.position.distanceTo(block.position);
    if (distance > 4.5) return false;

    await bot.lookAt(
      new Vec3(block.position.x + 0.5, block.position.y + 0.5, block.position.z + 0.5),
      true
    ).catch(() => {});

    await bot.dig(block);
    return true;
  } catch (error) {
    logConsole(`${bot.username} dig error: ${error.message}`);
    return false;
  }
}

function getBuildingBlock(bot) {
  const preferred = [
    'cobblestone', 'stone', 'deepslate', 'dirt', 'netherrack',
    'andesite', 'diorite', 'granite', 'tuff', 'planks', 'sand', 'gravel',
  ];
  return bot.inventory.items().find((item) => preferred.some((word) => item.name.includes(word)));
}

async function placeBlockBelow(bot) {
  if (!bot.entity || !bot.entity.onGround) return false;
  const item = getBuildingBlock(bot);
  if (!item) return false;

  try {
    await bot.equip(item, 'hand');
    const reference = bot.blockAt(bot.entity.position.offset(0, -2, 0));
    if (!reference || reference.name === 'air') return false;
    await bot.placeBlock(reference, new Vec3(0, 1, 0));
    return true;
  } catch (error) {
    logConsole(`${bot.username} place-block error: ${error.message}`);
    return false;
  }
}

async function breakBlockInFront(bot) {
  if (!bot.entity || !bot.entity.onGround || bot.targetDigBlock) return false;

  const yaw = bot.entity.yaw;
  const dx = -Math.sin(yaw);
  const dz = -Math.cos(yaw);

  for (let distance = 1; distance <= 2.5; distance += 0.5) {
    const base = bot.entity.position.offset(dx * distance, 0, dz * distance);
    for (const yOffset of [0, 1]) {
      const block = bot.blockAt(base.offset(0, yOffset, 0));
      if (isDiggable(bot, block) && bot.entity.position.distanceTo(block.position) <= 4) {
        return digBlockSafely(bot, block);
      }
    }
  }
  return false;
}

function isWaterBlock(block) {
  return !!block && (block.name === 'water' || block.name === 'flowing_water');
}

function isInLiquid(bot) {
  if (!bot?.entity) return false;
  const pos = bot.entity.position;
  const samples = [
    bot.blockAt(pos),
    bot.blockAt(pos.offset(0, 0.9, 0)),
  ];
  return samples.some(isWaterBlock);
}

function findNearbyDrySpot(bot, radius = 6) {
  if (!bot?.entity) return null;
  const base = bot.entity.position.floored();
  let best = null;
  let bestDistance = Infinity;

  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dz = -radius; dz <= radius; dz += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const feet = bot.blockAt(base.offset(dx, dy, dz));
        const head = bot.blockAt(base.offset(dx, dy + 1, dz));
        const below = bot.blockAt(base.offset(dx, dy - 1, dz));
        if (!feet || !head || !below) continue;
        if (isWaterBlock(feet) || isWaterBlock(head)) continue;
        if (feet.name !== 'air' || head.name !== 'air') continue;
        if (below.boundingBox !== 'block') continue;

        const distance = feet.position.distanceTo(bot.entity.position);
        if (distance < bestDistance) {
          best = feet.position.clone();
          bestDistance = distance;
        }
      }
    }
  }

  return best;
}

async function recoverFromWater(bot) {
  if (!bot?.entity) return false;

  const now = Date.now();
  if (now - (bot._lastWaterRecoveryAt || 0) < WATER_RECOVERY_MS) return false;
  bot._lastWaterRecoveryAt = now;

  try {
    bot.setControlState('jump', true);
    bot.setControlState('forward', true);
    bot.setControlState('sprint', true);
    setTimeout(() => {
      try {
        bot.setControlState('jump', false);
        bot.setControlState('forward', false);
        bot.setControlState('sprint', false);
      } catch (_) {}
    }, 900);
  } catch (_) {}

  const drySpot = findNearbyDrySpot(bot, 6);
  if (drySpot) {
    try {
      bot.pathfinder.setGoal(new goals.GoalNear(drySpot.x, drySpot.y, drySpot.z, 1), true);
      bot._activeGoalKey = `water-exit:${drySpot.x},${drySpot.y},${drySpot.z}`;
      return true;
    } catch (_) {}
  }

  return false;
}

async function recoverFromStuck(bot, targetY) {
  if (!bot?.entity) return;

  const now = Date.now();
  if (now - (bot._lastRecoveryAt || 0) < 2000) return;
  bot._lastRecoveryAt = now;

  if (isInLiquid(bot)) {
    await recoverFromWater(bot);
    return;
  }

  try {
    bot.pathfinder.setGoal(null);
  } catch (_) {}

  try {
    bot.setControlState('jump', true);
    bot.setControlState('forward', true);
    setTimeout(() => {
      try {
        bot.setControlState('jump', false);
        bot.setControlState('forward', false);
      } catch (_) {}
    }, 400);
  } catch (_) {}

  if (Number.isFinite(targetY) && targetY > bot.entity.position.y + 1.25) {
    await placeBlockBelow(bot);
  } else if (!bot.entity.onGround) {
    try { bot.setControlState('jump', true); } catch (_) {}
  } else {
    await breakBlockInFront(bot);
  }
}

function resetStuckTracking(bot) {
  bot._lastPosition = bot.entity?.position?.clone() || null;
  bot._stuckTicks = 0;
}

function updateFollow(bot) {
  if (!bot.entity || !bot.followTarget) {
    if (bot._activeGoalKey?.startsWith('follow:')) {
      clearPathGoal(bot);
      bot.clearControlStates();
      bot._followGoalTime = 0;
    }
    return;
  }

  const targetName = normalizePlayerName(bot, bot.followTarget);
  const target = targetName ? bot.players[targetName]?.entity : null;
  if (!target) return;

  bot.followTarget = targetName;
  const distance = bot.entity.position.distanceTo(target.position);

  if (distance <= FOLLOW_DISTANCE) {
    clearPathGoal(bot);
    bot.clearControlStates();
    resetStuckTracking(bot);
    return;
  }

  if (isInLiquid(bot)) {
    if (bot._stuckTicks >= 2) {
      recoverFromWater(bot).catch(() => {});
      return;
    }
  }

  const now = Date.now();
  const targetKey = `follow:${targetName}:${Math.floor(target.position.x)},${Math.floor(target.position.y)},${Math.floor(target.position.z)}`;

  // Repath often enough to follow a moving target, but don't thrash the pathfinder every tick.
  if (
    bot._activeGoalKey !== targetKey &&
    now - (bot._lastPathSetAt || 0) >= PATH_RETRY_MS
  ) {
    repathToPlayer(bot, target, 'follow');
  } else if (
    now - (bot._followGoalTime || 0) >= FOLLOW_UPDATE_MS &&
    now - (bot._lastPathSetAt || 0) >= FOLLOW_UPDATE_MS
  ) {
    repathToPlayer(bot, target, 'follow');
  }

  if (bot._lastPosition) {
    const moved = bot.entity.position.distanceTo(bot._lastPosition);
    if (moved < STUCK_DISTANCE && distance > 3) bot._stuckTicks += 1;
    else if (moved >= STUCK_DISTANCE) bot._stuckTicks = 0;
  }

  bot._lastPosition = bot.entity.position.clone();

  if (bot._stuckTicks >= STUCK_LIMIT) {
    bot._stuckTicks = 0;
    recoverFromStuck(bot, target.position.y).catch(() => {});
  }
}

function updateCome(bot) {
  if (!bot.entity || !bot.comingTo) {
    if (bot._activeGoalKey?.startsWith('come:')) {
      clearPathGoal(bot);
      bot.clearControlStates();
    }
    return;
  }

  const targetName = normalizePlayerName(bot, bot.comingTo);
  const target = targetName ? bot.players[targetName]?.entity : null;
  if (!target) return;

  bot.comingTo = targetName;
  const distance = bot.entity.position.distanceTo(target.position);

  if (distance <= COME_DISTANCE) {
    clearPathGoal(bot);
    bot.clearControlStates();
    bot.comingTo = null;
    resetStuckTracking(bot);
    return;
  }

  if (isInLiquid(bot) && bot._stuckTicks >= 2) {
    recoverFromWater(bot).catch(() => {});
    return;
  }

  const now = Date.now();
  if (
    !bot._activeGoalKey?.startsWith(`come:${targetName}:`) ||
    now - (bot._lastPathSetAt || 0) >= PATH_RETRY_MS
  ) {
    repathToPlayer(bot, target, 'come');
  }

  if (bot._lastPosition) {
    const moved = bot.entity.position.distanceTo(bot._lastPosition);
    if (moved < STUCK_DISTANCE && distance > 3) bot._stuckTicks += 1;
    else if (moved >= STUCK_DISTANCE) bot._stuckTicks = 0;
  }

  bot._lastPosition = bot.entity.position.clone();

  if (bot._stuckTicks >= STUCK_LIMIT) {
    bot._stuckTicks = 0;
    recoverFromStuck(bot, target.position.y).catch(() => {});
  }
}

async function updateMining(bot) {
  if (!bot.entity || bot.targetDigBlock) return;

  if (bot.digTarget) {
    const block = bot.blockAt(bot.digTarget);
    if (!block || block.name === 'air') {
      bot.digTarget = null;
      bot.pathfinder.setGoal(null);
      bot._activeGoalKey = null;
      return;
    }

    const distance = bot.entity.position.distanceTo(block.position);
    const key = `digTarget:${block.position.x},${block.position.y},${block.position.z}`;

    if (distance <= 4.0) {
      bot.pathfinder.setGoal(null);
      bot._activeGoalKey = null;
      const target = bot.digTarget.clone();
      const ok = await digBlockSafely(bot, bot.blockAt(target));
      if (!ok) {
        bot._digRetries = (bot._digRetries || 0) + 1;
        if (bot._digRetries >= 3) {
          bot.digTarget = null;
          bot._digRetries = 0;
  bot._lastPathSetAt = 0;
  bot._pathFailures = 0;
        }
      } else {
        bot.digTarget = null;
        bot._digRetries = 0;
  bot._lastPathSetAt = 0;
  bot._pathFailures = 0;
      }
    } else if (bot._activeGoalKey !== key) {
      setPathGoal(bot, new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2), key);
    }
    return;
  }

  if (!bot.mineBlock || bot.followTarget || bot.comingTo) return;

  const block = findNearestMatchingBlock(bot, bot.mineBlock, 64);
  if (!block) {
    bot.pathfinder.setGoal(null);
    bot._activeGoalKey = null;
    return;
  }

  const distance = bot.entity.position.distanceTo(block.position);
  const key = `mine:${bot.mineBlock}:${block.position.x},${block.position.y},${block.position.z}`;

  if (distance <= 4.0) {
    bot.pathfinder.setGoal(null);
    bot._activeGoalKey = key;
    const ok = await digBlockSafely(bot, block);
    if (!ok) {
      bot._lastMineBlockKey = key;
    } else {
      bot._lastMineBlockKey = null;
    }
  } else if (bot._activeGoalKey !== key) {
    bot._activeGoalKey = key;
    bot._lastMineBlockKey = key;
    setPathGoal(bot, new goals.GoalNear(block.position.x, block.position.y, block.position.z, 2), key);
  }
}

function updateLookAt(bot) {
  if (!bot.entity || !bot.lookAtTarget) return;

  const targetName = normalizePlayerName(bot, bot.lookAtTarget);
  const target = targetName ? bot.players[targetName]?.entity : null;
  if (!target) return;

  bot.lookAtTarget = targetName;
  const eyeY = target.position.y + Math.min(target.height || 1.62, 1.62);
  bot.lookAt(new Vec3(target.position.x, eyeY, target.position.z), true).catch(() => {});
}

function initializeBotState(bot) {
  bot.followTarget = null;
  bot.comingTo = null;
  bot.mineBlock = null;
  bot.digTarget = null;
  bot.lookAtTarget = null;
  bot._activeGoalKey = null;
  bot._followGoalTime = 0;
  bot._lastMineBlockKey = null;
  bot._lastPosition = bot.entity?.position?.clone() || null;
  bot._stuckTicks = 0;
  bot._lastRecoveryAt = 0;
  bot._lastWaterRecoveryAt = 0;
  bot._digRetries = 0;
  bot._lastPathSetAt = 0;
  bot._pathFailures = 0;
  bot.spamLinkInterval = null;
  bot.spamTextInterval = null;
  bot.spamMsgInterval = null;

  const mcData = require('minecraft-data')(bot.version);
  const moves = new Movements(bot, mcData);
  moves.canSwim = false;
  moves.allowParkour = true;
  moves.allowSprinting = true;

  // Let pathfinder break blocking terrain and build upward when needed.
  moves.canDig = true;
  moves.allow1by1towers = true;
  // mineflayer-pathfinder uses the historical `scafoldingBlocks` spelling.
  moves.scafoldingBlocks = [
    mcData.itemsByName.dirt?.id,
    mcData.itemsByName.cobblestone?.id,
  ].filter(Boolean);

  moves.blocksCantBreak.add(mcData.blocksByName.water.id);
  moves.blocksToAvoid.add(mcData.blocksByName.water.id);
  moves.blocksToAvoid.add(mcData.blocksByName.lava.id);
  bot.pathfinder.setMovements(moves);

  clearIntervalSafe(bot, 'followInterval');
  clearIntervalSafe(bot, 'comeInterval');
  clearIntervalSafe(bot, 'mineInterval');
  clearIntervalSafe(bot, 'lookInterval');
  clearIntervalSafe(bot, 'stuckInterval');
  if (bot._pathfinderPhysicsTick) {
    bot.removeListener('physicsTick', bot._pathfinderPhysicsTick);
    bot._pathfinderPhysicsTick = null;
  }

  bot.followInterval = setInterval(() => updateFollow(bot), FOLLOW_UPDATE_MS);
  bot.comeInterval = setInterval(() => updateCome(bot), COME_UPDATE_MS);
  bot.mineInterval = setInterval(() => updateMining(bot).catch(() => {}), MINE_UPDATE_MS);
  bot.lookInterval = setInterval(() => updateLookAt(bot), LOOK_UPDATE_MS);

  bot._pathfinderPhysicsTick = () => {
    if (!bot.entity || !bot.pathfinder.isMoving()) return;
    if (!bot.followTarget && !bot.comingTo) return;

    const target = bot.followTarget
      ? bot.players[bot.followTarget]?.entity
      : bot.players[bot.comingTo]?.entity;
    if (!target) return;

    if (bot._lastPosition) {
      const moved = bot.entity.position.distanceTo(bot._lastPosition);
      if (moved < 0.1) bot._stuckTicks += 1;
      else bot._stuckTicks = 0;
    }
    bot._lastPosition = bot.entity.position.clone();

    if (bot._stuckTicks > 60) {
      bot.pathfinder.setGoal(null);
      bot._stuckTicks = 0;

      try {
        bot.setControlState('jump', true);
      } catch (_) {}

      setTimeout(() => {
        try {
          bot.setControlState('jump', false);
        } catch (_) {}

        if (!bot.entity || !target.isValid) return;

        try {
          bot.pathfinder.setGoal(
            new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2),
            true
          );
        } catch (_) {}
      }, 500);
    }
  };

  bot.on('physicsTick', bot._pathfinderPhysicsTick);
}

function cleanupBot(bot) {
  clearIntervalSafe(bot, 'followInterval');
  clearIntervalSafe(bot, 'comeInterval');
  clearIntervalSafe(bot, 'mineInterval');
  clearIntervalSafe(bot, 'lookInterval');
  clearIntervalSafe(bot, 'stuckInterval');
  if (bot._pathfinderPhysicsTick) {
    bot.removeListener('physicsTick', bot._pathfinderPhysicsTick);
    bot._pathfinderPhysicsTick = null;
  }
  stopSpam(bot);
  try { bot.pathfinder.setGoal(null); } catch (_) {}
  try { bot.clearControlStates(); } catch (_) {}
}

function getReconnectDelay(botUsername) {
  const attempt = reconnectAttempts[botUsername] || 0;
  return Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, attempt - 1), RECONNECT_MAX_MS);
}

function scheduleReconnect(botUsername) {
  reconnectAttempts[botUsername] = (reconnectAttempts[botUsername] || 0) + 1;
  const delay = getReconnectDelay(botUsername);

  botStatus[botUsername] = 'reconnecting';
  logConsole(`${botUsername} reconnecting in ${Math.round(delay / 1000)}s (attempt ${reconnectAttempts[botUsername]})`);

  setTimeout(() => {
    if (botStatus[botUsername] === 'online' || botStatus[botUsername] === 'connecting') return;
    createBot(botUsername);
  }, delay);
}

function createAllBots() {
  botNames.forEach((name, index) => {
    setTimeout(() => createBot(name), index * 5000);
  });
}

function createBot(botUsername) {
  if (!botNames.includes(botUsername)) return;
  if (botStatus[botUsername] === 'connecting' || botStatus[botUsername] === 'online') return;

  const botConfig = { ...config, username: botUsername };
  let bot;
  let handledEnd = false;

  try {
    botStatus[botUsername] = 'connecting';
    logConsole(`${botUsername} connecting to ${config.host}:${config.port}...`);

    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    bots[botUsername] = bot;
    botPlaytime[botUsername] = botPlaytime[botUsername] || 0;

    bot.once('spawn', () => {
      botStatus[botUsername] = 'online';
      reconnectAttempts[botUsername] = 0;
      botJoinTime[botUsername] = Date.now();
      pickNewLeaderIfNeeded();

      logConsole(`${botUsername} joined!`);
      initializeBotState(bot);
    });

    bot.on('message', (jsonMsg) => {
      const msg = jsonMsg?.toString?.() ?? String(jsonMsg);
      logMc(msg);
    });

    bot.on('error', (error) => {
      logConsole(`${botUsername} error: ${error?.message || error}`);
    });

    bot.on('death', () => {
      logConsole(`${botUsername} died.`);
      try { bot.clearControlStates(); } catch (_) {}
    });

    bot.once('kicked', (reason) => {
      logConsole(`${botUsername} kicked: ${String(reason)}`);
    });

    bot.once('end', () => {
      if (handledEnd) return;
      handledEnd = true;
      if (bots[botUsername] !== bot) return;

      botPlaytime[botUsername] =
        (botPlaytime[botUsername] || 0) +
        (botJoinTime[botUsername] ? Date.now() - botJoinTime[botUsername] : 0);

      cleanupBot(bot);
      delete bots[botUsername];
      botStatus[botUsername] = 'offline';
      pickNewLeaderIfNeeded();
      logConsole(`${botUsername} disconnected.`);
      scheduleReconnect(botUsername);
    });

    bot.on('whisper', (username, message) => {
      if (myUsername.includes(username.toLowerCase())) {
        handleCommand(username, message);
      }
    });

    bot.on('chat', (username, message) => {
      if (bot.username !== commandLeaderUsername) return;
      if (username === bot.username) return;
      if (!message.startsWith('!')) return;
      if (!myUsername.includes(username.toLowerCase())) return;
      handleCommand(username, message);
    });
  } catch (error) {
    botStatus[botUsername] = 'error';
    logConsole(`${botUsername} failed to start: ${error?.stack || error?.message || error}`);
    if (bot && bots[botUsername] === bot) delete bots[botUsername];
    scheduleReconnect(botUsername);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function probeMinecraftServer() {
  if (mcProbeInFlight) return;
  mcProbeInFlight = true;
  mcServerState.status = 'checking';
  const started = Date.now();
  const socket = new net.Socket();
  let finished = false;

  const finish = (status, error = '') => {
    if (finished) return;
    finished = true;
    try { socket.destroy(); } catch (_) {}
    mcServerState.status = status;
    mcServerState.latency = status === 'online' ? Date.now() - started : null;
    mcServerState.lastChecked = Date.now();
    mcServerState.error = error || '';
    mcProbeInFlight = false;
  };

  socket.setTimeout(2500);
  socket.once('connect', () => finish('online'));
  socket.once('timeout', () => finish('offline', 'Connection timed out'));
  socket.once('error', (err) => finish('offline', err?.code || err?.message || 'Connection failed'));

  try {
    socket.connect(config.port, config.host);
  } catch (err) {
    finish('offline', err?.message || 'Connection failed');
  }
}

function startMinecraftProbe() {
  probeMinecraftServer();
  setInterval(probeMinecraftServer, 5000);
}

app.get('/api/status', (_req, res) => {
  const onlineCount = botNames.filter((name) => botStatus[name] === 'online').length;
  const uptime = fmtTime(Date.now() - (global.startTime || Date.now()));
  const botCards = botNames.map((name) => {
    const status = botStatus[name] || 'offline';
    const playtime = fmtTime(
      (botPlaytime[name] || 0) +
      (botJoinTime[name] && status === 'online' ? Date.now() - botJoinTime[name] : 0),
    );
    return {
      name,
      status,
      playtime,
      playtimeMs: (botPlaytime[name] || 0) + (botJoinTime[name] && status === 'online' ? Date.now() - botJoinTime[name] : 0),
    };
  });

  res.json({
    onlineCount,
    uptime,
    totalCommandsExecuted,
    serverNow: Date.now(),
    uptimeMs: Date.now() - (global.startTime || Date.now()),
    botCards,
    consoleLogs: consoleLogs.slice(-15),
    mcConsoleLogs: mcConsoleLogs.slice(-15),
    commandLeaderUsername,
    serverNow: Date.now(),
    mcServer: {
      status: mcServerState.status,
      latency: mcServerState.latency,
      lastChecked: mcServerState.lastChecked,
      error: mcServerState.error,
    },
  });
});

app.post('/api/botcommand', (req, res) => {
  const cmd = typeof req.body?.command === 'string' ? req.body.command : '';
  if (cmd) handleCommand(myUsername[0], cmd);
  res.redirect('/');
});

app.post('/api/mccommand', (req, res) => {
  const cmd = typeof req.body?.command === 'string' ? req.body.command : '';
  if (cmd) {
    Object.values(bots).forEach((bot) => {
      if (bot?.entity) {
        try { bot.chat(cmd); } catch (_) {}
      }
    });
  }
  res.redirect('/');
});

app.get('/', (_req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="theme-color" content="#0b1020">
  <title>CloudAFK Bot Army</title>
  <style>
    :root {
      --bg: #070b16;
      --panel: rgba(15, 23, 42, 0.78);
      --panel2: rgba(20, 30, 55, 0.82);
      --text: #eef4ff;
      --muted: #91a0ba;
      --line: rgba(148, 163, 184, 0.16);
      --accent: #7c5cff;
      --accent2: #23d5ab;
      --danger: #ff5c7a;
      --warn: #ffb44f;
      --shadow: 0 20px 50px rgba(0,0,0,.28);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      background:
        radial-gradient(circle at 20% 10%, rgba(124,92,255,.20), transparent 30%),
        radial-gradient(circle at 80% 0%, rgba(35,213,171,.12), transparent 28%),
        linear-gradient(180deg, #060916 0%, #0a1020 55%, #070b16 100%);
      padding: 18px;
    }
    .shell { max-width: 1280px; margin: 0 auto; }
    .topbar {
      display: flex; justify-content: space-between; align-items: center; gap: 18px;
      padding: 20px 22px; border: 1px solid var(--line); border-radius: 22px;
      background: linear-gradient(135deg, rgba(20,28,52,.9), rgba(11,17,33,.76));
      backdrop-filter: blur(16px); box-shadow: var(--shadow);
      position: sticky; top: 12px; z-index: 5;
    }
    .brand h1 { margin: 0; font-size: clamp(1.35rem, 3vw, 2rem); letter-spacing: -.03em; }
    .brand p { margin: 5px 0 0; color: var(--muted); font-size: .92rem; }
    .server-badge {
      display: inline-flex; align-items: center; gap: 10px; padding: 10px 14px;
      border-radius: 999px; border: 1px solid var(--line); background: rgba(8,14,28,.8);
      font-weight: 700; white-space: nowrap;
    }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 14px currentColor; }
    .dot.online { background: var(--accent2); color: var(--accent2); }
    .dot.offline { background: var(--danger); color: var(--danger); }
    .dot.checking { background: var(--warn); color: var(--warn); }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin: 18px 0; }
    .card {
      background: linear-gradient(160deg, var(--panel2), var(--panel));
      border: 1px solid var(--line); border-radius: 18px; padding: 18px;
      box-shadow: var(--shadow);
    }
    .stat h3 { margin: 0 0 8px; color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .09em; }
    .value { font-size: clamp(1.5rem, 3vw, 2.2rem); font-weight: 800; letter-spacing: -.04em; }
    .sub { margin-top: 6px; color: var(--muted); font-size: .82rem; }
    .section { margin: 16px 0; }
    .section-title { display:flex; justify-content:space-between; align-items:center; gap:12px; margin: 0 0 12px; }
    .section-title h2 { margin: 0; font-size: 1rem; }
    .section-title span { color: var(--muted); font-size: .8rem; }
    .bots { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px,1fr)); gap:14px; }
    .bot-card { position:relative; overflow:hidden; }
    .bot-card::after { content:""; position:absolute; inset:auto -30px -45px auto; width:110px; height:110px; border-radius:50%; background:rgba(124,92,255,.11); }
    .bot-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
    .bot-name { font-weight: 800; font-size: 1rem; }
    .pill { font-size:.72rem; padding:5px 8px; border-radius:999px; border:1px solid var(--line); text-transform:uppercase; font-weight:800; letter-spacing:.05em; }
    .pill.online { color:#7ff4d1; background:rgba(35,213,171,.09); }
    .pill.offline, .pill.error { color:#ff8ba2; background:rgba(255,92,122,.08); }
    .pill.connecting { color:#ffd18f; background:rgba(255,180,79,.08); }
    .playtime { margin-top:16px; font-size:1.35rem; font-weight:800; font-variant-numeric: tabular-nums; }
    .play-label { color:var(--muted); font-size:.75rem; margin-top:3px; }
    .panel { background:linear-gradient(160deg, var(--panel2), var(--panel)); border:1px solid var(--line); border-radius:18px; padding:16px; box-shadow:var(--shadow); }
    .command-ref { max-height:240px; overflow:auto; }
    .log { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.55; padding: 2px 0; white-space: pre-wrap; overflow-wrap:anywhere; }
    .log strong { color:#c8bbff; }
    .console { height:210px; overflow-y:auto; border-radius:14px; background:rgba(3,8,20,.78); padding:13px; border:1px solid rgba(148,163,184,.11); }
    .form-row { display:flex; gap:10px; margin-top:10px; }
    input {
      flex:1; min-width:0; padding:12px 14px; border-radius:12px; border:1px solid var(--line);
      background:rgba(7,12,25,.9); color:var(--text); outline:none; font-size:.92rem;
    }
    input:focus { border-color:rgba(124,92,255,.7); box-shadow:0 0 0 3px rgba(124,92,255,.12); }
    button {
      padding:12px 17px; border:none; border-radius:12px; cursor:pointer; color:white; font-weight:800;
      background:linear-gradient(135deg, var(--accent), #5b8cff); box-shadow:0 10px 25px rgba(92,92,255,.22);
    }
    button:hover { transform: translateY(-1px); }
    .footer { color:var(--muted); text-align:center; font-size:.75rem; padding:18px 0 6px; }
    @media (max-width: 900px) { .grid { grid-template-columns:repeat(2, minmax(0,1fr)); } .topbar { position:static; } }
    @media (max-width: 560px) { body { padding:10px; } .grid { grid-template-columns:1fr 1fr; gap:10px; } .topbar { padding:16px; flex-direction:column; align-items:flex-start; } .server-badge { width:100%; justify-content:center; } .form-row { flex-direction:column; } button { width:100%; } }
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand">
        <h1>CloudAFK Bot Army</h1>
        <p>Live control dashboard for your Minecraft bot fleet</p>
      </div>
      <div class="server-badge"><span id="mcDot" class="dot checking"></span><span id="mcStatus">Checking Minecraftâ€¦</span><span id="mcLatency">â€”</span></div>
    </header>

    <section class="grid">
      <div class="card stat"><h3>Bots online</h3><div class="value" id="onlineCount">0 / ${NUMBER_OF_BOTS}</div><div class="sub">Connected bot instances</div></div>
      <div class="card stat"><h3>Dashboard uptime</h3><div class="value" id="uptime">0s</div><div class="sub">This Node.js process</div></div>
      <div class="card stat"><h3>Commands</h3><div class="value" id="commandCount">0</div><div class="sub">Commands executed</div></div>
      <div class="card stat"><h3>MC server</h3><div class="value" id="mcStateText">Checking</div><div class="sub" id="mcChecked">Waiting for first checkâ€¦</div></div>
    </section>

    <section class="section">
      <div class="section-title"><h2>Bot fleet</h2><span>Playtime updates every second</span></div>
      <div class="bots" id="botCards"></div>
    </section>

    <section class="section panel command-ref">
      <div class="section-title"><h2>Command reference</h2><span>Existing commands preserved</span></div>
      ${COMMAND_REFERENCE.map((section) => `
        <div class="log"><strong>${section.group}</strong></div>
        ${section.lines.map((line) => `<div class="log">${line}</div>`).join('')}
      `).join('')}
    </section>

    <section class="section panel">
      <div class="section-title"><h2>Bot console</h2><span>Live logs</span></div>
      <div class="console" id="botConsole"></div>
      <form action="/api/botcommand" method="POST" class="form-row">
        <input type="text" name="command" placeholder="Bot commandâ€¦ !follow tcl all" required>
        <button type="submit">Send bot command</button>
      </form>
    </section>

    <section class="section panel">
      <div class="section-title"><h2>Minecraft console</h2><span>Send to connected bots</span></div>
      <div class="console" id="mcConsole"></div>
      <form action="/api/mccommand" method="POST" class="form-row">
        <input type="text" name="command" placeholder="MC commandâ€¦ /time set day" required>
        <button type="submit">Send MC command</button>
      </form>
    </section>

    <div class="footer">CloudAFK â€¢ ${config.host}:${config.port} â€¢ Minecraft ${config.version}</div>
  </div>

  <script>
    let latestStatus = null;

    function escapeHtml(value) {
      return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function fmtLive(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      return h > 0 ? h + 'h ' + m + 'm ' + s + 's' : (m > 0 ? m + 'm ' + s + 's' : s + 's');
    }

    function render(data) {
      latestStatus = data;
      document.getElementById('onlineCount').textContent = data.onlineCount + ' / ${NUMBER_OF_BOTS}';
      document.getElementById('uptime').textContent = data.uptime;
      document.getElementById('commandCount').textContent = data.totalCommandsExecuted;

      const mc = data.mcServer || { status: 'checking' };
      const dot = document.getElementById('mcDot');
      dot.className = 'dot ' + escapeHtml(mc.status);
      document.getElementById('mcStatus').textContent = mc.status === 'online' ? 'Minecraft OPEN' : (mc.status === 'offline' ? 'Minecraft OFFLINE' : 'Checking Minecraftâ€¦');
      document.getElementById('mcStateText').textContent = mc.status === 'online' ? 'OPEN' : (mc.status === 'offline' ? 'OFFLINE' : 'CHECKING');
      document.getElementById('mcLatency').textContent = mc.status === 'online' && Number.isFinite(mc.latency) ? mc.latency + ' ms' : '';
      document.getElementById('mcChecked').textContent = mc.lastChecked ? ('Last check: ' + new Date(mc.lastChecked).toLocaleTimeString()) : 'Waiting for first checkâ€¦';

      document.getElementById('botCards').innerHTML = data.botCards.map((bot) => {
        const live = bot.status === 'online';
        return '<div class="card bot-card">' +
          '<div class="bot-head"><div class="bot-name">' + escapeHtml(bot.name) + '</div><div class="pill ' + escapeHtml(bot.status) + '">' + escapeHtml(bot.status) + '</div></div>' +
          '<div class="playtime" data-playtime-name="' + escapeHtml(bot.name) + '">' + escapeHtml(bot.playtime) + '</div>' +
          '<div class="play-label">Total playtime' + (live ? ' â€¢ LIVE' : '') + '</div>' +
          '</div>';
      }).join('');

      document.getElementById('botConsole').innerHTML = (data.consoleLogs.map((log) => '<div class="log">' + escapeHtml(log) + '</div>').join('') || '<div class="log">No logs</div>');
      document.getElementById('mcConsole').innerHTML = (data.mcConsoleLogs.map((log) => '<div class="log">' + escapeHtml(log) + '</div>').join('') || '<div class="log">No messages</div>');
    }

    async function updateStatus() {
      try {
        const res = await fetch('/api/status', { cache: 'no-store' });
        render(await res.json());
      } catch (_) {}
    }

    updateStatus();
    setInterval(updateStatus, 3000);
    setInterval(() => {
      if (!latestStatus) return;
      const elapsed = Date.now() - Number(latestStatus.serverNow || Date.now());
      document.getElementById('uptime').textContent = fmtLive(Number(latestStatus.uptimeMs || 0) + elapsed);
      document.querySelectorAll('[data-playtime-name]').forEach((el) => {
        if (el.dataset.live !== '1') return;
        const base = Number(el.dataset.playtimeMs || 0);
        el.textContent = fmtLive(base + elapsed);
      });
    }, 1000);
  </script>
</body>
</html>
  `);
});

function fmtTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

process.on('uncaughtException', (error) => {
  logConsole(`UNCAUGHT EXCEPTION: ${error?.stack || error?.message || error}`);
});

process.on('unhandledRejection', (error) => {
  logConsole(`UNHANDLED REJECTION: ${error?.stack || error?.message || error}`);
});

http.listen(PORT, '0.0.0.0', () => {
  global.startTime = Date.now();
  startMinecraftProbe();
  logConsole(`Dashboard started on port ${PORT}`);
  logConsole(`Server target: ${config.host}:${config.port} (${config.version})`);
  logConsole(`Bots: ${botNames.join(', ')}`);
  createAllBots();
});
