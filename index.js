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

    // Follow Loop - IMPROVED
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
      if (!freezeMode && !bot.pathfinder.isMoving() && !attachTarget && !wanderMode && !autoBreakBlock && !huntTarget && !attackMobs && !followTarget) {
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

    // Stuck Detector - VERY AGGRESSIVE
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
      
      if (!player) {
        return safeWhisper(username, "Cannot find you in player list.");
      }
      
      if (player.entity && player.entity.position) {
        bot.entity.position = player.entity.position.clone();
        safeWhisper(username, "Teleported bot to you!");
        return;
      }
      
      bot.chat(`/tp ${bot.username} ${username}`);
      safeWhisper(username, "Attempting to teleport bot to you via command...");
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

    if (command === '!killbot') {
      bot.chat('/kill');
      safeWhisper(username, "Killing bot...");
      return;
    }

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
   
