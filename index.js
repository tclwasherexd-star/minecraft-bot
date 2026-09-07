const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = 'tcl';
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, freezeMode = false, textSpamInterval = null, autoBreakBlock = null, huntTarget = null, spamPrivateInterval = null, attackMobs = false, followTarget = null;
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
    defaultMove.blocksToAvoid = new Set(['lava', 'water', 'fire', 'cactus']);
    bot.pathfinder.setMovements(defaultMove);
    bot.pathfinder.enablePathShortcuts = true;
    bot.pathfinder.thinkTimeout = 50;

    if (useAuthPlugin) {
      setTimeout(() => {
        bot.chat(`/register ${accountPassword} ${accountPassword}`);
        bot.chat(`/login ${accountPassword}`);
      }, 2000);
    }

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

    setInterval(() => {
      if (followTarget && !freezeMode) {
        const target = bot.players[followTarget]?.entity;
        if (target) {
          const distance = bot.entity.position.distanceTo(target.position);
          
          if (distance > 30) {
            bot.entity.position = target.position.clone();
          } else if (distance > 3) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            
            if (!bot.pathfinder.isMoving()) {
              bot.setControlState('jump', true);
              setTimeout(() => bot.setControlState('jump', false), 300);
            }
          } else {
            bot.pathfinder.setGoal(null);
          }
        }
      }
    }, 1000);

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

    setInterval(() => {
      if (!freezeMode && !bot.pathfinder.isMoving() && !attachTarget && !wanderMode && !autoBreakBlock && !huntTarget && !attackMobs && !followTarget) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }, 30000);

    setInterval(() => {
      if (!protectMode || freezeMode) return;
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
        bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
        if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
      }
    }, 1000);

    setInterval(() => {
      if (huntTarget && !freezeMode) {
        const target = bot.players[huntTarget]?.entity;
        if (target) {
          const distance = bot.entity.position.distanceTo(target.position);
          if (distance > 30) {
            bot.entity.position = target.position.clone();
          } else {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
            if (distance < 3) {
              bot.attack(target);
              bot.lookAt(target.position.offset(0, target.height, 0));
            }
          }
        }
      }
    }, 500);

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
      
      const distance = bot.entity.position.distanceTo(target.position);
      if (distance > 30) {
        bot.entity.position = target.position.clone();
      } else if (distance < 3) {
        bot.attack(target);
        bot.lookAt(target.position.offset(0, target.height, 0));
      } else if (!(attachType === 'player' && attachTarget === targetName)) {
        bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      }
    }, 500);

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

    setInterval(() => {
      if (!wanderMode || freezeMode || bot.pathfinder.isMoving()) return;
      const radius = wanderMode.radius || 10;
      const origin = wanderMode.origin;
      const dx = (Math.random() * 2 - 1) * radius;
      const dz = (Math.random() * 2 - 1) * radius;
      bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
    }, 8000);

    let lastPos = null;
    let stuckTicks = 0;
    
    setInterval(() => {
      if (freezeMode) { lastPos = null; stuckTicks = 0; return; }
      const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
      if (!hasGoal) { lastPos = null; stuckTicks = 0; return; }

      const pos = bot.entity.position;
      
      if (lastPos && pos.distanceTo(lastPos) < 0.3) {
        stuckTicks++;
        
        if (stuckTicks === 2) {
          bot.setControlState('jump', true);
          setTimeout(() => bot.setControlState('jump', false), 400);
        } else if (stuckTicks === 4) {
          bot.setControlState('forward', true);
          setTimeout(() => bot.setControlState('forward', false), 800);
        } else if (stuckTicks === 6) {
          bot.setControlState('jump', true);
          bot.setControlState('forward', true);
          setTimeout(() => {
            bot.setControlState('jump', false);
            bot.setControlState('forward', false);
          }, 600);
        } else if (stuckTicks >= 8) {
          if (followTarget && bot.players[followTarget]?.entity) {
            bot.entity.position = bot.players[followTarget].entity.position.clone();
          } else if (huntTarget && bot.players[huntTarget]?.entity) {
            bot.entity.position = bot.players[huntTarget].entity.position.clone();
          } else {
            const block = bot.blockAtCursor(5);
            if (block && bot.canDigBlock(block)) {
              bot.dig(block).catch(() => {});
            }
            bot.pathfinder.setGoal(null);
            setTimeout(() => {
              const currentPos = bot.entity.position;
              bot.pathfinder.setGoal(new goals.GoalNear(currentPos.x + 3, currentPos.y, currentPos.z + 3, 1));
            }, 500);
          }
          stuckTicks = 0;
        }
      } else {
        stuckTicks = 0;
      }
      
      lastPos = pos.clone();
    }, 400);
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
      "INFO: !coords !status !info !inventory !players !time !weather !nearbyplayers !nearbymobs !health [p] !whereis [p] !leakcoords [p] !exp !gamemode !uptime !tps",
      "",
      "MOVEMENT: !come !follow [p] !goto x y z !wander [r] !flee !attachplayer [p] !attachmob !jump !stop !freeze !tpbring !tp [player] !call !skydrivebot !skydriveplayers [p]",
      "",
      "COMBAT: !attack [p] !hunt [p] !protect !killbot !kick [p] !attackmobs !crash [p] !tntrain [p] !stopserver !healthgen",
      "",
      "ACTIONS: !talk [msg] !shout [msg] !msg [p] [msg] !textspam [msg] !spamprivmsg [p] [msg] !stoptextspam !click !sneak !activate !lookat [p] !survival !creative !sleeptest",
      "",
      "BUILDING: !place [item] !placeat x y z [item] !fill [item] w h d !dig !break [block] !collect [block] [amt] !blockinfo",
      "",
      "INVENTORY: !drop !dropall !hand !equip [item] !armor",
      "",
      "FUN: !echo [msg] !ping [p] !spin",
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
      autoBreakBlock = null; huntTarget = null; attackMobs = false; followTarget = null;
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      safeWhisper(username, "Cleared all actions.");
      return;
    }

    if (command === '!tpbring') {
      const player = bot.players[username];
      if (!player) return safeWhisper(username, "Cannot find you in player list.");
      if (player.entity && player.entity.position) {
        bot.entity.position = player.entity.position.clone();
        safeWhisper(username, "Teleported bot to you!");
      } else {
        bot.chat(`/tp ${bot.username} ${username}`);
        safeWhisper(username, "Attempting to teleport bot to you...");
      }
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

    if (command === '!killbot') { bot.chat('/kill'); safeWhisper(username, "Killing bot..."); return; }

    if (command === '!skydrivebot') {
      bot.chat('/effect give ' + bot.username + ' minecraft:levitation 30 50');
      safeWhisper(username, "Bot is flying to the sky!");
      return;
    }

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
          return safeWhisper(username, "Use: !textspam [message]");
        }
      } else {
        if (textSpamInterval) clearInterval(textSpamInterval);
        textSpamInterval = setInterval(() => {
          if (!freezeMode) bot.chat(text);
        }, 2000);
        safeWhisper(username, `Spamming: "${text}" every 2 seconds.`);
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
          if (!freezeMode) safeWhisper(targetName, text);
        }, 2000);
        safeWhisper(username, `Spamming private messages to ${targetName}.`);
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
      attackTarget = null; huntTarget = null; followTarget = null;
      const target = bot.players[username]?.entity;
      if (!target) return safeWhisper(username, "Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      safeWhisper(username, "Coming!");
      return;
    }

    if (command === '!follow') {
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null;
      const targetName = args[1] || username;
      if (!bot.players[targetName]) return safeWhisper(username, `Player ${targetName} not found or offline.`);
      followTarget = targetName;
      safeWhisper(username, `Following ${targetName} (with anti-stuck)!`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return safeWhisper(username, "Use: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      attackTarget = null; huntTarget = null; followTarget = null;
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
      huntTarget = null; followTarget = null;
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
      attackTarget = null; followTarget = null;
      safeWhisper(username, `Hunting ${pTarget}!`);
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
      safeWhisper(username, `Leaked ${targetName}'s coordinates!`);
      return;
    }

    if (command === '!armor') {
      const armorItems = bot.inventory.items().filter(i => 
        i.name.includes('helmet') || i.name.includes('chestplate') || 
        i.name.includes('leggings') || i.name.includes('boots')
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
      safeWhisper(username, "Protect mode on.");
      return;
    }

    if (command === '!lookat') {
      const targetName = args[1] || username;
      const player = bot.players[targetName];
      if (!player) return safeWhisper(username, `Player ${targetName} not found.`);
      const target = player.entity;
      if (!target) return safeWhisper(username, `Cannot see ${targetName}.`);
      try {
        bot.lookAt(target.position.offset(0, target.height, 0), true);
        safeWhisper(username, `Looking at ${targetName}`);
      } catch (e) {
        safeWhisper(username, `Failed to look: ${e.message}`);
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
      safeWhisper(username, "Clicked entity!");
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
      if (block) { bot.activateBlock(block); safeWhisper(username, `Activated: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); safeWhisper(username, "Activated entity!"); return; }
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
        attachTarget = null; attachType = null; attackTarget = null;
        bot.pathfinder.setGoal(null);
        safeWhisper(username, "Detached."); 
        return; 
      }
      if (!bot.players[pTarget]) return safeWhisper(username, `Player ${pTarget} not found.`);
      const targetEntity = bot.players[pTarget].entity;
      if (!targetEntity) return safeWhisper(username, `Cannot see ${pTarget}.`);
      attachTarget = pTarget; attachType = 'player'; attackTarget = pTarget;
      followTarget = null;
      bot.pathfinder.setGoal(null); 
      safeWhisper(username, `Attached to ${pTarget} and attacking!`); 
      return;
    }

    if (command === '!attachmob') {
      if (args[1] === 'stop') { 
        attachTarget = null; attachType = null; attackTarget = null;
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
      attachTarget = closest.id; attachType = 'mob';
      attackTarget = null;
      bot.pathfinder.setGoal(null);
      safeWhisper(username, "Attached to mob!");
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
      if (!item) { safeWhisper(username, "Item not found."); return; }
      bot.equip(item, 'hand').then(() => safeWhisper(username, `Equipped ${item.name}`)).catch(e => safeWhisper(username, "Equip failed."));
      return;
    }

    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return safeWhisper(username, "Use: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return safeWhisper(username, "Item not found.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return safeWhisper(username, "No block in view.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => safeWhisper(username, `Placed ${item.name}`))
        .catch(e => safeWhisper(username, "Place failed."));
      return;
    }

    if (command === '!dig') {
      const block = bot.blockAtCursor(10);
      if (!block || block.name === 'air') return safeWhisper(username, "No block in view.");
      bot.dig(block).then(() => safeWhisper(username, `Dug ${block.name}`)).catch(e => safeWhisper(username, "Dig failed."));
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
      safeWhisper(username, `Auto-breaking ${blockName}.`);
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return safeWhisper(username, "Use: !collect [block] [amount]");
      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount });
      if (!targets || targets.length === 0) return safeWhisper(username, "None found.");
      safeWhisper(username, `Collecting ${amount} ${blockName}...`);
      (async () => {
        let collected = 0;
        for (const pos of targets) {
          if (collected >= amount) break;
          const block = bot.blockAt(pos);
          if (block && bot.canDigBlock(block)) {
            try {
              await bot.dig(block);
              collected++;
            } catch (e) {}
          }
        }
        safeWhisper(username, `Collected ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(5);
      safeWhisper(username, block ? `Block: ${block.name}` : "No block.");
      return;
    }

    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      safeWhisper(username, list.length ? `Nearby: ${list.join(', ')}` : "No players.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      safeWhisper(username, list.length ? `Nearby mobs: ${list.join(', ')}` : "No mobs.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return safeWhisper(username, "Player not found.");
      safeWhisper(username, `HP: ${target.health || 'unknown'}`);
      return;
    }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return safeWhisper(username, "Player not found.");
      const p = target.position;
      safeWhisper(username, `${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { safeWhisper(username, `XP: ${bot.experience.level}`); return; }
    if (command === '!gamemode') { safeWhisper(username, `Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { safeWhisper(username, spawnTime ? `Uptime: ${fmtTime(Date.now() - spawnTime)}` : "Not spawned."); return; }

    if (command === '!echo') { safeWhisper(username, args.slice(1).join(' ') || "Nothing to echo"); return; }
    if (command === '!ping') { safeWhisper(username, `Ping: ${bot.player?.ping || 'unknown'}ms`); return; }
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
    handleCommand(username, message);
  });

  bot.on('chat', (username, message) => {
    if (username === bot.username) return;
    if (message.startsWith('!')) handleCommand(username, message);
  });
}

// Website
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
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; }
        .card h3 { opacity: 0.7; }
        .card .value { font-size: 1.5em; color: #4CAF50; font-weight: bold; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 250px; overflow-y: auto; margin: 10px 0; }
        .log { font-family: monospace; font-size: 12px; padding: 3px 0; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bot Dashboard</h1>
      <div class="grid">
        <div class="card"><h3>Status</h3><div class="value">${botStatus}</div></div>
        <div class="card"><h3>Players</h3><div class="value">${playerCount}</div></div>
        <div class="card"><h3>Health</h3><div class="value">${health}</div></div>
        <div class="card"><h3>Food</h3><div class="value">${food}</div></div>
        <div class="card"><h3>Ping</h3><div class="value">${ping}ms</div></div>
        <div class="card"><h3>Uptime</h3><div class="value">${uptime}</div></div>
      </div>
      <div class="console"><h3>Bot Console</h3>${consoleLogs.map(log => `<div class="log">${log}</div>`).join('')}</div>
      <div class="console"><h3>Minecraft Console</h3>${mcConsoleLogs.map(log => `<div class="log">${log}</div>`).join('')}</div>
      <div class="card"><h3>Online Players</h3><div class="value">${players}</div></div>
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
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server started on port ' + PORT);
});
