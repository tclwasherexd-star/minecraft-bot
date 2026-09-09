const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'node-sg-free-01.tickhosting.com', port: 50838, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null, freezeMode = false, textSpamInterval = null, autoBreakBlock = null, huntTarget = null, spamPrivateInterval = null, attackMobs = false, followTarget = null, mineBlock = null;
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = 'offline';
let reconnectAttempts = 0;
let lastCommand = null;
let lastCommandUser = null;

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Website started on port ' + PORT);
  createBot();
});

function createBot() {
  try {
    bot = mineflayer.createBot(config);
    bot.loadPlugin(pathfinder);
    botStatus = 'connecting';
    addConsoleLog('Bot connecting...');

    bot.on('spawn', () => {
      spawnTime = Date.now();
      botStatus = 'online';
      reconnectAttempts = 0;
      addConsoleLog('Bot joined!');
      
      const mcData = require('minecraft-data')(bot.version);
      defaultMove = new Movements(bot, mcData);
      
      defaultMove.canDig = true;
      defaultMove.allow1by1towers = false;
      defaultMove.allowParkour = true;
      defaultMove.allowSprinting = true;
      defaultMove.maxDropDown = 5;
      defaultMove.liquidCost = 5;
      defaultMove.avoidDamage = true;
      defaultMove.allowFreeMotion = true;
      defaultMove.allowEntityDetection = true;
      defaultMove.blocksToAvoid = new Set(['lava', 'water', 'fire', 'cactus']);
      defaultMove.blocksCantBreak = new Set();
      defaultMove.scafoldingBlocks = [];
      
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.enablePathShortcuts = true;
      bot.pathfinder.thinkTimeout = 20;

      if (lastCommand && lastCommandUser) {
        setTimeout(() => {
          handleCommand(lastCommandUser, lastCommand);
          lastCommand = null;
          lastCommandUser = null;
        }, 2000);
      }

      setInterval(() => {
        if (mineBlock && !freezeMode) {
          const blocks = bot.findBlocks({
            matching: b => b.name && b.name.toLowerCase().includes(mineBlock.toLowerCase()),
            maxDistance: 16,
            count: 1
          });
          if (blocks.length > 0) {
            const block = bot.blockAt(blocks[0]);
            if (block && bot.canDigBlock(block)) {
              bot.dig(block).catch(() => {});
            }
          }
        }
      }, 200);

      setInterval(() => {
        if (attackMobs && !freezeMode) {
          const target = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'monster' || e.type === 'hostile' || e.type === 'player') && e !== bot.entity);
          if (target && bot.entity.position.distanceTo(target.position) < 8) {
            bot.lookAt(target.position.offset(0, target.height, 0));
            bot.attack(target);
          }
        }
      }, 300);

      setInterval(() => {
        if (followTarget && !freezeMode) {
          const target = bot.players[followTarget]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            if (distance > 3) {
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
              bot.setControlState('sprint', false);
              bot.pathfinder.setGoal(null);
              bot.clearControlStates();
            }
          }
        }
      }, 300);

      let lastPos = null;
      let stuckCount = 0;
      
      setInterval(() => {
        const pos = bot.entity.position;
        if (lastPos && pos.distanceTo(lastPos) < 0.2 && bot.pathfinder.goal) {
          stuckCount++;
          
          if (stuckCount === 2) {
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 400);
          } else if (stuckCount === 4) {
            bot.setControlState('forward', true);
            setTimeout(() => bot.setControlState('forward', false), 800);
          } else if (stuckCount === 6) {
            bot.setControlState('jump', true);
            bot.setControlState('forward', true);
            setTimeout(() => {
              bot.setControlState('jump', false);
              bot.setControlState('forward', false);
            }, 600);
          } else if (stuckCount === 8) {
            bot.setControlState('jump', true);
            bot.setControlState('sprint', true);
            bot.setControlState('forward', true);
            setTimeout(() => {
              bot.setControlState('jump', false);
              bot.setControlState('sprint', false);
              bot.setControlState('forward', false);
            }, 800);
          } else if (stuckCount >= 10) {
            const block = bot.blockAtCursor(5);
            if (block && bot.canDigBlock(block)) {
              bot.dig(block).catch(() => {});
            }
            
            addConsoleLog('Bot stuck, relogging...');
            if (followTarget) {
              lastCommand = `!follow ${followTarget}`;
              lastCommandUser = myUsername[0];
            }
            bot.end('Stuck - relogging');
            stuckCount = 0;
          }
        } else {
          stuckCount = 0;
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
      addConsoleLog('Kicked: ' + reason);
      botStatus = 'kicked';
    });

    bot.on('end', (reason) => {
      botStatus = 'offline';
      addConsoleLog('Bot disconnected: ' + reason);
      reconnectAttempts++;
      const delay = Math.min(2000 * reconnectAttempts, 10000);
      setTimeout(createBot, delay);
    });

  } catch (e) {
    addConsoleLog('Failed: ' + e.message);
    setTimeout(createBot, 3000);
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
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
  }

  function safeWhisper(target, text) {
    try { bot.whisper(target, text); } catch (e) {}
  }

  function showCmdList(username) {
    const lines = [
      "=== CLOUDAFK BOT ===",
      "Owner: " + myUsername.join(', '),
      "",
      "INFO: !coords !status !info !players !nearbyplayers !nearbymobs !health [p] !whereis [p] !leakcoords [p] !exp !gamemode !uptime",
      "",
      "MOVEMENT: !come (walks) !follow [p] (walks) !goto x y z !wander !stopwander !attachplayer [p] !attachmob !jump !stop !tpbring (tp) !tp [p] !call !skydrivebot !skydriveplayers [p] !lookatfollow [p] !flee [distance]",
      "",
      "COMBAT: !attack [p] !hunt [p] !protect !killbot !kick [p] !attackmobs !tntrain [p] !stopserver !healthgen",
      "",
      "ACTIONS: !talk [msg] !shout [msg] !msg [p] [msg] !textspam [p] [msg] !spamprivmsg [p] [msg] !stoptextspam !click !sneak !unsneak !activate !survival !creative",
      "",
      "BUILDING: !place [item] !dig !mine [block] !stopmine !collect [block] [amt] !blockinfo",
      "",
      "INVENTORY: !drop !dropall !equip [item] !armor",
      "",
      "FUN: !echo [msg] !ping !spin"
    ];
    lines.forEach((line, i) => setTimeout(() => safeWhisper(username, line), i * 75));
  }

  function handleCommand(username, message) {
    if (!myUsername.includes(username.toLowerCase())) {
      safeWhisper(username, "Access denied.");
      return;
    }

    const args = message.trim().split(' ');
    const command = args[0]?.toLowerCase();

    try {
      if (command === '!cmdlist' || command === '!help') { showCmdList(username); return; }
      if (command === '!coords') { const p = bot.entity.position; safeWhisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeWhisper(username, `HP:${bot.health}/20 Food:${bot.food}/20`); return; }
      if (command === '!info') { safeWhisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} Ping:${bot.player.ping}ms`); return; }
      if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name}x${i.count}`).join(', '); safeWhisper(username, items || "Empty"); return; }
      if (command === '!players') { safeWhisper(username, `Online: ${Object.keys(bot.players).join(', ')}`); return; }
      if (command === '!time') { safeWhisper(username, `Time: ${bot.time.timeOfDay}`); return; }
      if (command === '!weather') { safeWhisper(username, bot.isRaining ? "Raining" : "Clear"); return; }
      if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); return; }
      
      if (command === '!stop') {
        bot.pathfinder.setGoal(null); bot.clearControlStates();
        attachTarget = null; attackTarget = null; huntTarget = null; followTarget = null;
        protectMode = false; wanderMode = false; attackMobs = false; mineBlock = null; autoBreakBlock = null; freezeMode = false;
        if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
        if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
        safeWhisper(username, "Stopped all.");
        return;
      }
      
      if (command === '!killbot') { bot.chat('/kill'); safeWhisper(username, "Killing bot!"); return; }
      
      if (command === '!tpbring') {
        bot.chat(`/tp ${bot.username} ${username}`);
        const player = bot.players[username];
        if (player?.entity?.position) {
          bot.entity.position = player.entity.position.clone();
        }
        safeWhisper(username, "Teleporting bot to you!");
        return;
      }
      
      if (command === '!tp') {
        const targetName = args[1];
        if (!targetName) return safeWhisper(username, "Use: !tp [playername]");
        const player = bot.players[targetName];
        if (player?.entity?.position) {
          bot.entity.position = player.entity.position.clone();
          safeWhisper(username, `Teleported to ${targetName}!`);
        } else {
          bot.chat(`/tp ${bot.username} ${targetName}`);
          safeWhisper(username, `Teleporting to ${targetName}...`);
        }
        return;
      }
      
      if (command === '!call') {
        const pos = bot.entity.position;
        bot.chat(`/tp ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        bot.chat(`/teleport ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        safeWhisper(username, "Teleporting you to bot!");
        return;
      }
      
      if (command === '!come') {
        followTarget = null; huntTarget = null; attackTarget = null;
        const target = bot.players[username]?.entity;
        if (!target) {
          safeWhisper(username, "Can't see you. Try !tpbring to teleport.");
          return;
        }
        
        const distance = bot.entity.position.distanceTo(target.position);
        safeWhisper(username, `Walking to you! Distance: ${Math.round(distance)} blocks`);
        
        if (distance > 100) {
          bot.entity.position = target.position.clone();
          safeWhisper(username, "Too far, teleported!");
          return;
        }
        
        bot.setControlState('sprint', true);
        bot.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
        
        const walkInterval = setInterval(() => {
          const currentTarget = bot.players[username]?.entity;
          if (!currentTarget) {
            clearInterval(walkInterval);
            bot.setControlState('sprint', false);
            return;
          }
          
          const currentDistance = bot.entity.position.distanceTo(currentTarget.position);
          
          if (currentDistance <= 2) {
            clearInterval(walkInterval);
            bot.setControlState('sprint', false);
            bot.pathfinder.setGoal(null);
            bot.clearControlStates();
            safeWhisper(username, "Arrived!");
            return;
          }
          
          bot.pathfinder.setGoal(new goals.GoalNear(currentTarget.position.x, currentTarget.position.y, currentTarget.position.z, 2), true);
          
          if (!bot.pathfinder.isMoving()) {
            bot.setControlState('jump', true);
            bot.setControlState('forward', true);
            setTimeout(() => {
              bot.setControlState('jump', false);
              bot.setControlState('forward', false);
            }, 400);
          }
          
          const blockInFront = bot.blockAt(bot.entity.position.offset(0, 1, 0));
          if (blockInFront && blockInFront.name !== 'air' && bot.canDigBlock(blockInFront)) {
            bot.dig(blockInFront).catch(() => {});
          }
        }, 400);
        return;
      }
      
      if (command === '!dig') {
        const block = bot.blockAtCursor(10);
        if (block && bot.canDigBlock(block)) {
          bot.lookAt(block.position);
          bot.dig(block).then(() => {
            safeWhisper(username, `Dug ${block.name}`);
          }).catch(() => {
            safeWhisper(username, "Dig failed, relogging...");
            bot.end('Dig failed');
          });
        } else {
          safeWhisper(username, "No block in view");
        }
        return;
      }
      
      if (command === '!mine') {
        if (args[1] === 'stop') {
          mineBlock = null;
          safeWhisper(username, "Mining stopped");
        } else if (args[1]) {
          mineBlock = args.slice(1).join('_');
          safeWhisper(username, `Mining all ${mineBlock}!`);
        }
        return;
      }
      
      if (command === '!stopmine') { mineBlock = null; safeWhisper(username, "Mining stopped"); return; }
      
      if (command === '!textspam') {
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
        if (targetName && text) {
          textSpamInterval = setInterval(() => safeWhisper(targetName, text), 1000);
          safeWhisper(username, `Spamming ${targetName} every 1s`);
        }
        return;
      }
      
      if (command === '!spamprivmsg') {
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
        if (targetName && text) {
          spamPrivateInterval = setInterval(() => safeWhisper(targetName, text), 1000);
          safeWhisper(username, `Spamming ${targetName}`);
        }
        return;
      }
      
      if (command === '!stoptextspam') {
        if (textSpamInterval) { clearInterval(textSpamInterval); textSpamInterval = null; }
        if (spamPrivateInterval) { clearInterval(spamPrivateInterval); spamPrivateInterval = null; }
        return;
      }
      
      if (command === '!click') {
        const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 6);
        if (target) {
          bot.lookAt(target.position.offset(0, target.height, 0));
          bot.attack(target);
          safeWhisper(username, `Clicked ${target.name || 'entity'}!`);
        } else {
          safeWhisper(username, "Nothing nearby");
        }
        return;
      }
      
      if (command === '!skydrivebot') {
        bot.chat('/effect give ' + bot.username + ' minecraft:levitation 10 100');
        setTimeout(() => bot.chat('/effect clear ' + bot.username + ' minecraft:levitation'), 10000);
        safeWhisper(username, "Bot flying fast!");
        return;
      }
      
      if (command === '!skydriveplayers') {
        const targetName = args[1];
        if (targetName) {
          bot.chat('/effect give ' + targetName + ' minecraft:levitation 10 100');
          setTimeout(() => bot.chat('/effect clear ' + targetName + ' minecraft:levitation'), 10000);
        } else {
          Object.keys(bot.players).forEach(p => {
            if (p !== bot.username) {
              bot.chat('/effect give ' + p + ' minecraft:levitation 10 100');
              setTimeout(() => bot.chat('/effect clear ' + p + ' minecraft:levitation'), 10000);
            }
          });
        }
        safeWhisper(username, "Players flying!");
        return;
      }
      
      if (command === '!healthgen') {
        bot.chat('/effect give ' + bot.username + ' minecraft:instant_health 1 255');
        bot.chat('/effect give ' + bot.username + ' minecraft:regeneration 10 255');
        safeWhisper(username, "Insta-healed!");
        return;
      }
      
      if (command === '!tntrain') {
        const target = bot.players[args[1]]?.entity;
        if (target) {
          safeWhisper(username, `TNT raining on ${args[1]}!`);
          let count = 0;
          const tntInterval = setInterval(() => {
            if (count >= 100) { clearInterval(tntInterval); return; }
            bot.chat(`/summon tnt ${Math.round(target.position.x + (Math.random()-0.5)*4)} ${Math.round(target.position.y + 15)} ${Math.round(target.position.z + (Math.random()-0.5)*4)}`);
            count++;
          }, 50);
        }
        return;
      }
      
      if (command === '!stopserver') { bot.chat('/stop'); safeWhisper(username, "Stopping server!"); return; }
      
      if (command === '!flee') {
        const distance = parseInt(args[1]) || 20;
        const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
        if (hostile) {
          const away = bot.entity.position.minus(hostile.position).normalize().scale(distance).plus(bot.entity.position);
          bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1), true);
          safeWhisper(username, `Fleeing ${distance} blocks!`);
        }
        return;
      }
      
      if (command === '!unsneak') { bot.setControlState('sneak', false); safeWhisper(username, "Standing up"); return; }
      if (command === '!sneak') { bot.setControlState('sneak', true); return; }
      
      if (command === '!lookatfollow') {
        const targetName = args[1] || username;
        const target = bot.players[targetName]?.entity;
        if (target) {
          followTarget = targetName;
          bot.lookAt(target.position.offset(0, target.height, 0));
          safeWhisper(username, `Looking at and following ${targetName}`);
        }
        return;
      }
      
      if (command === '!equip') {
        const itemName = args.slice(1).join('_').toLowerCase();
        const item = bot.inventory.items().find(i => i.name.toLowerCase().includes(itemName));
        if (item) {
          bot.equip(item, 'hand').then(() => safeWhisper(username, `Equipped ${item.name}`)).catch(() => {
            safeWhisper(username, "Equip failed, relogging...");
            bot.end('Equip failed');
          });
        }
        return;
      }
      
      if (command === '!blockinfo') {
        const block = bot.blockAtCursor(5);
        if (block) {
          safeWhisper(username, `Block: ${block.name} | Position: ${block.position} | Hardness: ${block.hardness || 'N/A'} | Diggable: ${bot.canDigBlock(block)}`);
        }
        return;
      }
      
      if (command === '!wander') {
        wanderMode = { radius: parseInt(args[1]) || 10, origin: bot.entity.position.clone() };
        safeWhisper(username, "Wandering!");
        return;
      }
      
      if (command === '!stopwander') { wanderMode = false; bot.pathfinder.setGoal(null); safeWhisper(username, "Stopped wandering"); return; }
      
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (bot.players[targetName]) {
          followTarget = targetName; huntTarget = null; attackTarget = null;
          safeWhisper(username, `Following ${targetName} (walking)`);
        }
        return;
      }
      
      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if (!isNaN(x)) {
          followTarget = null;
          bot.setControlState('sprint', true);
          bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
          safeWhisper(username, `Sprinting to ${x}, ${y}, ${z}`);
          
          const gotoCheck = setInterval(() => {
            const pos = bot.entity.position;
            const dist = Math.sqrt((pos.x - x) ** 2 + (pos.z - z) ** 2);
            if (dist <= 2) {
              clearInterval(gotoCheck);
              bot.setControlState('sprint', false);
              bot.pathfinder.setGoal(null);
              bot.clearControlStates();
              safeWhisper(username, "Arrived at destination!");
            }
          }, 500);
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
      
      if (command === '!attackmobs') { attackMobs = !attackMobs; return; }
      if (command === '!protect') { protectMode = !protectMode; return; }
      if (command === '!kick') { if (args[1]) bot.chat('/kick ' + args[1]); return; }
      if (command === '!survival' || command === '!survial') { bot.chat('/gamemode survival'); return; }
      if (command === '!creative') { bot.chat('/gamemode creative'); return; }
      if (command === '!msg') { if (args[1] && args[2]) safeWhisper(args[1], args.slice(2).join(' ')); return; }
      if (command === '!talk') { if (args[1]) bot.chat(args.slice(1).join(' ')); return; }
      if (command === '!shout') { if (args[1]) bot.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
      if (command === '!leakcoords') {
        const target = bot.players[args[1]]?.entity;
        if (target) bot.chat(`${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
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
      if (command === '!place') {
        const item = bot.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        const ref = bot.blockAtCursor(5);
        if (item && ref) bot.equip(item, 'hand').then(() => bot.placeBlock(ref, {x:0,y:1,z:0})).catch(() => {});
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
      if (command === '!freeze') {
        freezeMode = !freezeMode;
        if (freezeMode) { bot.pathfinder.setGoal(null); bot.clearControlStates(); }
        return;
      }
      if (command === '!activate') {
        const block = bot.blockAtCursor(5);
        if (block) bot.activateBlock(block);
        return;
      }
      if (command === '!break') {
        if (args[1] === 'stop') { autoBreakBlock = null; } else { autoBreakBlock = args.slice(1).join('_'); }
        return;
      }
      if (command === '!sleeptest') { const bed = bot.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 16 }); if (bed) bot.sleep(bed).catch(() => {}); return; }
      
    } catch (e) {
      safeWhisper(username, "Command failed, relogging to try again...");
      addConsoleLog('Command error: ' + e.message);
      lastCommand = message;
      lastCommandUser = username;
      setTimeout(() => {
        bot.end('Command failed - relogging');
      }, 500);
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
