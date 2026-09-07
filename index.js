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
let reconnectAttempts = 0;

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Website started on port ' + PORT);
  console.log('Starting bot...');
  createBot();
});

function createBot() {
  try {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);
    botStatus = 'connecting';
    addConsoleLog('Bot connecting...');

    bot.on('spawn', () => {
      console.log(`${bot.username} joined!`);
      spawnTime = Date.now();
      botStatus = 'online';
      reconnectAttempts = 0;
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
          } else if (stuckTicks >= 6) {
            if (followTarget && bot.players[followTarget]?.entity) {
              bot.entity.position = bot.players[followTarget].entity.position.clone();
            } else if (huntTarget && bot.players[huntTarget]?.entity) {
              bot.entity.position = bot.players[huntTarget].entity.position.clone();
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
      addMCConsoleLog(jsonMsg.toString());
    });

    bot.on('error', (err) => {
      addConsoleLog('Error: ' + err.message);
      botStatus = 'error';
    });

    bot.on('kicked', (reason) => {
      addConsoleLog('Bot kicked: ' + reason);
      botStatus = 'kicked';
    });

    bot.on('end', (reason) => {
      botStatus = 'offline';
      addConsoleLog('Bot disconnected: ' + reason);
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      addConsoleLog(`Reconnecting in ${delay/1000} seconds...`);
      setTimeout(createBot, delay);
    });

  } catch (e) {
    addConsoleLog('Failed to create bot: ' + e.message);
    botStatus = 'error';
    setTimeout(createBot, 10000);
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
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return `${h}h ${m}m ${sec}s`;
  }

  function safeWhisper(target, text) {
    try { bot.whisper(target, text); } catch (e) {}
  }

  function showCmdList(username) {
    const lines = [
      "=== CLOUDAFK BOT ===",
      "Owner: " + myUsername,
      "",
      "INFO: !coords !status !info !inventory !players !time !weather !nearbyplayers !nearbymobs !health [p] !whereis [p] !leakcoords [p] !exp !gamemode !uptime",
      "",
      "MOVEMENT: !come !follow [p] !goto x y z !wander !flee !attachplayer [p] !attachmob !jump !stop !freeze !tpbring !tp [p] !call !skydrivebot !skydriveplayers [p]",
      "",
      "COMBAT: !attack [p] !hunt [p] !protect !killbot !kick [p] !attackmobs !crash [p] !tntrain [p] !stopserver !healthgen",
      "",
      "ACTIONS: !talk [msg] !shout [msg] !msg [p] [msg] !textspam [msg] !spamprivmsg [p] [msg] !stoptextspam !click !sneak !activate !lookat [p] !survival !creative !sleeptest",
      "",
      "BUILDING: !place [item] !dig !break [block] !collect [block] [amt] !blockinfo",
      "",
      "INVENTORY: !drop !dropall !hand !equip [item] !armor",
      "",
      "FUN: !echo [msg] !ping !spin"
    ];
    lines.forEach((line, i) => setTimeout(() => safeWhisper(username, line), i * 75));
  }

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      safeWhisper(username, "Access denied.");
      return;
    }

    const args = message.trim().split(' ');
    const command = args[0]?.toLowerCase();

    if (command === '!cmdlist' || command === '!help') { showCmdList(username); return; }
    if (command === '!coords') { const p = bot.entity.position; safeWhisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { safeWhisper(username, `HP:${bot.health}/20 Food:${bot.food}/20`); return; }
    if (command === '!info') { safeWhisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', '); safeWhisper(username, items || "Empty"); return; }
    if (command === '!players') { safeWhisper(username, `Online: ${Object.keys(bot.players).join(', ')}`); return; }
    if (command === '!time') { safeWhisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { safeWhisper(username, bot.isRaining ? "Raining" : "Clear"); return; }
    if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); safeWhisper(username, "Jumped!"); return; }
    if (command === '!stop') {
      bot.pathfinder.setGoal(null); bot.clearControlStates();
      attachTarget = null; attackTarget = null; huntTarget = null; followTarget = null;
      protectMode = false; wanderMode = false; attackMobs = false; autoBreakBlock = null; freezeMode = false;
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      safeWhisper(username, "Stopped all actions.");
      return;
    }
    if (command === '!tpbring') {
      const player = bot.players[username];
      if (player?.entity?.position) {
        bot.entity.position = player.entity.position.clone();
        safeWhisper(username, "Teleported to you!");
      } else {
        bot.chat(`/tp ${bot.username} ${username}`);
        safeWhisper(username, "Teleporting...");
      }
      return;
    }
    if (command === '!tp') {
      const target = bot.players[args[1]]?.entity;
      if (target) { bot.entity.position = target.position.clone(); safeWhisper(username, `Teleported to ${args[1]}!`); }
      return;
    }
    if (command === '!call') {
      const pos = bot.entity.position;
      bot.chat(`/tp ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
      safeWhisper(username, "Teleporting you to bot...");
      return;
    }
    if (command === '!freeze') {
      freezeMode = !freezeMode;
      if (freezeMode) { bot.pathfinder.setGoal(null); bot.clearControlStates(); }
      safeWhisper(username, freezeMode ? "Frozen!" : "Unfrozen!");
      return;
    }
    if (command === '!killbot') { bot.chat('/kill'); return; }
    if (command === '!skydrivebot') { bot.chat('/effect give ' + bot.username + ' minecraft:levitation 30 50'); safeWhisper(username, "Bot flying to sky!"); return; }
    if (command === '!skydriveplayers') {
      const targetName = args[1];
      if (targetName) {
        bot.chat('/effect give ' + targetName + ' minecraft:levitation 30 50');
      } else {
        Object.keys(bot.players).forEach(p => { if (p !== bot.username) bot.chat('/effect give ' + p + ' minecraft:levitation 30 50'); });
      }
      safeWhisper(username, "Players flying to sky!");
      return;
    }
    if (command === '!healthgen') { bot.chat('/effect give ' + bot.username + ' minecraft:regeneration 10 5'); safeWhisper(username, "Healing bot!"); return; }
    if (command === '!kick') { if (args[1]) bot.chat('/kick ' + args[1]); return; }
    if (command === '!survival' || command === '!survial') { bot.chat('/gamemode survival'); return; }
    if (command === '!creative') { bot.chat('/gamemode creative'); return; }
    if (command === '!msg') { if (args[1] && args[2]) safeWhisper(args[1], args.slice(2).join(' ')); return; }
    if (command === '!textspam') {
      const text = args.slice(1).join(' ');
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (text) textSpamInterval = setInterval(() => bot.chat(text), 2000);
      return;
    }
    if (command === '!spamprivmsg') {
      const targetName = args[1];
      const text = args.slice(2).join(' ');
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      if (targetName && text) spamPrivateInterval = setInterval(() => safeWhisper(targetName, text), 2000);
      return;
    }
    if (command === '!stoptextspam') {
      if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
      if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
      return;
    }
    if (command === '!come') {
      followTarget = null; huntTarget = null; attackTarget = null;
      const target = bot.players[username]?.entity;
      if (target) {
        bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 1));
        safeWhisper(username, "Coming!");
      }
      return;
    }
    if (command === '!follow') {
      const targetName = args[1] || username;
      if (bot.players[targetName]) {
        followTarget = targetName; huntTarget = null; attackTarget = null;
        safeWhisper(username, `Following ${targetName}`);
      }
      return;
    }
    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
        followTarget = null;
        bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
        safeWhisper(username, "Going!");
      }
      return;
    }
    if (command === '!wander') {
      wanderMode = { radius: parseInt(args[1]) || 10, origin: bot.entity.position.clone() };
      safeWhisper(username, "Wandering!");
      return;
    }
    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile) {
        const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
        bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      }
      return;
    }
    if (command === '!attack') {
      if (args[1] && bot.players[args[1]]) {
        attackTarget = args[1]; followTarget = null; huntTarget = null;
        safeWhisper(username, `Attacking ${args[1]}!`);
      }
      return;
    }
    if (command === '!hunt') {
      if (args[1] && bot.players[args[1]]) {
        huntTarget = args[1]; attackTarget = null; followTarget = null;
        safeWhisper(username, `Hunting ${args[1]}!`);
      }
      return;
    }
    if (command === '!attackmobs') { attackMobs = !attackMobs; safeWhisper(username, attackMobs ? "Attacking mobs!" : "Stopped."); return; }
    if (command === '!crash') {
      if (args[1]) {
        bot.chat('/effect give ' + args[1] + ' minecraft:levitation 100 255');
        bot.chat('/effect give ' + args[1] + ' minecraft:nausea 100 255');
      }
      return;
    }
    if (command === '!tntrain') {
      const target = bot.players[args[1]]?.entity;
      if (target) {
        for (let i = 0; i < 20; i++) {
          setTimeout(() => {
            bot.chat(`/summon tnt ${Math.round(target.position.x)} ${Math.round(target.position.y + 10)} ${Math.round(target.position.z)}`);
          }, i * 200);
        }
      }
      return;
    }
    if (command === '!stopserver') { bot.chat('/stop'); return; }
    if (command === '!leakcoords') {
      const target = bot.players[args[1]]?.entity;
      if (target) {
        bot.chat(`${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
      }
      return;
    }
    if (command === '!armor') {
      const armor = bot.inventory.items().filter(i => i.name.includes('helmet') || i.name.includes('chestplate') || i.name.includes('leggings') || i.name.includes('boots'));
      armor.forEach(item => {
        try {
          if (item.name.includes('helmet')) bot.equip(item, 'head');
          if (item.name.includes('chestplate')) bot.equip(item, 'torso');
          if (item.name.includes('leggings')) bot.equip(item, 'legs');
          if (item.name.includes('boots')) bot.equip(item, 'feet');
        } catch (e) {}
      });
      return;
    }
    if (command === '!protect') { protectMode = !protectMode; return; }
    if (command === '!lookat') {
      const target = bot.players[args[1] || username]?.entity;
      if (target) bot.lookAt(target.position.offset(0, target.height, 0));
      return;
    }
    if (command === '!talk') { if (args[1]) bot.chat(args.slice(1).join(' ')); return; }
    if (command === '!shout') { if (args[1]) bot.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (target) bot.attack(target);
      return;
    }
    if (command === '!sneak') { bot.setControlState('sneak', args[1] !== 'stop'); return; }
    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) bot.activateBlock(block);
      return;
    }
    if (command === '!sleeptest') {
      const bed = bot.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 16 });
      if (bed) bot.sleep(bed).catch(() => {});
      return;
    }
    if (command === '!attachplayer') {
      if (args[1] && bot.players[args[1]]) {
        attachTarget = args[1]; attachType = 'player'; attackTarget = args[1]; followTarget = null;
      }
      return;
    }
    if (command === '!attachmob') {
      const mob = bot.nearestEntity(e => e.type === 'mob' || e.type === 'monster');
      if (mob) { attachTarget = mob.id; attachType = 'mob'; }
      return;
    }
    if (command === '!drop') { const h = bot.heldItem; if (h) bot.tossStack(h); return; }
    if (command === '!dropall') { bot.inventory.items().forEach(i => bot.tossStack(i).catch(() => {})); return; }
    if (command === '!hand') { safeWhisper(username, bot.heldItem ? `Holding: ${bot.heldItem.name}` : "Empty"); return; }
    if (command === '!equip') {
      const item = bot.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
      if (item) bot.equip(item, 'hand').catch(() => {});
      return;
    }
    if (command === '!place') {
      const item = bot.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
      const ref = bot.blockAtCursor(5);
      if (item && ref) bot.equip(item, 'hand').then(() => bot.placeBlock(ref, {x:0,y:1,z:0})).catch(() => {});
      return;
    }
    if (command === '!dig') {
      const block = bot.blockAtCursor(10);
      if (block && bot.canDigBlock(block)) bot.dig(block).catch(() => {});
      return;
    }
    if (command === '!break') {
      if (args[1] === 'stop') { autoBreakBlock = null; } else { autoBreakBlock = args.slice(1).join('_'); }
      return;
    }
    if (command === '!collect') {
      const targets = bot.findBlocks({ matching: b => b.name.includes(args[1] || ''), maxDistance: 32, count: parseInt(args[2]) || 1 });
      targets.forEach(pos => {
        const block = bot.blockAt(pos);
        if (block && bot.canDigBlock(block)) bot.dig(block).catch(() => {});
      });
      return;
    }
    if (command === '!blockinfo') { const b = bot.blockAtCursor(5); safeWhisper(username, b ? b.name : "No block"); return; }
    if (command === '!nearbyplayers') {
      const list = Object.values(bot.players).filter(p => p.entity && p.username !== bot.username).map(p => p.username);
      safeWhisper(username, list.length ? `Nearby: ${list.join(', ')}` : "No players");
      return;
    }
    if (command === '!nearbymobs') {
      const mobs = Object.values(bot.entities).filter(e => e.type === 'mob' && e !== bot.entity).map(e => e.name || 'mob');
      safeWhisper(username, mobs.length ? `Mobs: ${mobs.join(', ')}` : "No mobs");
      return;
    }
    if (command === '!health') {
      const target = bot.players[args[1]]?.entity || bot.players[username]?.entity;
      if (target) safeWhisper(username, `HP: ${target.health || 'unknown'}`);
      return;
    }
    if (command === '!whereis') {
      const target = bot.players[args[1]]?.entity;
      if (target) safeWhisper(username, `${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
      return;
    }
    if (command === '!exp') { safeWhisper(username, `XP: ${bot.experience.level}`); return; }
    if (command === '!gamemode') { safeWhisper(username, `Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { safeWhisper(username, `Uptime: ${fmtTime(Date.now() - spawnTime)}`); return; }
    if (command === '!echo') { safeWhisper(username, args.slice(1).join(' ')); return; }
    if (command === '!ping') { safeWhisper(username, `Ping: ${bot.player?.ping || 'unknown'}ms`); return; }
    if (command === '!spin') {
      let yaw = bot.entity.yaw;
      const interval = setInterval(() => {
        yaw += Math.PI / 4;
        bot.look(yaw, bot.entity.pitch, true);
        if (yaw >= bot.entity.yaw + Math.PI * 2) clearInterval(interval);
      }, 100);
      return;
    }
  }

  bot.on('whisper', (username, message) => handleCommand(username, message));
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!')) handleCommand(username, message);
  });
}

// Website
app.get('/', (req, res) => {
  const data = {
    status: botStatus,
    players: bot ? Object.keys(bot.players).length : 0,
    health: bot ? bot.health : 0,
    food: bot ? bot.food : 0,
    ping: bot?.player?.ping || 0,
    uptime: spawnTime ? fmtTime(Date.now() - spawnTime) : '0h 0m 0s',
    playerList: bot ? Object.keys(bot.players).join(', ') : 'None'
  };
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bot</title>
      <meta http-equiv="refresh" content="5">
      <style>
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 20px 0; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; }
        .value { font-size: 1.5em; color: #4CAF50; font-weight: bold; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 200px; overflow-y: auto; margin: 10px 0; }
        .log { font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bot Dashboard</h1>
      <div class="grid">
        <div class="card"><h3>Status</h3><div class="value">${data.status}</div></div>
        <div class="card"><h3>Players</h3><div class="value">${data.players}</div></div>
        <div class="card"><h3>Health</h3><div class="value">${data.health}</div></div>
        <div class="card"><h3>Ping</h3><div class="value">${data.ping}ms</div></div>
        <div class="card"><h3>Uptime</h3><div class="value">${data.uptime}</div></div>
        <div class="card"><h3>Players Online</h3><div class="value">${data.playerList}</div></div>
      </div>
      <div class="console"><h3>Bot Console</h3>${consoleLogs.slice(-20).map(l => `<div class="log">${l}</div>`).join('')}</div>
      <div class="console"><h3>MC Console</h3>${mcConsoleLogs.slice(-20).map(l => `<div class="log">${l}</div>`).join('')}</div>
    </body>
    </html>
  `);
});

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
}
