const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = 'tcl';
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, freezeMode = false, textSpamInterval = null, autoBreakBlock = null, huntTarget = null, spamPrivateInterval = null, attackMobs = false;
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = 'offline';

app.use(express.json());

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
    defaultMove.canDig = true;
    defaultMove.allow1by1towers = false;
    defaultMove.allowParkour = true;
    defaultMove.allowSprinting = true;
    defaultMove.maxDropDown = 4;
    defaultMove.liquidCost = 10;
    defaultMove.avoidDamage = true;
    defaultMove.allowFreeMotion = true;
    defaultMove.allowEntityDetection = true;
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
      if (!freezeMode && !bot.pathfinder.isMoving() && !attachTarget && !wanderMode && !autoBreakBlock && !huntTarget && !attackMobs) {
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
            bot.lookAt(mob.position.offset(0, mob.height, 0));
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

  bot.on('end', (reason) => {
    console.log('Bot disconnected:', reason);
    botStatus = 'offline';
    addConsoleLog('Bot disconnected: ' + reason);
    setTimeout(createBot, 15000);
  });

  bot.on('kicked', (reason) => {
    console.log('Bot kicked:', reason);
    addConsoleLog('Bot kicked: ' + reason);
  });

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

  function findPlayerOrArg(username, args) {
    const target = args[1];
    if (target && bot.players[target] && bot.players[target].entity) {
      return bot.players[target].entity;
    }
    if (bot.players[username] && bot.players[username].entity) {
      return bot.players[username].entity;
    }
    return null;
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  function safeWhisper(target, text) {
    try {
      bot.whisper(target, text);
    } catch (e) {
      console.log('Whisper error:', e.message);
    }
  }

  function showCmdList(username) {
    const lines = [
      "=== CLOUDAFK BOT v3.0 ===",
      "Owner: " + myUsername + " | Uptime: " + fmtTime(Date.now() - spawnTime),
      "",
      "INFO COMMANDS:",
      "!coords - Show bot location",
      "!status - HP & food status",
      "!info - Biome & ping",
      "!inventory - List all items",
      "!players - Online players",
      "!time - Server time",
      "!weather - Weather check",
      "!nearbyplayers - Nearby players",
      "!nearbymobs - Nearby mobs",
      "!health [p] - Player health",
      "!whereis [p] - Find player",
      "!leakcoords [p] - Leak player coords",
      "!exp !gamemode !uptime !tps",
      "",
      "MOVEMENT COMMANDS:",
      "!come - Bot comes to you",
      "!follow [p] - Follow player",
      "!goto x y z - Go to coords",
      "!wander [r] - Wander around",
      "!flee - Run from danger",
      "!attachplayer [p] - Attach+attack",
      "!attachmob - Attach to mob",
      "!jump - Make bot jump",
      "!stop - Stop everything",
      "!freeze - Freeze/unfreeze",
      "!tpbring - TP bot to you",
      "!tp [player] - TP to player",
      "!call - TP you to bot",
      "!skydrivebot - Make bot fly to sky",
      "!skydriveplayers - Make players fly to sky",
      "",
      "COMBAT COMMANDS:",
      "!attack [p] - Attack player",
      "!hunt [p] - Hunt player forever",
      "!protect - Guard mode",
      "!killbot - Kill the bot",
      "!kick [p] - Kick player",
      "!attackmobs - Attack nearby mobs",
      "!crash [p] - Crash player",
      "!tntrain [p] - TNT rain on player",
      "!stopserver - Stop the server",
      "!healthgen - Regen health",
      "",
      "ACTION COMMANDS:",
      "!talk [msg] - Send message",
      "!shout [msg] - Shout message",
      "!msg [p] [msg] - Private message",
      "!textspam [msg] - Spam message",
      "!spamprivmsg [p] [msg] - Spam private msg",
      "!stoptextspam - Stop all spam",
      "!click - Click entity",
      "!sneak - Toggle sneak",
      "!activate - Activate block",
      "!lookat [p] - Look at player",
      "!survival - Survival mode",
      "!creative - Creative mode",
      "!sleeptest - Try sleeping",
      "",
      "BUILDING COMMANDS:",
      "!place [item] - Place block",
      "!placeat x y z [item] - Place at coords",
      "!fill [item] w h d - Fill area",
      "!dig - Dig block",
      "!break [block] - Auto-break blocks",
      "!collect [block] [amt] - Collect blocks",
      "!blockinfo - Block info",
      "",
      "INVENTORY COMMANDS:",
      "!drop - Drop held item",
      "!dropall - Drop everything",
      "!hand - Show held item",
      "!equip [item] - Equip item",
      "!armor - Auto-wear armor",
      "",
      "FUN COMMANDS:",
      "!echo [msg] - Echo message",
      "!ping [p] - Check ping",
      "!spin - Spin around",
      "",
      "Type !cmdlist to see this menu"
    ];
    
    lines.forEach((line, i) => {
      setTimeout(() => {
        safeWhisper(username, line);
      }, i * 75);
    });
  }

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      safeWhisper(username, "Access denied.");
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

    if (command === '!coords') { const p = bot.entity.position; safeWhisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { safeWhisper(username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
    if (command === '!info') { safeWhisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); safeWhisper(username, items ? `Items: ${items}` : "Empty"); return; }
    if (command === '!players') { safeWhisper(username, `Online: ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { safeWhisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { safeWhisper(username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
    if (command === '!jump') { 
      if (freezeMode) return safeWhisper(username, "Bot is frozen!");
      bot.setControlState('jump', true); 
      setTimeout(() => bot.setControlState('jump', false), 500); 
      safeWhisper(username, "Jumped!"); 
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
      safeWhisper(username, "Cleared all actions.");
      return;
    }

    if (command === '!tpbring') {
      const player = bot.players[username];
      
      if (!player) {
        return safeWhisper(username, "Cannot find you in player list.");
      }
      
      if (player.entity && player.entity.position) {
        bot.entity.position = player.entity.position.clone();
        safeWhisper(username, "Teleported bot to you!");
        return;
      }
      
      bot.chat(`/tp ${bot.username} ${username}`);
      safeWhisper(username, "Attempting to teleport bot to you...");
      return;
    }

    if (command === '!tp') {
      const targetName = args[1];
      if (!targetName) return safeWhisper(username, "Use: !tp [playername]");
      
      const player = bot.players[targetName];
      if (!player) return safeWhisper(username, `Player ${targetName} not found or offline.`);
      
      if (player.entity && player.entity.position) {
        bot.entity.position = player.entity.position.clone();
        safeWhisper(username, `Teleported to ${targetName}!`);
      } else {
        bot.chat(`/tp ${bot.username} ${targetName}`);
        safeWhisper(username, `Attempting to teleport to ${targetName}...`);
      }
      return;
    }

    if (command === '!call') {
      const botPos = bot.entity.position;
      bot.chat(`/tp ${username} ${Math.round(botPos.x)} ${Math.round(botPos.y)} ${Math.round(botPos.z)}`);
      safeWhisper(username, "Attempting to teleport you to me!");
      return;
    }

    if (command === '!freeze') {
      if (args[1] === 'stop' || args[1] === 'off') {
        freezeMode = false;
        safeWhisper(username, "Bot unfrozen.");
      } else {
        freezeMode = true;
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        safeWhisper(username, "Bot frozen in place!");
      }
      return;
    }

    // KILLBOT
    if (command === '!killbot') {
      bot.chat('/kill');
      safeWhisper(username, "Killing bot...");
      return;
    }

    // SKYDRIVEBOT - Makes bot fly to sky
    if (command === '!skydrivebot') {
      bot.chat('/effect give ' + bot.username + ' minecraft:levitation 30 50');
      safeWhisper(username, "Bot is flying to the sky!");
      return;
    }

    // SKYDRIVEPLAYERS - Makes all players fly to sky
    if (command === '!skydriveplayers') {
      const targetName = args[1];
      if (targetName) {
        bot.chat('/effect give ' + targetName + ' minecraft:levitation 30 50');
        safeWhisper(username, `${targetName} is flying to the sky!`);
      } else {
        Object.keys(bot.players).forEach(playerName => {
          if (playerName !== bot.username) {
            bot.chat('/effect give ' + playerName + ' minecraft:levitation 30 50');
          }
        });
        safeWhisper(username, "All players are flying to the sky!");
      }
      return;
    }

    if (command === '!healthgen') {
      bot.chat('/effect give ' + bot.username + ' minecraft:regeneration 10 5');
      bot.chat('/effect give ' + bot.username + ' minecraft:instant_health 1 5');
      safeWhisper(username, "Regenerating health!");
      return;
    }

    if (command === '!kick') {
      const targetName = args[1];
      if (!targetName) return safeWhisper(username, "Use: !kick [playername]");
      bot.chat(`/kick ${targetName}`);
      safeWhisper(username, `Attempting to kick ${targetName}!`);
      return;
    }

    if (command === '!survival' || command === '!survial') {
      bot.chat('/gamemode survival');
      safeWhisper(username, "Switched to Survival mode!");
      return;
    }

    if (command === '!creative') {
      bot.chat('/gamemode creative');
      safeWhisper(username, "Switched to Creative mode!");
      return;
    }

    if (command === '!msg') {
      const targetName = args[1];
      const text = args.slice(2).join(' ');
      if (!targetName || !text) return safeWhisper(username, "Use: !msg [playername] [message]");
      safeWhisper(targetName, text);
      safeWhisper(username, `Message sent to ${targetName}`);
      return;
    }

    if (command === '!textspam') {
      const text = args.slice(1).join(' ');
      if (!text) {
        if (textSpamInterval) {
          clearInterval(textSpamInterval);
          textSpamInterval = null;
          safeWhisper(username, "Text spam stopped.");
        } else {
          return safeWhisper(username, "Use: !textspam [message] - Spam message every 2 seconds");
        }
      } else {
        if (textSpamInterval) clearInterval(textSpamInterval);
        textSpamInterval = setInterval(() => {
          if (!freezeMode) {
            bot.chat(text);
          }
        }, 2000);
        safeWhisper(username, `Spamming: "${text}" every 2 seconds. Use !stoptextspam to stop.`);
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
          safeWhisper(username, "Private spam stopped.");
        } else {
          return safeWhisper(username, "Use: !spamprivmsg [playername] [message]");
        }
      } else {
        if (spamPrivateInterval) clearInterval(spamPrivateInterval);
        spamPrivateInterval = setInterval(() => {
          if (!freezeMode) {
            safeWhisper(targetName, text);
          }
        }, 2000);
        safeWhisper(username, `Spamming private messages to ${targetName} every 2 seconds. Use !spamprivmsg to stop.`);
      }
      return;
    }

    if (command === '!stoptextspam' || command === '!stopspam') {
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      safeWhisper(username, "All spam stopped.");
      return;
    }

    if (command === '!come') {
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null;
      const target = bot.players[username]?.entity;
      if (!target) return safeWhisper(username, "Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      safeWhisper(username, "Coming!");
      return;
    }

    if (command === '!follow') {
      attachTarget = null; 
      attachType = null;
      attackTarget = null;
      huntTarget = null;
      
      const targetName = args[1] || username;
      
      if (!bot.players[targetName]) {
        return safeWhisper(username, `Player ${targetName} not found or offline.`);
      }
      
      const target = bot.players[targetName].entity;
      if (!target) {
        return safeWhisper(username, `Cannot see ${targetName} (out of render distance).`);
      }
      
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
      safeWhisper(username, `Following ${targetName}`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return safeWhisper(username, "Use: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null;
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      safeWhisper(username, `Heading to ${x}, ${y}, ${z}`);
      return;
    }

    if (command === '!wander') {
      if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); safeWhisper(username, "Wander off."); return; }
      const radius = parseInt(args[1]) || 10;
      wanderMode = { radius, origin: bot.entity.position.clone() };
      safeWhisper(username, `Wandering within ${radius} blocks.`);
      return;
    }

    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (!hostile) return safeWhisper(username, "No hostiles nearby.");
      const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
      bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      safeWhisper(username, `Fleeing from ${hostile.name || 'mob'}!`);
      return;
    }

    if (command === '!attack') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attackTarget = null; 
        bot.pathfinder.setGoal(null); 
        safeWhisper(username, "Attack stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return safeWhisper(username, "Player offline.");
      attackTarget = pTarget;
      huntTarget = null;
      safeWhisper(username, `Attacking ${pTarget}!`);
      return;
    }

    if (command === '!hunt') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        huntTarget = null; 
        bot.pathfinder.setGoal(null); 
        safeWhisper(username, "Hunt stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return safeWhisper(username, "Player offline.");
      huntTarget = pTarget;
      attackTarget = null;
      safeWhisper(username, `Hunting ${pTarget}! Will not stop until found!`);
      return;
    }

    if (command === '!attackmobs') {
      if (args[1] === 'stop') { attackMobs = false; bot.pathfinder.setGoal(null); safeWhisper(username, "Stopped attacking mobs."); return; }
      attackMobs = true;
      safeWhisper(username, "Attacking nearby mobs!");
      return;
    }

    if (command === '!crash') {
      const targetName = args[1];
      if (!targetName) return safeWhisper(username, "Use: !crash [playername]");
      bot.chat(`/effect give ${targetName} minecraft:levitation 100 255`);
      bot.chat(`/effect give ${targetName} minecraft:nausea 100 255`);
      safeWhisper(username, `Attempting to crash ${targetName}!`);
      return;
    }

    if (command === '!tntrain') {
      const targetName = args[1];
      if (!targetName) return safeWhisper(username, "Use: !tntrain [playername]");
      const target = bot.players[targetName]?.entity;
      if (!target) return safeWhisper(username, "Player not found.");
      
      safeWhisper(username, `Raining TNT on ${targetName}!`);
      
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
      safeWhisper(username, "Attempting to stop server!");
      return;
    }

    if (command === '!leakcoords') {
      const targetName = args[1];
      if (!targetName) return safeWhisper(username, "Use: !leakcoords [playername]");
      const target = bot.players[targetName]?.entity;
      if (!target) return safeWhisper(username, "Player not found.");
      const p = target.position;
      bot.chat(`${targetName}'s coordinates: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      safeWhisper(username, `Leaked ${targetName}'s coordinates in chat!`);
      return;
    }

    if (command === '!armor') {
      const armorItems = bot.inventory.items().filter(i => 
        i.name.includes('helmet') || 
        i.name.includes('chestplate') || 
        i.name.includes('leggings') || 
        i.name.includes('boots')
      );
      
      if (armorItems.length === 0) return safeWhisper(username, "No armor in inventory.");
      
      safeWhisper(username, "Equipping armor...");
      
      (async () => {
        for (const item of armorItems) {
          try {
            if (item.name.includes('helmet')) await bot.equip(item, 'head');
            if (item.name.includes('chestplate')) await bot.equip(item, 'torso');
            if (item.name.includes('leggings')) await bot.equip(item, 'legs');
            if (item.name.includes('boots')) await bot.equip(item, 'feet');
          } catch (e) {}
        }
        safeWhisper(username, "Armor equipped!");
      })();
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); safeWhisper(username, "Protect mode off."); return; }
      protectMode = true;
      safeWhisper(username, "Protect mode on - attacking nearby hostiles.");
      return;
    }

    if (command === '!lookat') {
      const targetName = args[1] || username;
      const player = bot.players[targetName];
      
      if (!player) {
        return safeWhisper(username, `Player ${targetName} not found or offline.`);
      }
      
      const target = player.entity;
      if (!target) {
        return safeWhisper(username, `Cannot see ${targetName} (out of render distance).`);
      }
      
      try {
        bot.lookAt(target.position.offset(0, target.height, 0), true);
        safeWhisper(username, `Looking at ${targetName}`);
      } catch (e) {
        safeWhisper(username, `Failed to look at ${targetName}: ${e.message}`);
      }
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (!text) return safeWhisper(username, "Use: !talk [message]");
      bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (!text) return safeWhisper(username, "Use: !shout [message]");
      bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (!target) return safeWhisper(username, "Nothing in range.");
      bot.attack(target);
      safeWhisper(username, `Clicked ${target.name || target.username || target.displayName || 'entity'}`);
      return;
    }

    if (command === '!sneak') {
      const state = args[1] !== 'stop';
      bot.setControlState('sneak', state);
      safeWhisper(username, state ? "Sneaking." : "Standing.");
      return;
    }

    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) { bot.activateBlock(block); safeWhisper(username, `Activated block: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); safeWhisper(username, `Activated entity: ${entity.name || entity.displayName || 'entity'}`); return; }
      safeWhisper(username, "Nothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({ matching: (block) => block.name.includes('bed'), maxDistance: 16 });
      if (!bedBlock) return safeWhisper(username, "No bed nearby.");
      bot.sleep(bedBlock).then(() => safeWhisper(username, "Sleeping.")).catch(e => safeWhisper(username, `Can't sleep: ${e.message}`));
      return;
    }

    if (command === '!attachplayer') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.pathfinder.setGoal(null);
        safeWhisper(username, "Detached and stopped attacking."); 
        return; 
      }
      
      if (!bot.players[pTarget]) {
        return safeWhisper(username, `Player ${pTarget} not found or offline.`);
      }
      
      const targetEntity = bot.players[pTarget].entity;
      if (!targetEntity) {
        return safeWhisper(username, `Cannot see ${pTarget} (out of render distance).`);
      }
      
      attachTarget = pTarget; 
      attachType = 'player'; 
      attackTarget = pTarget;
      bot.pathfinder.setGoal(null); 
      safeWhisper(username, `Attached to ${pTarget} and attacking!`); 
      return;
    }

    if (command === '!attachmob') {
      if (args[1] === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        safeWhisper(username, "Detached."); 
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
      if (!closest) return safeWhisper(username, "No mobs nearby.");
      attachTarget = closest.id; 
      attachType = 'mob';
      attackTarget = null;
      bot.pathfinder.setGoal(null);
      safeWhisper(username, `Attached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return safeWhisper(username, "Hand empty."); bot.tossStack(h); safeWhisper(username, "Dropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return safeWhisper(username, "Empty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); safeWhisper(username, "Dropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; safeWhisper(username, i ? `Holding: ${i.name} x${i.count}` : "Empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return safeWhisper(username, "Use: !equip [item name]");
      const items = bot.inventory.items();
      const item = items.find(i => i.name.includes(itemName));
      if (!item) { safeWhisper(username, `Item not found. You're holding: ${items.map(i => i.name).join(', ') || 'nothing'}`); return; }
      bot.equip(item, 'hand').then(() => safeWhisper(username, `Equipped ${item.name}`)).catch(e => safeWhisper(username, `Equip failed: ${e.message}`));
      return;
    }

    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return safeWhisper(username, "Use: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return safeWhisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return safeWhisper(username, "No block in view to place against.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, bot.entity.position.offset(0, 1, 0).minus(refBlock.position).normalize()))
        .then(() => safeWhisper(username, `Placed ${item.name}`))
        .catch(e => safeWhisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!placeat') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      const itemName = args.slice(4).join('_').toLowerCase();
      if ([x, y, z].some(isNaN) || !itemName) return safeWhisper(username, "Use: !placeat [x] [y] [z] [item]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return safeWhisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAt({ x, y: y - 1, z });
      if (!refBlock) return safeWhisper(username, "No reference block below target position.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => safeWhisper(username, `Placed ${item.name} at ${x},${y},${z}`))
        .catch(e => safeWhisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!fill') {
      const itemName = args[1]?.toLowerCase();
      const w = parseInt(args[2]) || 1, h = parseInt(args[3]) || 1, d = parseInt(args[4]) || 1;
      if (!itemName) return safeWhisper(username, "Use: !fill [item] [w] [h] [d]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return safeWhisper(username, "Item not found in inventory.");
      safeWhisper(username, `Filling ${w}x${h}x${d} with ${item.name}...`);
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
        safeWhisper(username, "Fill complete.");
      })();
      return;
    }

    if (command === '!dig') {
      const block = bot.blockAtCursor(10);
      if (!block || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') {
        return safeWhisper(username, "No block in view. Look at a block and try again.");
      }
      
      safeWhisper(username, `Digging ${block.name}...`);
      
      bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      
      setTimeout(() => {
        bot.dig(block)
          .then(() => safeWhisper(username, `Successfully dug ${block.name}`))
          .catch(e => {
            safeWhisper(username, `Dig failed: ${e.message}. Trying to move closer...`);
            bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
            setTimeout(() => {
              const newBlock = bot.blockAt(block.position);
              if (newBlock && bot.canDigBlock(newBlock)) {
                bot.dig(newBlock)
                  .then(() => safeWhisper(username, `Successfully dug ${newBlock.name}`))
                  .catch(err => safeWhisper(username, `Failed to dig: ${err.message}`));
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
        safeWhisper(username, "Auto-break stopped.");
        return;
      }
      
      autoBreakBlock = blockName;
      safeWhisper(username, `Auto-breaking all ${blockName} blocks within 16 blocks! Use !break stop to stop.`);
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return safeWhisper(username, "Use: !collect [block name] [amount]");

      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount * 3 });
      if (!targets || targets.length === 0) return safeWhisper(username, "None found nearby.");

      safeWhisper(username, `Attempting to collect ${amount} ${blockName}...`);

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
        safeWhisper(username, `Collect finished. Got ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(5);
      safeWhisper(username, block ? `Looking at: ${block.name}` : "No block in view.");
      return;
    }

    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      safeWhisper(username, list.length ? `Nearby: ${list.join(', ')}` : "No players in range.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || e.displayName || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      safeWhisper(username, list.length ? `Nearby mobs: ${list.join(', ')}` : "No mobs in range.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return safeWhisper(username, "Player not found/offline.");
      const hp = target.health !== undefined ? target.health : 'unknown (not visible to bot)';
      safeWhisper(username, `${args[1] || username} HP: ${hp}`);
      return;
    }

    if (command === '!tps') { safeWhisper(username, "TPS not exposed by this server (no plugin support detected)."); return; }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return safeWhisper(username, "Player not found/offline (or out of render distance).");
      const p = target.position;
      safeWhisper(username, `${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { safeWhisper(username, `XP Level: ${bot.experience.level} (${bot.experience.points} pts)`); return; }
    if (command === '!gamemode') { safeWhisper(username, `Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { safeWhisper(username, spawnTime ? `Connected for: ${fmtTime(Date.now() - spawnTime)}` : "Not spawned yet."); return; }

    if (command === '!echo') { safeWhisper(username, args.slice(1).join(' ') || "(nothing to echo)"); return; }
    if (command === '!ping') {
      const pTarget = args[1];
      if (pTarget) {
        const p = bot.players[pTarget];
        if (!p) return safeWhisper(username, "Player offline.");
        safeWhisper(username, `${pTarget} ping: ${p.ping}ms`);
      } else {
        safeWhisper(username, `Bot ping: ${bot.player?.ping ?? 'unknown'}ms`);
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
      safeWhisper(username, "Spinning!");
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

// Fixed website dashboard
app.get('/', (req, res) => {
  const playerCount = bot ? Object.keys(bot.players).length : 0;
  const health = bot ? bot.health : 0;
  const food = bot ? bot.food : 0;
  const ping = bot && bot.player ? bot.player.ping : 0;
  const uptime = spawnTime ? fmtTime(Date.now() - spawnTime) : '0h 0m 0s';
  const players = bot ? Object.keys(bot.players).join(', ') : 'None';
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot Dashboard</title>
      <meta http-equiv="refresh" content="5">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; margin-bottom: 30px; }
        .status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin-bottom: 30px; }
        .card { background: rgba(255,255,255,0.1); border-radius: 15px; padding: 20px; text-align: center; }
        .card h3 { font-size: 0.9em; opacity: 0.8; margin-bottom: 10px; }
        .card .value { font-size: 1.5em; font-weight: bold; }
        .console { background: rgba(0,0,0,0.8); border-radius: 10px; padding: 15px; height: 300px; overflow-y: auto; margin-bottom: 20px; }
        .console h2 { color: #4CAF50; margin-bottom: 10px; }
        .log { font-family: 'Courier New', monospace; font-size: 12px; padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.1); }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>CloudAFK Bot Dashboard</h1>
        <div class="status-grid">
          <div class="card"><h3>Bot Status</h3><div class="value">${botStatus}</div></div>
          <div class="card"><h3>Players Online</h3><div class="value">${playerCount}</div></div>
          <div class="card"><h3>Bot Health</h3><div class="value">${health}</div></div>
          <div class="card"><h3>Bot Food</h3><div class="value">${food}</div></div>
          <div class="card"><h3>Ping</h3><div class="value">${ping}ms</div></div>
          <div class="card"><h3>Uptime</h3><div class="value">${uptime}</div></div>
        </div>
        <div class="console">
          <h2>Bot Console</h2>
          ${consoleLogs.map(log => `<div class="log">${log}</div>`).join('')}
        </div>
        <div class="console">
          <h2>Minecraft Console</h2>
          ${mcConsoleLogs.map(log => `<div class="log">${log}</div>`).join('')}
        </div>
        <div class="card"><h3>Online Players</h3><div class="value">${players}</div></div>
      </div>
    </body>
    </html>
  `);
});

app.get('/api/status', (req, res) => {
  res.json({
    status: botStatus,
    playerCount: bot ? Object.keys(bot.players).length : 0,
    health: bot ? bot.health : 0,
    food: bot ? bot.food : 0,
    ping: bot && bot.player ? bot.player.ping : 0,
    uptime: spawnTime ? fmtTime(Date.now() - spawnTime) : '0h 0m 0s',
    players: bot ? Object.keys(bot.players) : []
  });
});

createBot();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server started on port ' + PORT);
});
