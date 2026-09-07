const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = 'tcl';
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, freezeMode = false, textSpamInterval = null, autoBreakBlock = null, huntTarget = null, spamPrivateInterval = null, attackMobs = false;
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = 'offline';

app.use(express.json());
app.use(express.static('public'));

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);
  botStatus = 'connecting';

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    spawnTime = Date.now();
    botStatus = 'online';
    addConsoleLog('Bot joined the server!');
    addMCConsoleLog('Joined server');
    
    const mcData = require('minecraft-data')(bot.version);
    defaultMove = new Movements(bot, mcData);
    
    // IMPROVED MOVEMENT SETTINGS
    defaultMove.canDig = true;
    defaultMove.allow1by1towers = false;
    defaultMove.allowParkour = true;
    defaultMove.allowSprinting = true;
    defaultMove.maxDropDown = 4;
    defaultMove.scafoldingBlocks = [];
    defaultMove.placeCost = 100;
    defaultMove.breakCost = 100;
    defaultMove.entityCost = 100;
    defaultMove.blocksCantBreak = new Set();
    defaultMove.blocksToAvoid = new Set();
    defaultMove.liquidCost = 10;
    defaultMove.avoidDamage = true;
    defaultMove.allowFreeMotion = true;
    defaultMove.allowSprinting = true;
    defaultMove.allowEntityDetection = true;
    defaultMove.maxPortalAttempts = 10;
    
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.enablePathShortcuts = true;
    bot.pathfinder.thinkTimeout = 100;

    if (useAuthPlugin) {
      setTimeout(() => {
        bot.chat(`/register ${accountPassword} ${accountPassword}`);
        bot.chat(`/login ${accountPassword}`);
      }, 2000);
    }

    // Smooth Riding Loop
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

    // Auto Break Loop
    setInterval(() => {
      if (autoBreakBlock && !freezeMode) {
        const blockName = autoBreakBlock.toLowerCase();
        const blocks = bot.findBlocks({
          matching: (block) => block.name && block.name.toLowerCase().includes(blockName),
          maxDistance: 16,
          count: 1
        });
        
        if (blocks && blocks.length > 0) {
          const block = bot.blockAt(blocks[0]);
          if (block && bot.canDigBlock(block)) {
            bot.dig(block).catch(() => {});
          }
        }
      }
    }, 500);

    // Anti-AFK Jump Loop
    setInterval(() => {
      if (!freezeMode && !bot.pathfinder.isMoving() && !attachTarget && !wanderMode && !autoBreakBlock && !huntTarget) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }, 30000);

    // Protect Mode Loop
    setInterval(() => {
      if (!protectMode || freezeMode) return;
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
        bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
        if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
      }
    }, 1000);

    // Hunt Loop
    setInterval(() => {
      if (huntTarget && !freezeMode) {
        const target = bot.players[huntTarget]?.entity;
        if (target) {
          bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
          if (bot.entity.position.distanceTo(target.position) < 3) {
            bot.attack(target);
            bot.lookAt(target.position.offset(0, target.height, 0));
          }
        }
      }
    }, 500);

    // Attack Mode Loop
    setInterval(() => {
      if (freezeMode) return;
      const targetName = attackTarget || (attachType === 'player' ? attachTarget : null);
      if (!targetName) return;
      
      const target = bot.players[targetName]?.entity;
      if (!target) { 
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

    // Attack Mobs Loop
    setInterval(() => {
      if (attackMobs && !freezeMode) {
        const mob = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'monster' || e.type === 'hostile') && e !== bot.entity);
        if (mob && bot.entity.position.distanceTo(mob.position) < 16) {
          bot.pathfinder.setGoal(new goals.GoalFollow(mob, 2), true);
          if (bot.entity.position.distanceTo(mob.position) < 3) {
            bot.attack(mob);
          }
        }
      }
    }, 500);

    // Wander Loop
    setInterval(() => {
      if (!wanderMode || freezeMode || bot.pathfinder.isMoving()) return;
      const radius = wanderMode.radius || 10;
      const origin = wanderMode.origin;
      const dx = (Math.random() * 2 - 1) * radius;
      const dz = (Math.random() * 2 - 1) * radius;
      bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
    }, 8000);

    // Stuck Detector
    let lastPos = null;
    let stuckTicks = 0;
    
    setInterval(() => {
      if (freezeMode) { lastPos = null; stuckTicks = 0; return; }
      const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
      if (!hasGoal) { lastPos = null; stuckTicks = 0; return; }

      const pos = bot.entity.position;
      
      if (lastPos && pos.distanceTo(lastPos) < 0.3) {
        stuckTicks++;
        
        if (stuckTicks === 3) {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 500);
        } else if (stuckTicks === 6) {
          bot.setControlState('forward', true);
          setTimeout(() => bot.setControlState('forward', false), 1000);
        } else if (stuckTicks === 9) {
          bot.setControlState('back', true);
          bot.setControlState('jump', true);
          setTimeout(() => {
            bot.setControlState('back', false);
            bot.setControlState('jump', false);
          }, 800);
        } else if (stuckTicks >= 12) {
          const block = bot.blockAtCursor(5);
          if (block && bot.canDigBlock(block)) {
            bot.dig(block).catch(() => {});
          }
          bot.pathfinder.setGoal(null);
          setTimeout(() => {
            const currentPos = bot.entity.position;
            bot.pathfinder.setGoal(new goals.GoalNear(currentPos.x + 2, currentPos.y, currentPos.z + 2, 1));
          }, 500);
          stuckTicks = 0;
        }
      } else {
        stuckTicks = 0;
      }
      
      lastPos = pos.clone();
    }, 500);
  });

  bot.on('message', (jsonMsg) => {
    const msg = jsonMsg.toString();
    console.log('[MC]', msg);
    addMCConsoleLog(msg);
  });

  bot.on('error', (err) => {
    console.log('Error:', err);
    addConsoleLog('Error: ' + err.message);
    botStatus = 'error';
  });

  bot.on('end', () => {
    botStatus = 'offline';
    addConsoleLog('Bot disconnected, reconnecting...');
    setTimeout(createBot, 15000);
  });

  function addConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleLogs.push(log);
    if (consoleLogs.length > 100) consoleLogs.shift();
    io.emit('consoleLog', log);
  }

  function addMCConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    mcConsoleLogs.push(log);
    if (mcConsoleLogs.length > 100) mcConsoleLogs.shift();
    io.emit('mcConsoleLog', log);
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

  function showCmdList(username) {
    const lines = [
      "§8§m─────────────────────────────────────",
      "§6§l⚡ CLOUDAFK BOT v3.0 ⚡",
      "§8§m─────────────────────────────────────",
      "§7Owner: §f" + myUsername + " §8| §7Uptime: §f" + fmtTime(Date.now() - spawnTime),
      "",
      "§b§l📡 INFORMATION",
      "§8├─ §f!coords §8» §7Show bot location",
      "§8├─ §f!status §8» §7HP & food status",
      "§8├─ §f!info §8» §7Biome & ping",
      "§8├─ §f!inventory §8» §7List all items",
      "§8├─ §f!players §8» §7Online players",
      "§8├─ §f!time §8» §7Server time",
      "§8├─ §f!weather §8» §7Weather check",
      "§8├─ §f!nearbyplayers §8» §7Nearby players",
      "§8├─ §f!nearbymobs §8» §7Nearby mobs",
      "§8├─ §f!health [p] §8» §7Player health",
      "§8├─ §f!whereis [p] §8» §7Find player",
      "§8├─ §f!leakcoords [p] §8» §7Leak player coords",
      "§8└─ §f!exp !gamemode !uptime !tps",
      "",
      "§a§l🏃 MOVEMENT",
      "§8├─ §f!come §8» §7Bot comes to you",
      "§8├─ §f!follow [p] §8» §7Follow player",
      "§8├─ §f!goto x y z §8» §7Go to coords",
      "§8├─ §f!wander [r] §8» §7Wander around",
      "§8├─ §f!flee §8» §7Run from danger",
      "§8├─ §f!attachplayer [p] §8» §7Attach+attack",
      "§8├─ §f!attachmob §8» §7Attach to mob",
      "§8├─ §f!jump §8» §7Make bot jump",
      "§8├─ §f!stop §8» §7Stop everything",
      "§8├─ §f!freeze §8» §7Freeze/unfreeze",
      "§8├─ §f!tpbring §8» §7TP bot to you",
      "§8├─ §f!tp [player] §8» §7TP to player",
      "§8└─ §f!call §8» §7TP you to bot",
      "",
      "§c§l⚔️ COMBAT",
      "§8├─ §f!attack [p] §8» §7Attack player",
      "§8├─ §f!hunt [p] §8» §7Hunt player forever",
      "§8├─ §f!protect §8» §7Guard mode",
      "§8├─ §f!killbot §8» §7Kill the bot",
      "§8├─ §f!kick [p] §8» §7Kick player",
      "§8├─ §f!attackmobs §8» §7Attack nearby mobs",
      "§8├─ §f!crash [p] §8» §7Crash player",
      "§8├─ §f!tntrain [p] §8» §7TNT rain on player",
      "§8├─ §f!stopserver §8» §7Stop the server",
      "§8└─ §f!healthgen §8» §7Regen health",
      "",
      "§d§l🎭 ACTIONS",
      "§8├─ §f!talk [msg] §8» §7Send message",
      "§8├─ §f!shout [msg] §8» §7Shout message",
      "§8├─ §f!msg [p] [msg] §8» §7Private message",
      "§8├─ §f!textspam [msg] §8» §7Spam message",
      "§8├─ §f!spamprivmsg [p] [msg] §8» §7Spam private msg",
      "§8├─ §f!stoptextspam §8» §7Stop all spam",
      "§8├─ §f!click §8» §7Click entity",
      "§8├─ §f!sneak §8» §7Toggle sneak",
      "§8├─ §f!activate §8» §7Activate block",
      "§8├─ §f!lookat [p] §8» §7Look at player",
      "§8├─ §f!survival §8» §7Survival mode",
      "§8├─ §f!creative §8» §7Creative mode",
      "§8└─ §f!sleeptest §8» §7Try sleeping",
      "",
      "§e§l🏗️ BUILDING",
      "§8├─ §f!place [item] §8» §7Place block",
      "§8├─ §f!placeat x y z [item] §8» §7Place at coords",
      "§8├─ §f!fill [item] w h d §8» §7Fill area",
      "§8├─ §f!dig §8» §7Dig block",
      "§8├─ §f!break [block] §8» §7Auto-break blocks",
      "§8├─ §f!collect [block] [amt] §8» §7Collect blocks",
      "§8└─ §f!blockinfo §8» §7Block info",
      "",
      "§9§l🎒 INVENTORY",
      "§8├─ §f!drop §8» §7Drop held item",
      "§8├─ §f!dropall §8» §7Drop everything",
      "§8├─ §f!hand §8» §7Show held item",
      "§8├─ §f!equip [item] §8» §7Equip item",
      "§8└─ §f!armor §8» §7Auto-wear armor",
      "",
      "§5§l🎲 FUN",
      "§8├─ §f!echo [msg] §8» §7Echo message",
      "§8├─ §f!ping [p] §8» §7Check ping",
      "§8└─ §f!spin §8» §7Spin around",
      "",
      "§8§m─────────────────────────────────────",
      "§6§l✦ Type !cmdlist to see this menu ✦",
      "§8§m─────────────────────────────────────"
    ];
    
    lines.forEach((line, i) => {
      setTimeout(() => bot.whisper(username, line), i * 75);
    });
  }

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      bot.whisper(username, "§c⛔ Access denied.");
      return;
    }

    const msg = message.trim();
    const args = msg.split(' ');
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase();

    if (command === '!cmdlist' || command === '!help') {
      showCmdList(username);
      return;
    }

    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `📍 X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `❤️ HP:${bot.health}/20 | 🍗 Food:${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `🌍 Biome:${bot.blockAt(bot.entity.position)?.biome.name} | 📶 Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `🎒 Items: ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `👥 Online: ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `⏰ Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "🌧️ Raining/Snowing" : "☀️ Clear"); return; }
    if (command === '!jump') { 
      if (freezeMode) return bot.whisper(username, "❄️ Bot is frozen!");
      bot.setControlState('jump', true); 
      setTimeout(() => bot.setControlState('jump', false), 500); 
      bot.whisper(username, "✅ Jumped!"); 
      return; 
    }

    if (command === '!stop') {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      attachTarget = null; attachType = null;
      protectMode = false; attackTarget = null; wanderMode = false;
      autoBreakBlock = null; huntTarget = null; attackMobs = false;
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      bot.whisper(username, "🛑 Cleared all actions.");
      return;
    }

    if (command === '!tpbring') {
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "❌ Can't see you.");
      bot.entity.position = target.position.clone();
      bot.whisper(username, "✨ Teleported to you!");
      return;
    }

    if (command === '!tp') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "❌ Use: !tp [playername]");
      if (!bot.players[targetName]) return bot.whisper(username, `❌ Player ${targetName} not found or offline.`);
      const target = bot.players[targetName].entity;
      if (!target) return bot.whisper(username, `❌ Cannot see ${targetName} (out of render distance).`);
      bot.entity.position = target.position.clone();
      bot.whisper(username, `✨ Teleported to ${targetName}!`);
      return;
    }

    if (command === '!call') {
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "❌ Can't see you.");
      const botPos = bot.entity.position;
      bot.chat(`/tp ${username} ${Math.round(botPos.x)} ${Math.round(botPos.y)} ${Math.round(botPos.z)}`);
      bot.whisper(username, "📞 Attempting to teleport you to me!");
      return;
    }

    if (command === '!freeze') {
      if (args[1] === 'stop' || args[1] === 'off') {
        freezeMode = false;
        bot.whisper(username, "✅ Bot unfrozen.");
      } else {
        freezeMode = true;
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        bot.whisper(username, "❄️ Bot frozen in place!");
      }
      return;
    }

    if (command === '!killbot') {
      bot.chat('/kill');
      bot.whisper(username, "💀 Killing bot...");
      return;
    }

    if (command === '!healthgen') {
      bot.chat('/effect give ' + bot.username + ' minecraft:regeneration 10 5');
      bot.chat('/effect give ' + bot.username + ' minecraft:instant_health 1 5');
      bot.whisper(username, "💚 Regenerating health!");
      return;
    }

    if (command === '!kick') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "❌ Use: !kick [playername]");
      bot.chat(`/kick ${targetName}`);
      bot.whisper(username, `👢 Attempting to kick ${targetName}!`);
      return;
    }

    if (command === '!survival' || command === '!survial') {
      bot.chat('/gamemode survival');
      bot.whisper(username, "✅ Switched to Survival mode!");
      return;
    }

    if (command === '!creative') {
      bot.chat('/gamemode creative');
      bot.whisper(username, "✅ Switched to Creative mode!");
      return;
    }

    if (command === '!msg') {
      const targetName = args[1];
      const text = args.slice(2).join(' ');
      if (!targetName || !text) return bot.whisper(username, "❌ Use: !msg [playername] [message]");
      bot.whisper(targetName, text);
      bot.whisper(username, `✅ Message sent to ${targetName}`);
      return;
    }

    if (command === '!textspam') {
      const text = args.slice(1).join(' ');
      if (!text) {
        if (textSpamInterval) {
          clearInterval(textSpamInterval);
          textSpamInterval = null;
          bot.whisper(username, "🛑 Text spam stopped.");
        } else {
          return bot.whisper(username, "⚠️ Use: !textspam [message] - Spam message every 2 seconds");
        }
      } else {
        if (textSpamInterval) clearInterval(textSpamInterval);
        textSpamInterval = setInterval(() => {
          if (!freezeMode) {
            bot.chat(text);
          }
        }, 2000);
        bot.whisper(username, `📢 Spamming: "${text}" every 2 seconds. Use !stoptextspam to stop.`);
      }
      return;
    }

    if (command === '!spamprivmsg') {
      const targetName = args[1];
      const text = args.slice(2).join(' ');
      if (!targetName || !text) {
        if (spamPrivateInterval) {
          clearInterval(spamPrivateInterval);
          spamPrivateInterval = null;
          bot.whisper(username, "🛑 Private spam stopped.");
        } else {
          return bot.whisper(username, "❌ Use: !spamprivmsg [playername] [message]");
        }
      } else {
        if (spamPrivateInterval) clearInterval(spamPrivateInterval);
        spamPrivateInterval = setInterval(() => {
          if (!freezeMode) {
            bot.whisper(targetName, text);
          }
        }, 2000);
        bot.whisper(username, `📨 Spamming private messages to ${targetName} every 2 seconds. Use !spamprivmsg to stop.`);
      }
      return;
    }

    if (command === '!stoptextspam' || command === '!stopspam') {
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      bot.whisper(username, "🛑 All spam stopped.");
      return;
    }

    if (command === '!come') {
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null;
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "❌ Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      bot.whisper(username, "🏃 Coming!");
      return;
    }

    if (command === '!follow') {
      attachTarget = null; 
      attachType = null;
      attackTarget = null;
      huntTarget = null;
      
      const targetName = args[1] || username;
      
      if (!bot.players[targetName]) {
        return bot.whisper(username, `❌ Player ${targetName} not found or offline.`);
      }
      
      const target = bot.players[targetName].entity;
      if (!target) {
        return bot.whisper(username, `❌ Cannot see ${targetName} (out of render distance).`);
      }
      
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
      bot.whisper(username, `👣 Following ${targetName}`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return bot.whisper(username, "❌ Use: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null;
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      bot.whisper(username, `🧭 Heading to ${x}, ${y}, ${z}`);
      return;
    }

    if (command === '!wander') {
      if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "🛑 Wander off."); return; }
      const radius = parseInt(args[1]) || 10;
      wanderMode = { radius, origin: bot.entity.position.clone() };
      bot.whisper(username, `🚶 Wandering within ${radius} blocks.`);
      return;
    }

    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (!hostile) return bot.whisper(username, "❌ No hostiles nearby.");
      const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
      bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      bot.whisper(username, `🏃 Fleeing from ${hostile.name || 'mob'}!`);
      return;
    }

    if (command === '!attack') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attackTarget = null; 
        bot.pathfinder.setGoal(null); 
        bot.whisper(username, "🛑 Attack stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return bot.whisper(username, "❌ Player offline.");
      attackTarget = pTarget;
      huntTarget = null;
      bot.whisper(username, `⚔️ Attacking ${pTarget}!`);
      return;
    }

    if (command === '!hunt') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        huntTarget = null; 
        bot.pathfinder.setGoal(null); 
        bot.whisper(username, "🛑 Hunt stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return bot.whisper(username, "❌ Player offline.");
      huntTarget = pTarget;
      attackTarget = null;
      bot.whisper(username, `🎯 Hunting ${pTarget}! Will not stop until found!`);
      return;
    }

    if (command === '!attackmobs') {
      if (args[1] === 'stop') { attackMobs = false; bot.pathfinder.setGoal(null); bot.whisper(username, "🛑 Stopped attacking mobs."); return; }
      attackMobs = true;
      bot.whisper(username, "⚔️ Attacking nearby mobs!");
      return;
    }

    if (command === '!crash') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "❌ Use: !crash [playername]");
      bot.chat(`/effect give ${targetName} minecraft:levitation 100 255`);
      bot.chat(`/effect give ${targetName} minecraft:nausea 100 255`);
      bot.whisper(username, `💥 Attempting to crash ${targetName}!`);
      return;
    }

    if (command === '!tntrain') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "❌ Use: !tntrain [playername]");
      const target = bot.players[targetName]?.entity;
      if (!target) return bot.whisper(username, "❌ Player not found.");
      
      bot.whisper(username, `🧨 Raining TNT on ${targetName}!`);
      
      for (let i = 0; i < 20; i++) {
        setTimeout(() => {
          const pos = target.position.clone();
          pos.x += (Math.random() - 0.5) * 6;
          pos.z += (Math.random() - 0.5) * 6;
          pos.y += 10;
          bot.chat(`/summon tnt ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        }, i * 200);
      }
      return;
    }

    if (command === '!stopserver') {
      bot.chat('/stop');
      bot.whisper(username, "🛑 Attempting to stop server!");
      return;
    }

    if (command === '!leakcoords') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "❌ Use: !leakcoords [playername]");
      const target = bot.players[targetName]?.entity;
      if (!target) return bot.whisper(username, "❌ Player not found.");
      const p = target.position;
      bot.chat(`${targetName}'s coordinates: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      bot.whisper(username, `📍 Leaked ${targetName}'s coordinates in chat!`);
      return;
    }

    if (command === '!armor') {
      const armorItems = bot.inventory.items().filter(i => 
        i.name.includes('helmet') || 
        i.name.includes('chestplate') || 
        i.name.includes('leggings') || 
        i.name.includes('boots')
      );
      
      if (armorItems.length === 0) return bot.whisper(username, "❌ No armor in inventory.");
      
      bot.whisper(username, "🛡️ Equipping armor...");
      
      (async () => {
        for (const item of armorItems) {
          try {
            await bot.equip(item, 'torso');
            await bot.equip(item, 'legs');
            await bot.equip(item, 'feet');
            await bot.equip(item, 'head');
          } catch (e) {}
        }
        bot.whisper(username, "✅ Armor equipped!");
      })();
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "🛑 Protect mode off."); return; }
      protectMode = true;
      bot.whisper(username, "🛡️ Protect mode on - attacking nearby hostiles.");
      return;
    }

    if (command === '!lookat') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "❌ Player not found/offline.");
      bot.lookAt(target.position.offset(0, target.height, 0));
      bot.whisper(username, `👀 Looking at ${args[1] || username}`);
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "❌ Use: !talk [message]");
      bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "❌ Use: !shout [message]");
      bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (!target) return bot.whisper(username, "❌ Nothing in range.");
      bot.attack(target);
      bot.whisper(username, `👆 Clicked ${target.name || target.username || target.displayName || 'entity'}`);
      return;
    }

    if (command === '!sneak') {
      const state = args[1] !== 'stop';
      bot.setControlState('sneak', state);
      bot.whisper(username, state ? "🤫 Sneaking." : "🚶 Standing.");
      return;
    }

    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) { bot.activateBlock(block); bot.whisper(username, `✅ Activated block: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); bot.whisper(username, `✅ Activated entity: ${entity.name || entity.displayName || 'entity'}`); return; }
      bot.whisper(username, "❌ Nothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({ matching: (block) => block.name.includes('bed'), maxDistance: 16 });
      if (!bedBlock) return bot.whisper(username, "❌ No bed nearby.");
      bot.sleep(bedBlock).then(() => bot.whisper(username, "😴 Sleeping.")).catch(e => bot.whisper(username, `❌ Can't sleep: ${e.message}`));
      return;
    }

    if (command === '!attachplayer') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.pathfinder.setGoal(null);
        bot.whisper(username, "🛑 Detached and stopped attacking."); 
        return; 
      }
      
      if (!bot.players[pTarget]) {
        return bot.whisper(username, `❌ Player ${pTarget} not found or offline.`);
      }
      
      const targetEntity = bot.players[pTarget].entity;
      if (!targetEntity) {
        return bot.whisper(username, `❌ Cannot see ${pTarget} (out of render distance).`);
      }
      
      attachTarget = pTarget; 
      attachType = 'player'; 
      attackTarget = pTarget;
      bot.pathfinder.setGoal(null); 
      bot.whisper(username, `🔗 Attached to ${pTarget} and attacking!`); 
      return;
    }

    if (command === '!attachmob') {
      if (args[1] === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.whisper(username, "🛑 Detached."); 
        return; 
      }
      let closest = null, min = 999;
      for (const id in bot.entities) {
        const e = bot.entities[id];
        if (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') {
          const d = bot.entity.position.distanceTo(e.position);
          if (d < min) { min = d; closest = e; }
        }
      }
      if (!closest) return bot.whisper(username, "❌ No mobs nearby.");
      attachTarget = closest.id; 
      attachType = 'mob';
      attackTarget = null;
      bot.pathfinder.setGoal(null);
      bot.whisper(username, `🔗 Attached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "❌ Hand empty."); bot.tossStack(h); bot.whisper(username, "✅ Dropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return bot.whisper(username, "❌ Empty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); bot.whisper(username, "✅ Dropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `✋ Holding: ${i.name} x${i.count}` : "❌ Empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "❌ Use: !equip [item name]");
      const items = bot.inventory.items();
      const item = items.find(i => i.name.includes(itemName));
      if (!item) { bot.whisper(username, `❌ Item not found. You're holding: ${items.map(i => i.name).join(', ') || 'nothing'}`); return; }
      bot.equip(item, 'hand').then(() => bot.whisper(username, `✅ Equipped ${item.name}`)).catch(e => bot.whisper(username, `❌ Equip failed: ${e.message}`));
      return;
    }

    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "❌ Use: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "❌ Item not found in inventory.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return bot.whisper(username, "❌ No block in view to place against.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, bot.entity.position.offset(0, 1, 0).minus(refBlock.position).normalize()))
        .then(() => bot.whisper(username, `✅ Placed ${item.name}`))
        .catch(e => bot.whisper(username, `❌ Place failed: ${e.message}`));
      return;
    }

    if (command === '!placeat') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      const itemName = args.slice(4).join('_').toLowerCase();
      if ([x, y, z].some(isNaN) || !itemName) return bot.whisper(username, "❌ Use: !placeat [x] [y] [z] [item]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "❌ Item not found in inventory.");
      const refBlock = bot.blockAt({ x, y: y - 1, z });
      if (!refBlock) return bot.whisper(username, "❌ No reference block below target position.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => bot.whisper(username, `✅ Placed ${item.name} at ${x},${y},${z}`))
        .catch(e => bot.whisper(username, `❌ Place failed: ${e.message}`));
      return;
    }

    if (command === '!fill') {
      const itemName = args[1]?.toLowerCase();
      const w = parseInt(args[2]) || 1, h = parseInt(args[3]) || 1, d = parseInt(args[4]) || 1;
      if (!itemName) return bot.whisper(username, "❌ Use: !fill [item] [w] [h] [d]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "❌ Item not found in inventory.");
      bot.whisper(username, `✅ Filling ${w}x${h}x${d} with ${item.name}...`);
      const base = bot.entity.position.floored();
      (async () => {
        for (let yy = 0; yy < h; yy++) {
          for (let xx = 0; xx < w; xx++) {
            for (let zz = 0; zz < d; zz++) {
              const pos = base.offset(xx, yy, zz);
              const below = bot.blockAt(pos.offset(0, -1, 0));
              if (!below) continue;
              try {
                await bot.equip(item, 'hand');
                await bot.placeBlock(below, { x: 0, y: 1, z: 0 });
              } catch (e) {}
            }
          }
        }
        bot.whisper(username, "✅ Fill complete.");
      })();
      return;
    }

    if (command === '!dig') {
      const block = bot.blockAtCursor(10);
      if (!block || block.name === 'air') return bot.whisper(username, "❌ No block in view.");
      
      bot.whisper(username, `✅ Digging ${block.name}...`);
      
      bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      
      setTimeout(() => {
        bot.dig(block)
          .then(() => bot.whisper(username, `✅ Successfully dug ${block.name}`))
          .catch(e => {
            bot.whisper(username, `❌ Dig failed: ${e.message}. Trying to move closer...`);
            bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
            setTimeout(() => {
              const newBlock = bot.blockAt(block.position);
              if (newBlock && bot.canDigBlock(newBlock)) {
                bot.dig(newBlock)
                  .then(() => bot.whisper(username, `✅ Successfully dug ${newBlock.name}`))
                  .catch(err => bot.whisper(username, `❌ Failed to dig: ${err.message}`));
              }
            }, 2000);
          });
      }, 500);
      return;
    }

    if (command === '!break') {
      const blockName = args.slice(1).join('_').toLowerCase();
      
      if (!blockName || blockName === 'stop') {
        autoBreakBlock = null;
        bot.whisper(username, "🛑 Auto-break stopped.");
        return;
      }
      
      autoBreakBlock = blockName;
      bot.whisper(username, `✅ Auto-breaking all ${blockName} blocks within 16 blocks! Use !break stop to stop.`);
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return bot.whisper(username, "❌ Use: !collect [block name] [amount]");

      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount * 3 });
      if (!targets || targets.length === 0) return bot.whisper(username, "❌ None found nearby.");

      bot.whisper(username, `✅ Attempting to collect ${amount} ${blockName}...`);

      (async () => {
        let collected = 0;
        for (const pos of targets) {
          if (collected >= amount) break;
          const block = bot.blockAt(pos);
          if (!block || block.name === 'air') continue;

          try {
            await bot.pathfinder.goto(new goals.GoalGetToBlock(pos.x, pos.y, pos.z));

            const freshBlock = bot.blockAt(pos);
            if (!freshBlock || freshBlock.name === 'air') continue;

            if (!bot.canDigBlock(freshBlock)) continue;

            await bot.lookAt(freshBlock.position.offset(0.5, 0.5, 0.5), true);
            await bot.dig(freshBlock);
            collected++;
          } catch (e) {
            continue;
          }
        }
        bot.whisper(username, `✅ Collect finished. Got ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(5);
      bot.whisper(username, block ? `✅ Looking at: ${block.name}` : "❌ No block in view.");
      return;
    }

    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `✅ Nearby: ${list.join(', ')}` : "❌ No players in range.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || e.displayName || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `✅ Nearby mobs: ${list.join(', ')}` : "❌ No mobs in range.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "❌ Player not found/offline.");
      const hp = target.health !== undefined ? target.health : 'unknown (not visible to bot)';
      bot.whisper(username, `❤️ ${args[1] || username} HP: ${hp}`);
      return;
    }

    if (command === '!tps') { bot.whisper(username, "⚠️ TPS not exposed by this server (no plugin support detected)."); return; }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "❌ Player not found/offline (or out of render distance).");
      const p = target.position;
      bot.whisper(username, `📍 ${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { bot.whisper(username, `✨ XP Level: ${bot.experience.level} (${bot.experience.points} pts)`); return; }
    if (command === '!gamemode') { bot.whisper(username, `🎮 Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { bot.whisper(username, spawnTime ? `⏱️ Connected for: ${fmtTime(Date.now() - spawnTime)}` : "❌ Not spawned yet."); return; }

    if (command === '!echo') { bot.whisper(username, args.slice(1).join(' ') || "❌ (nothing to echo)"); return; }
    if (command === '!ping') {
      const pTarget = args[1];
      if (pTarget) {
        const p = bot.players[pTarget];
        if (!p) return bot.whisper(username, "❌ Player offline.");
        bot.whisper(username, `📶 ${pTarget} ping: ${p.ping}ms`);
      } else {
        bot.whisper(username, `📶 Bot ping: ${bot.player?.ping ?? 'unknown'}ms`);
      }
      return;
    }

    if (command === '!spin') {
      let yaw = bot.entity.yaw, turns = 0;
      const spinInterval = setInterval(() => {
        yaw += Math.PI / 4;
        bot.look(yaw, bot.entity.pitch, true);
        turns++;
        if (turns >= 8) clearInterval(spinInterval);
      }, 100);
      bot.whisper(username, "🔄 Spinning!");
      return;
    }
  }

  bot.on('whisper', (username, message) => {
    console.log(`[WHISPER] ${username}: ${message}`);
    handleCommand(username, message);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    console.log(`[CHAT] ${username}: ${message}`);
    if (message.startsWith('!')) handleCommand(username, message);
  });
}

// Website Dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot Dashboard</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: white;
        }
        .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { text-align: center; margin-bottom: 30px; font-size: 2.5em; }
        .status-bar {
          display: flex;
          justify-content: space-around;
          margin-bottom: 30px;
          flex-wrap: wrap;
          gap: 10px;
        }
        .status-card {
          background: rgba(255,255,255,0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 20px;
          text-align: center;
          min-width: 150px;
          flex: 1;
        }
        .status-card h3 { margin-bottom: 10px; font-size: 0.9em; opacity: 0.8; }
        .status-card .value { font-size: 1.5em; font-weight: bold; }
        .console-container {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-top: 20px;
        }
        .console-box {
          background: rgba(0,0,0,0.8);
          border-radius: 10px;
          padding: 15px;
          height: 400px;
          overflow-y: auto;
        }
        .console-box h2 {
          margin-bottom: 10px;
          color: #4CAF50;
          font-size: 1.2em;
        }
        .console-log {
          font-family: 'Courier New', monospace;
          font-size: 12px;
          padding: 3px 0;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .console-input {
          margin-top: 10px;
          display: flex;
          gap: 10px;
        }
        .console-input input {
          flex: 1;
          padding: 10px;
          border: none;
          border-radius: 5px;
          background: rgba(255,255,255,0.1);
          color: white;
        }
        .console-input button {
          padding: 10px 20px;
          background: #4CAF50;
          border: none;
          border-radius: 5px;
          color: white;
          cursor: pointer;
        }
        .players-list {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 15px;
          margin-top: 20px;
        }
        .players-list h2 { margin-bottom: 10px; }
        .player-item {
          display: inline-block;
          background: rgba(255,255,255,0.1);
          padding: 5px 15px;
          border-radius: 20px;
          margin: 5px;
        }
        @media (max-width: 768px) {
          .console-container { grid-template-columns: 1fr; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚡ CloudAFK Bot Dashboard ⚡</h1>
        
        <div class="status-bar">
          <div class="status-card">
            <h3>Bot Status</h3>
            <div class="value" id="botStatus">Offline</div>
          </div>
          <div class="status-card">
            <h3>Players Online</h3>
            <div class="value" id="playerCount">0</div>
          </div>
          <div class="status-card">
            <h3>Bot Health</h3>
            <div class="value" id="botHealth">-</div>
          </div>
          <div class="status-card">
            <h3>Bot Food</h3>
            <div class="value" id="botFood">-</div>
          </div>
          <div class="status-card">
            <h3>Ping</h3>
            <div class="value" id="botPing">-</div>
          </div>
          <div class="status-card">
            <h3>Uptime</h3>
            <div class="value" id="botUptime">-</div>
          </div>
        </div>

        <div class="console-container">
          <div>
            <div class="console-box" id="botConsole">
              <h2>Bot Console</h2>
            </div>
            <div class="console-input">
              <input type="text" id="consoleCommand" placeholder="Enter command...">
              <button onclick="sendCommand()">Send</button>
            </div>
          </div>
          <div>
            <div class="console-box" id="mcConsole">
              <h2>Minecraft Console</h2>
            </div>
          </div>
        </div>

        <div class="players-list">
          <h2>Online Players</h2>
          <div id="playersList">Loading...</div>
        </div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();
        
        socket.on('consoleLog', (log) => {
          const consoleBox = document.getElementById('botConsole');
          const logDiv = document.createElement('div');
          logDiv.className = 'console-log';
          logDiv.textContent = log;
          consoleBox.appendChild(logDiv);
          consoleBox.scrollTop = consoleBox.scrollHeight;
        });
        
        socket.on('mcConsoleLog', (log) => {
          const consoleBox = document.getElementById('mcConsole');
          const logDiv = document.createElement('div');
          logDiv.className = 'console-log';
          logDiv.textContent = log;
          consoleBox.appendChild(logDiv);
          consoleBox.scrollTop = consoleBox.scrollHeight;
        });
        
        function sendCommand() {
          const input = document.getElementById('consoleCommand');
          const cmd = input.value;
          if (cmd) {
            socket.emit('consoleCommand', cmd);
            input.value = '';
          }
        }
        
        // Update status every 5 seconds
        setInterval(() => {
          fetch('/api/status')
            .then(res => res.json())
            .then(data => {
              document.getElementById('botStatus').textContent = data.status;
              document.getElementById('playerCount').textContent = data.playerCount;
              document.getElementById('botHealth').textContent = data.health;
              document.getElementById('botFood').textContent = data.food;
              document.getElementById('botPing').textContent = data.ping + 'ms';
              document.getElementById('botUptime').textContent = data.uptime;
              document.getElementById('playersList').innerHTML = data.players.map(p => 
                '<span class="player-item">' + p + '</span>'
              ).join('');
            });
        }, 5000);
      </script>
    </body>
    </html>
  `);
});

// API endpoints
app.get('/api/status', (req, res) => {
  const data = {
    status: botStatus,
    playerCount: bot ? Object.keys(bot.players).length : 0,
    health: bot ? bot.health : 0,
    food: bot ? bot.food : 0,
    ping: bot && bot.player ? bot.player.ping : 0,
    uptime: spawnTime ? fmtTime(Date.now() - spawnTime) : '0h 0m 0s',
    players: bot ? Object.keys(bot.players) : []
  };
  res.json(data);
});

app.post('/api/command', (req, res) => {
  const cmd = req.body.command;
  if (cmd && bot) {
    bot.chat(cmd);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

io.on('connection', (socket) => {
  socket.on('consoleCommand', (cmd) => {
    if (bot) {
      bot.chat(cmd);
      addConsoleLog('Command sent: ' + cmd);
    }
  });
});

createBot();

http.listen(process.env.PORT || 3000, () => {
  console.log('Server started on port ' + (process.env.PORT || 3000));
});
