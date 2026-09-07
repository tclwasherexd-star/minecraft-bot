const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = 'tcl';
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, freezeMode = false, textSpamInterval = null, autoBreakBlock = null, autoBreakInterval = null;

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    spawnTime = Date.now();
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
      if (!freezeMode && !bot.pathfinder.isMoving() && !attachTarget && !wanderMode && !autoBreakBlock) {
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

    // Attack Mode Loop
    setInterval(() => {
      if (freezeMode) return;
      const targetName = attackTarget || (attachType === 'player' ? attachTarget : null);
      if (!targetName) return;
      
      const target = bot.players[targetName]?.entity;
      if (!target) { 
        bot.chat(`Lost track of ${targetName}, stopping attack.`); 
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

    // Wander Loop
    setInterval(() => {
      if (!wanderMode || freezeMode || bot.pathfinder.isMoving()) return;
      const radius = wanderMode.radius || 10;
      const origin = wanderMode.origin;
      const dx = (Math.random() * 2 - 1) * radius;
      const dz = (Math.random() * 2 - 1) * radius;
      bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
    }, 8000);

    // Stuck Detector - Improved
    let lastPos = null;
    let stuckTicks = 0;
    let lastMoveTime = Date.now();
    
    setInterval(() => {
      if (freezeMode) { lastPos = null; stuckTicks = 0; return; }
      const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
      if (!hasGoal) { lastPos = null; stuckTicks = 0; return; }

      const pos = bot.entity.position;
      const now = Date.now();
      
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
            if (bot.pathfinder.goal === null) {
              const currentPos = bot.entity.position;
              bot.pathfinder.setGoal(new goals.GoalNear(currentPos.x + 2, currentPos.y, currentPos.z + 2, 1));
            }
          }, 500);
          stuckTicks = 0;
        }
      } else {
        stuckTicks = 0;
        lastMoveTime = now;
      }
      
      lastPos = pos.clone();
    }, 500);
    
    setInterval(() => {
      if (stuckTicks === 0) {
        bot.clearControlStates();
      }
    }, 2000);
  });

  bot.on('message', (jsonMsg) => {
    console.log('[RAW MESSAGE]', jsonMsg.toString());
  });

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
      "§6§l⚡ CLOUDAFK BOT v2.0 ⚡",
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
      "§8├─ §f!protect §8» §7Guard mode",
      "§8├─ §f!killbot §8» §7Kill the bot",
      "§8├─ §f!kick [p] §8» §7Kick player",
      "§8└─ §f!healthgen §8» §7Regen health",
      "",
      "§d§l🎭 ACTIONS",
      "§8├─ §f!talk [msg] §8» §7Send message",
      "§8├─ §f!shout [msg] §8» §7Shout message",
      "§8├─ §f!textspam [msg] §8» §7Spam message",
      "§8├─ §f!stoptextspam §8» §7Stop spam",
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
      "§8├─ §f!dig §8» §7Dig block (improved)",
      "§8├─ §f!break [block] §8» §7Auto-break blocks",
      "§8├─ §f!collect [block] [amt] §8» §7Collect blocks",
      "§8└─ §f!blockinfo §8» §7Block info",
      "",
      "§9§l🎒 INVENTORY",
      "§8├─ §f!drop §8» §7Drop held item",
      "§8├─ §f!dropall §8» §7Drop everything",
      "§8├─ §f!hand §8» §7Show held item",
      "§8└─ §f!equip [item] §8» §7Equip item",
      "",
      "§5§l🎲 FUN",
      "§8├─ §f!echo [msg] §8» §7Echo message",
      "§8├─ §f!ping [p] §8» §7Check ping",
      "§8├─ §f!spin §8» §7Spin around",
      "§8├─ §f!emote [type] §8» §7Do emote",
      "§8├─ §f!8ball [q] §8» §7Ask 8ball",
      "§8├─ §f!coinflip §8» §7Flip coin",
      "§8└─ §f!roll [sides] §8» §7Roll dice",
      "",
      "§7§l🔧 SANDBOX",
      "§8├─ §f!addcmd !name [reply] §8» §7Add command",
      "§8├─ §f!delcmd !name §8» §7Delete command",
      "§8├─ §f!listcmds §8» §7List custom cmds",
      "§8└─ §f!clean §8» §7Clear sandbox",
      "",
      "§8§m─────────────────────────────────────",
      "§6§l✦ Use !help1-8 for quick categories ✦",
      "§8§m─────────────────────────────────────"
    ];
    
    lines.forEach((line, i) => {
      setTimeout(() => bot.whisper(username, line), i * 75);
    });
  }

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      bot.whisper(username, "Access denied.");
      return;
    }

    const msg = message.trim();
    const args = msg.split(' ');
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase();

    if (command === '!cmds' || command === '!cmdlist' || command === '!commands' || command === '!menu' || command === '!help') {
      showCmdList(username);
      return;
    }

    if (command === '!help1') { bot.whisper(username, "§b§lINFO: §f!coords !status !info !inventory !players !time !weather !nearbyplayers !nearbymobs !health !tps !whereis !exp !gamemode !uptime"); return; }
    if (command === '!help2') { bot.whisper(username, "§a§lMOVE: §f!jump !come !follow !protect !lookat !attachplayer !attachmob !stop !goto !wander !flee !freeze !tpbring !tp !call"); return; }
    if (command === '!help3') { bot.whisper(username, "§d§lACT: §f!talk !shout !textspam !stoptextspam !click !sneak !activate !sleeptest !survival !creative"); return; }
    if (command === '!help4') { bot.whisper(username, "§9§lINV: §f!drop !dropall !hand !equip"); return; }
    if (command === '!help5') { bot.whisper(username, "§7§lSANDBOX: §f!addcmd !delcmd !listcmds !clean"); return; }
    if (command === '!help6') { bot.whisper(username, "§e§lBUILD: §f!place !placeat !fill !dig !break !collect !blockinfo"); return; }
    if (command === '!help7') { bot.whisper(username, "§5§lFUN: §f!echo !ping !spin !emote !8ball !coinflip !roll"); return; }
    if (command === '!help8') { bot.whisper(username, "§c§lCOMBAT: §f!attack !attachplayer !protect !flee !killbot !kick !healthgen"); return; }

    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `§bX:§f${Math.round(p.x)} §bY:§f${Math.round(p.y)} §bZ:§f${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `§cHP:§f${bot.health}/20 §6Food:§f${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `§aBiome:§f${bot.blockAt(bot.entity.position)?.biome.name} §dPing:§f${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `§9Items:§f ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `§aOnline:§f ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `§eTime:§f ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "§bRaining/Snowing" : "§eClear"); return; }
    if (command === '!jump') { 
      if (freezeMode) return bot.whisper(username, "§cBot is frozen!");
      bot.setControlState('jump', true); 
      setTimeout(() => bot.setControlState('jump', false), 500); 
      bot.whisper(username, "§aJumped!"); 
      return; 
    }

    if (command === '!stop') {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      attachTarget = null; attachType = null;
      protectMode = false; attackTarget = null; wanderMode = false;
      autoBreakBlock = null;
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      bot.whisper(username, "§cCleared all actions.");
      return;
    }

    if (command === '!tpbring') {
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "§cCan't see you.");
      bot.entity.position = target.position.clone();
      bot.whisper(username, "§aTeleported to you!");
      return;
    }

    if (command === '!tp') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "§cUse: !tp [playername]");
      if (!bot.players[targetName]) return bot.whisper(username, `§cPlayer ${targetName} not found or offline.`);
      const target = bot.players[targetName].entity;
      if (!target) return bot.whisper(username, `§cCannot see ${targetName} (out of render distance).`);
      bot.entity.position = target.position.clone();
      bot.whisper(username, `§aTeleported to ${targetName}!`);
      return;
    }

    if (command === '!kick') {
      const targetName = args[1];
      if (!targetName) return bot.whisper(username, "§cUse: !kick [playername]");
      bot.chat(`/kick ${targetName}`);
      bot.whisper(username, `§cAttempting to kick ${targetName}!`);
      return;
    }

    if (command === '!call') {
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "§cCan't see you.");
      const botPos = bot.entity.position;
      bot.chat(`/tp ${username} ${Math.round(botPos.x)} ${Math.round(botPos.y)} ${Math.round(botPos.z)}`);
      bot.whisper(username, "§aAttempting to teleport you to me!");
      return;
    }

    if (command === '!freeze') {
      if (args[1] === 'stop' || args[1] === 'off') {
        freezeMode = false;
        bot.whisper(username, "§aBot unfrozen.");
      } else {
        freezeMode = true;
        bot.pathfinder.setGoal(null);
        bot.clearControlStates();
        bot.whisper(username, "§bBot frozen in place!");
      }
      return;
    }

    if (command === '!killbot') {
      bot.chat('/kill');
      bot.whisper(username, "§cKilling bot...");
      return;
    }

    if (command === '!healthgen') {
      bot.chat('/effect give ' + bot.username + ' minecraft:regeneration 10 5');
      bot.chat('/effect give ' + bot.username + ' minecraft:instant_health 1 5');
      bot.whisper(username, "§aRegenerating health!");
      return;
    }

    if (command === '!textspam') {
      const text = args.slice(1).join(' ');
      if (!text) {
        if (textSpamInterval) {
          clearInterval(textSpamInterval);
          textSpamInterval = null;
          bot.whisper(username, "§cText spam stopped.");
        } else {
          return bot.whisper(username, "§eUse: !textspam [message] - Spam message every 2 seconds");
        }
      } else {
        if (textSpamInterval) clearInterval(textSpamInterval);
        textSpamInterval = setInterval(() => {
          if (!freezeMode) {
            bot.chat(text);
          }
        }, 2000);
        bot.whisper(username, `§aSpamming: "${text}" every 2 seconds. Use !stoptextspam to stop.`);
      }
      return;
    }

    // New !stoptextspam command
    if (command === '!stoptextspam' || command === '!stopspam') {
      if (textSpamInterval) {
        clearInterval(textSpamInterval);
        textSpamInterval = null;
        bot.whisper(username, "§cText spam stopped.");
      } else {
        bot.whisper(username, "§eNo text spam is currently running.");
      }
      return;
    }

    if (command === '!survival' || command === '!survial') {
      bot.chat('/gamemode survival');
      bot.whisper(username, "§aSwitched to Survival mode!");
      return;
    }

    if (command === '!creative') {
      bot.chat('/gamemode creative');
      bot.whisper(username, "§aSwitched to Creative mode!");
      return;
    }

    if (command === '!come') {
      attachTarget = null; attachType = null;
      attackTarget = null;
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "§cCan't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      bot.whisper(username, "§aComing!");
      return;
    }

    if (command === '!follow') {
      attachTarget = null; 
      attachType = null;
      attackTarget = null;
      
      const targetName = args[1] || username;
      
      if (!bot.players[targetName]) {
        return bot.whisper(username, `§cPlayer ${targetName} not found or offline.`);
      }
      
      const target = bot.players[targetName].entity;
      if (!target) {
        return bot.whisper(username, `§cCannot see ${targetName} (out of render distance).`);
      }
      
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      bot.whisper(username, `§aFollowing ${targetName}`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return bot.whisper(username, "§cUse: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      attackTarget = null;
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      bot.whisper(username, `§aHeading to ${x}, ${y}, ${z}`);
      return;
    }

    if (command === '!wander') {
      if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "§cWander off."); return; }
      const radius = parseInt(args[1]) || 10;
      wanderMode = { radius, origin: bot.entity.position.clone() };
      bot.whisper(username, `§aWandering within ${radius} blocks.`);
      return;
    }

    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (!hostile) return bot.whisper(username, "§cNo hostiles nearby.");
      const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
      bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      bot.whisper(username, `§cFleeing from ${hostile.name || 'mob'}!`);
      return;
    }

    if (command === '!attack') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attackTarget = null; 
        bot.pathfinder.setGoal(null); 
        bot.whisper(username, "§cAttack stopped."); 
        return; 
      }
      if (!bot.players[pTarget]) return bot.whisper(username, "§cPlayer offline.");
      attackTarget = pTarget;
      bot.whisper(username, `§cAttacking ${pTarget}!`);
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "§cProtect mode off."); return; }
      protectMode = true;
      bot.whisper(username, "§aProtect mode on - attacking nearby hostiles.");
      return;
    }

    if (command === '!lookat') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "§cPlayer not found/offline.");
      bot.lookAt(target.position.offset(0, target.height, 0));
      bot.whisper(username, `§aLooking at ${args[1] || username}`);
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "§cUse: !talk [message]");
      bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "§cUse: !shout [message]");
      bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (!target) return bot.whisper(username, "§cNothing in range.");
      bot.attack(target);
      bot.whisper(username, `§aClicked ${target.name || target.username || target.displayName || 'entity'}`);
      return;
    }

    if (command === '!sneak') {
      const state = args[1] !== 'stop';
      bot.setControlState('sneak', state);
      bot.whisper(username, state ? "§aSneaking." : "§cStanding.");
      return;
    }

    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) { bot.activateBlock(block); bot.whisper(username, `§aActivated block: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); bot.whisper(username, `§aActivated entity: ${entity.name || entity.displayName || 'entity'}`); return; }
      bot.whisper(username, "§cNothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({ matching: (block) => block.name.includes('bed'), maxDistance: 16 });
      if (!bedBlock) return bot.whisper(username, "§cNo bed nearby.");
      bot.sleep(bedBlock).then(() => bot.whisper(username, "§aSleeping.")).catch(e => bot.whisper(username, `§cCan't sleep: ${e.message}`));
      return;
    }

    if (command === '!attachplayer') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.pathfinder.setGoal(null);
        bot.whisper(username, "§cDetached and stopped attacking."); 
        return; 
      }
      
      if (!bot.players[pTarget]) {
        return bot.whisper(username, `§cPlayer ${pTarget} not found or offline.`);
      }
      
      const targetEntity = bot.players[pTarget].entity;
      if (!targetEntity) {
        return bot.whisper(username, `§cCannot see ${pTarget} (out of render distance).`);
      }
      
      attachTarget = pTarget; 
      attachType = 'player'; 
      attackTarget = pTarget;
      bot.pathfinder.setGoal(null); 
      bot.whisper(username, `§aAttached to ${pTarget} and attacking!`); 
      return;
    }

    if (command === '!attachmob') {
      if (args[1] === 'stop') { 
        attachTarget = null; 
        attachType = null; 
        attackTarget = null;
        bot.whisper(username, "§cDetached."); 
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
      if (!closest) return bot.whisper(username, "§cNo mobs nearby.");
      attachTarget = closest.id; 
      attachType = 'mob';
      attackTarget = null;
      bot.pathfinder.setGoal(null);
      bot.whisper(username, `§aAttached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "§cHand empty."); bot.tossStack(h); bot.whisper(username, "§aDropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return bot.whisper(username, "§cEmpty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); bot.whisper(username, "§aDropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `§aHolding: ${i.name} x${i.count}` : "§cEmpty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "§cUse: !equip [item name]");
      const items = bot.inventory.items();
      const item = items.find(i => i.name.includes(itemName));
      if (!item) { bot.whisper(username, `§cItem not found. You're holding: ${items.map(i => i.name).join(', ') || 'nothing'}`); return; }
      bot.equip(item, 'hand').then(() => bot.whisper(username, `§aEquipped ${item.name}`)).catch(e => bot.whisper(username, `§cEquip failed: ${e.message}`));
      return;
    }

    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "§cUse: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "§cItem not found in inventory.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return bot.whisper(username, "§cNo block in view to place against.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, bot.entity.position.offset(0, 1, 0).minus(refBlock.position).normalize()))
        .then(() => bot.whisper(username, `§aPlaced ${item.name}`))
        .catch(e => bot.whisper(username, `§cPlace failed: ${e.message}`));
      return;
    }

    if (command === '!placeat') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      const itemName = args.slice(4).join('_').toLowerCase();
      if ([x, y, z].some(isNaN) || !itemName) return bot.whisper(username, "§cUse: !placeat [x] [y] [z] [item]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "§cItem not found in inventory.");
      const refBlock = bot.blockAt({ x, y: y - 1, z });
      if (!refBlock) return bot.whisper(username, "§cNo reference block below target position.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => bot.whisper(username, `§aPlaced ${item.name} at ${x},${y},${z}`))
        .catch(e => bot.whisper(username, `§cPlace failed: ${e.message}`));
      return;
    }

    if (command === '!fill') {
      const itemName = args[1]?.toLowerCase();
      const w = parseInt(args[2]) || 1, h = parseInt(args[3]) || 1, d = parseInt(args[4]) || 1;
      if (!itemName) return bot.whisper(username, "§cUse: !fill [item] [w] [h] [d]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "§cItem not found in inventory.");
      bot.whisper(username, `§aFilling ${w}x${h}x${d} with ${item.name}...`);
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
        bot.whisper(username, "§aFill complete.");
      })();
      return;
    }

    // IMPROVED DIG COMMAND
    if (command === '!dig') {
      const block = bot.blockAtCursor(10);
      if (!block || block.name === 'air') return bot.whisper(username, "§cNo block in view.");
      
      bot.whisper(username, `§aDigging ${block.name}...`);
      
      bot.lookAt(block.position.offset(0.5, 0.5, 0.5), true);
      
      setTimeout(() => {
        bot.dig(block)
          .then(() => bot.whisper(username, `§aSuccessfully dug ${block.name}`))
          .catch(e => {
            bot.whisper(username, `§cDig failed: ${e.message}. Trying to move closer...`);
            bot.pathfinder.setGoal(new goals.GoalGetToBlock(block.position.x, block.position.y, block.position.z));
            setTimeout(() => {
              const newBlock = bot.blockAt(block.position);
              if (newBlock && bot.canDigBlock(newBlock)) {
                bot.dig(newBlock)
                  .then(() => bot.whisper(username, `§aSuccessfully dug ${newBlock.name}`))
                  .catch(err => bot.whisper(username, `§cFailed to dig: ${err.message}`));
              }
            }, 2000);
          });
      }, 500);
      return;
    }

    // NEW !break COMMAND - Auto break blocks
    if (command === '!break') {
      const blockName = args.slice(1).join('_').toLowerCase();
      
      if (!blockName || blockName === 'stop') {
        autoBreakBlock = null;
        bot.whisper(username, "§cAuto-break stopped.");
        return;
      }
      
      autoBreakBlock = blockName;
      bot.whisper(username, `§aAuto-breaking all ${blockName} blocks within 16 blocks! Use !break stop to stop.`);
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return bot.whisper(username, "§cUse: !collect [block name] [amount]");

      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount * 3 });
      if (!targets || targets.length === 0) return bot.whisper(username, "§cNone found nearby.");

      bot.whisper(username, `§aAttempting to collect ${amount} ${blockName}...`);

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
        bot.whisper(username, `§aCollect finished. Got ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(10);
      bot.whisper(username, block ? `§aLooking at: ${block.name}` : "§cNo block in view.");
      return;
    }

    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `§aNearby: ${list.join(', ')}` : "§cNo players in range.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || e.displayName || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `§aNearby mobs: ${list.join(', ')}` : "§cNo mobs in range.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "§cPlayer not found/offline.");
      const hp = target.health !== undefined ? target.health : 'unknown (not visible to bot)';
      bot.whisper(username, `§c${args[1] || username} HP: ${hp}`);
      return;
    }

    if (command === '!tps') { bot.whisper(username, "§eTPS not exposed by this server (no plugin support detected)."); return; }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "§cPlayer not found/offline (or out of render distance).");
      const p = target.position;
      bot.whisper(username, `§a${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { bot.whisper(username, `§aXP Level: ${bot.experience.level} (${bot.experience.points} pts)`); return; }
    if (command === '!gamemode') { bot.whisper(username, `§aGamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { bot.whisper(username, spawnTime ? `§aConnected for: ${fmtTime(Date.now() - spawnTime)}` : "§cNot spawned yet."); return; }

    if (command === '!echo') { bot.whisper(username, args.slice(1).join(' ') || "§c(nothing to echo)"); return; }
    if (command === '!ping') {
      const pTarget = args[1];
      if (pTarget) {
        const p = bot.players[pTarget];
        if (!p) return bot.whisper(username, "§cPlayer offline.");
        bot.whisper(username, `§a${pTarget} ping: ${p.ping}ms`);
      } else {
        bot.whisper(username, `§aBot ping: ${bot.player?.ping ?? 'unknown'}ms`);
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
      bot.whisper(username, "§aSpinning!");
      return;
    }

    if (command === '!emote') {
      const type = args[1]?.toLowerCase();
      if (type === 'wave') { bot.swingArm('right'); bot.whisper(username, "§a*waves*"); }
      else if (type === 'sit') { bot.setControlState('sneak', true); bot.whisper(username, "§a*sits*"); }
      else if (type === 'stand') { bot.setControlState('sneak', false); bot.whisper(username, "§a*stands up*"); }
      else bot.whisper(username, "§eEmotes: wave, sit, stand");
      return;
    }

    if (command === '!8ball') {
      const question = args.slice(1).join(' ');
      if (!question) return bot.whisper(username, "§cUse: !8ball [question]");
      const answers = ["Yes.", "No.", "Definitely.", "Ask again later.", "Unlikely.", "Absolutely!", "My sources say no.", "It is certain.", "Very doubtful."];
      bot.whisper(username, answers[Math.floor(Math.random() * answers.length)]);
      return;
    }

    if (command === '!coinflip') { bot.whisper(username, Math.random() < 0.5 ? "§eHeads!" : "§eTails!"); return; }
    if (command === '!roll') { const sides = parseInt(args[1]) || 6; bot.whisper(username, `§eRolled a ${Math.floor(Math.random() * sides) + 1} (d${sides})`); return; }

    if (command === '!addcmd') { const cmdName = args[1], cmdReply = args.slice(2).join(' '); if (!cmdName || !cmdReply) return bot.whisper(username, '§cUse: !addcmd [!name] [reply]'); customCommands[cmdName.toLowerCase()] = cmdReply; bot.whisper(username, `§aCreated command: ${cmdName}`); return; }
    if (command === '!delcmd') { const cmdName = args[1]?.toLowerCase(); if (customCommands[cmdName]) { delete customCommands[cmdName]; bot.whisper(username, `§aDeleted ${cmdName}`); } else { bot.whisper(username, '§cNot found.'); } return; }
    if (command === '!listcmds') { const keys = Object.keys(customCommands); bot.whisper(username, keys.length ? `§aCustom: ${keys.join(', ')}` : "§cNo custom commands."); return; }
    if (command === '!clean') { customCommands = {}; bot.whisper(username, "§aCleared sandbox memory."); return; }

    if (customCommands[command]) { bot.whisper(username, customCommands[command]); }
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

  bot.on('end', () => setTimeout(createBot, 15000));
  bot.on('error', (err) => console.log('Error:', err));
}

createBot();

app.get('/', (req, res) => res.send('Mega Sandbox Utility Bot is live!'));
app.listen(process.env.PORT || 3000);
