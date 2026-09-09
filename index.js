const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'node-sg-free-01.tickhosting.com', port: 50838, version: '1.20.1', auth: 'offline' };

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';

// Two bot configurations
const botConfigs = [
  { username: 'CloudAFK_Bot1', config },
  { username: 'CloudAFK_Bot2', config }
];

let bots = {}; // Store multiple bots
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};
let reconnectAttempts = {};
let lastCommand = null;
let lastCommandUser = null;

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Website started on port ' + PORT);
  // Create both bots
  botConfigs.forEach(botConfig => createBot(botConfig.username));
});

function createBot(botUsername) {
  const botConfig = { ...config, username: botUsername };
  let bot;
  
  try {
    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    botStatus[botUsername] = 'connecting';
    addConsoleLog(`${botUsername} connecting...`);

    bot.on('spawn', () => {
      botStatus[botUsername] = 'online';
      reconnectAttempts[botUsername] = 0;
      addConsoleLog(`${botUsername} joined!`);
      
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
      defaultMove.blocksToAvoid = new Set(['lava', 'water', 'fire', 'cactus']);
      
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.enablePathShortcuts = true;
      bot.pathfinder.thinkTimeout = 20;

      // Store bot-specific variables
      bot.followTarget = null;
      bot.attackTarget = null;
      bot.huntTarget = null;
      bot.mineBlock = null;
      bot.attackMobs = false;
      bot.protectMode = false;
      bot.freezeMode = false;
      bot.wanderMode = false;
      bot.attachTarget = null;
      bot.attachType = null;
      bot.autoBreakBlock = null;
      bot.textSpamInterval = null;
      bot.spamPrivateInterval = null;

      // Auto-mine loop for this bot
      setInterval(() => {
        if (bot.mineBlock && !bot.freezeMode) {
          const blocks = bot.findBlocks({
            matching: b => b.name && b.name.toLowerCase().includes(bot.mineBlock.toLowerCase()),
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

      // Attack mobs loop
      setInterval(() => {
        if (bot.attackMobs && !bot.freezeMode) {
          const target = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'monster' || e.type === 'hostile' || e.type === 'player') && e !== bot.entity);
          if (target && bot.entity.position.distanceTo(target.position) < 8) {
            bot.lookAt(target.position.offset(0, target.height, 0));
            bot.attack(target);
          }
        }
      }, 300);

      // Follow loop
      setInterval(() => {
        if (bot.followTarget && !bot.freezeMode) {
          const target = bot.players[bot.followTarget]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            const heightDiff = target.position.y - bot.entity.position.y;
            
            if (distance > 3) {
              bot.setControlState('sprint', true);
              bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
              
              if (heightDiff > 2 && !bot.pathfinder.isMoving()) {
                buildUp(bot);
              }
              
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

      // Stuck detector
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
          } else if (stuckCount >= 6) {
            if (bot.followTarget && bot.players[bot.followTarget]?.entity) {
              buildUp(bot);
            }
            bot.setControlState('jump', true);
            setTimeout(() => bot.setControlState('jump', false), 800);
          }
        } else {
          stuckCount = 0;
        }
        lastPos = pos.clone();
      }, 400);
    });

    bot.on('message', (jsonMsg) => {
      addMCConsoleLog(`[${botUsername}] ${jsonMsg.toString()}`);
    });

    bot.on('error', (err) => {
      addConsoleLog(`${botUsername} Error: ${err.message}`);
      botStatus[botUsername] = 'error';
    });

    bot.on('kicked', (reason) => {
      addConsoleLog(`${botUsername} Kicked: ${reason}`);
      botStatus[botUsername] = 'kicked';
    });

    bot.on('end', (reason) => {
      botStatus[botUsername] = 'offline';
      addConsoleLog(`${botUsername} disconnected: ${reason}`);
      reconnectAttempts[botUsername] = (reconnectAttempts[botUsername] || 0) + 1;
      const delay = Math.min(2000 * reconnectAttempts[botUsername], 10000);
      setTimeout(() => createBot(botUsername), delay);
    });

  } catch (e) {
    addConsoleLog(`${botUsername} Failed: ${e.message}`);
    setTimeout(() => createBot(botUsername), 3000);
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

  function buildUp(botInstance) {
    try {
      const placeableBlock = botInstance.inventory.items().find(item => 
        item.name.includes('dirt') || 
        item.name.includes('cobblestone') || 
        item.name.includes('stone') || 
        item.name.includes('planks') || 
        item.name.includes('sand') || 
        item.name.includes('gravel') ||
        item.name.includes('netherrack')
      );
      
      if (placeableBlock) {
        botInstance.equip(placeableBlock, 'hand').then(() => {
          const refBlock = botInstance.blockAt(botInstance.entity.position.offset(0, -1, 0));
          if (refBlock) {
            botInstance.placeBlock(refBlock, { x: 0, y: 1, z: 0 }).then(() => {
              botInstance.setControlState('jump', true);
              setTimeout(() => botInstance.setControlState('jump', false), 300);
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    } catch (e) {}
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m ${s%60}s`;
  }

  function safeWhisper(botInstance, target, text) {
    try { botInstance.whisper(target, text); } catch (e) {}
  }

  function showCmdList(botInstance, username) {
    const lines = [
      `=== CLOUDAFK BOT (${botInstance.username}) ===`,
      "Owner: " + myUsername.join(', '),
      "",
      "INFO: !coords !status !info !players !nearbyplayers !nearbymobs !health [p] !whereis [p] !leakcoords [p] !exp !gamemode !uptime",
      "",
      "MOVEMENT: !come !follow [p] !goto x y z !wander !stopwander !attachplayer [p] !attachmob !jump !stop !tpbring !tp [p] !call !skydrivebot !skydriveplayers [p] !lookatfollow [p] !flee [distance]",
      "",
      "COMBAT: !attack [p] !hunt [p] !protect !killbot !kick [p] !attackmobs !tntrain [p] !stopserver !healthgen",
      "",
      "ACTIONS: !talk [msg] !shout [msg] !msg [p] [msg] !textspam [p] [msg] !spamprivmsg [p] [msg] !stoptextspam !click !sneak !unsneak !activate !survival !creative",
      "",
      "BUILDING: !place [item] !dig !mine [block] !stopmine !collect [block] [amt] !blockinfo",
      "",
      "INVENTORY: !drop !dropall !equip [item] !armor",
      "",
      "FUN: !echo [msg] !ping !spin",
      "",
      "BOT CONTROL: !bot1 (control bot1) !bot2 (control bot2)"
    ];
    lines.forEach((line, i) => setTimeout(() => safeWhisper(botInstance, username, line), i * 75));
  }

  function handleCommand(username, message) {
    if (!myUsername.includes(username.toLowerCase())) {
      safeWhisper(bot, username, "Access denied.");
      return;
    }

    const args = message.trim().split(' ');
    const command = args[0]?.toLowerCase();

    // Bot selection commands
    if (command === '!bot1') {
      // Switch active bot to bot1
      activeBot = 'CloudAFK_Bot1';
      safeWhisper(bot, username, "Now controlling Bot1!");
      return;
    }
    if (command === '!bot2') {
      activeBot = 'CloudAFK_Bot2';
      safeWhisper(bot, username, "Now controlling Bot2!");
      return;
    }

    // Determine which bot to control
    let activeBotInstance = bot;
    if (activeBot === 'CloudAFK_Bot2' && bots['CloudAFK_Bot2']) {
      activeBotInstance = bots['CloudAFK_Bot2'];
    }

    try {
      if (command === '!cmdlist' || command === '!help') { showCmdList(activeBotInstance, username); return; }
      if (command === '!coords') { const p = activeBotInstance.entity.position; safeWhisper(activeBotInstance, username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeWhisper(activeBotInstance, username, `HP:${activeBotInstance.health}/20 Food:${activeBotInstance.food}/20`); return; }
      if (command === '!players') { safeWhisper(activeBotInstance, username, `Online: ${Object.keys(activeBotInstance.players).join(', ')}`); return; }
      if (command === '!jump') { activeBotInstance.setControlState('jump', true); setTimeout(() => activeBotInstance.setControlState('jump', false), 500); return; }
      
      if (command === '!stop') {
        activeBotInstance.pathfinder.setGoal(null); activeBotInstance.clearControlStates();
        activeBotInstance.followTarget = null; activeBotInstance.attackTarget = null; activeBotInstance.huntTarget = null;
        activeBotInstance.protectMode = false; activeBotInstance.wanderMode = false; activeBotInstance.attackMobs = false; activeBotInstance.mineBlock = null;
        if (activeBotInstance.textSpamInterval) { clearInterval(activeBotInstance.textSpamInterval); activeBotInstance.textSpamInterval = null; }
        if (activeBotInstance.spamPrivateInterval) { clearInterval(activeBotInstance.spamPrivateInterval); activeBotInstance.spamPrivateInterval = null; }
        safeWhisper(activeBotInstance, username, "Stopped all.");
        return;
      }
      
      if (command === '!killbot') { activeBotInstance.chat('/kill'); safeWhisper(activeBotInstance, username, "Killing bot!"); return; }
      
      if (command === '!tpbring') {
        activeBotInstance.chat(`/tp ${activeBotInstance.username} ${username}`);
        const player = activeBotInstance.players[username];
        if (player?.entity?.position) {
          activeBotInstance.entity.position = player.entity.position.clone();
        }
        safeWhisper(activeBotInstance, username, "Teleporting bot to you!");
        return;
      }
      
      if (command === '!tp') {
        const targetName = args[1];
        if (!targetName) return safeWhisper(activeBotInstance, username, "Use: !tp [playername]");
        const player = activeBotInstance.players[targetName];
        if (player?.entity?.position) {
          activeBotInstance.entity.position = player.entity.position.clone();
          safeWhisper(activeBotInstance, username, `Teleported to ${targetName}!`);
        } else {
          activeBotInstance.chat(`/tp ${activeBotInstance.username} ${targetName}`);
          safeWhisper(activeBotInstance, username, `Teleporting to ${targetName}...`);
        }
        return;
      }
      
      if (command === '!call') {
        const pos = activeBotInstance.entity.position;
        activeBotInstance.chat(`/tp ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        safeWhisper(activeBotInstance, username, "Teleporting you to bot!");
        return;
      }
      
      if (command === '!come') {
        activeBotInstance.followTarget = null; activeBotInstance.huntTarget = null;
        const target = activeBotInstance.players[username]?.entity;
        if (!target) {
          safeWhisper(activeBotInstance, username, "Can't see you. Try !tpbring to teleport.");
          return;
        }
        
        const distance = activeBotInstance.entity.position.distanceTo(target.position);
        safeWhisper(activeBotInstance, username, `Walking to you! Distance: ${Math.round(distance)} blocks`);
        
        if (distance > 100) {
          activeBotInstance.entity.position = target.position.clone();
          safeWhisper(activeBotInstance, username, "Too far, teleported!");
          return;
        }
        
        activeBotInstance.setControlState('sprint', true);
        activeBotInstance.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
        
        const walkInterval = setInterval(() => {
          const currentTarget = activeBotInstance.players[username]?.entity;
          if (!currentTarget) {
            clearInterval(walkInterval);
            activeBotInstance.setControlState('sprint', false);
            return;
          }
          
          const currentDistance = activeBotInstance.entity.position.distanceTo(currentTarget.position);
          const heightDiff = currentTarget.position.y - activeBotInstance.entity.position.y;
          
          if (currentDistance <= 2 && Math.abs(heightDiff) <= 1) {
            clearInterval(walkInterval);
            activeBotInstance.setControlState('sprint', false);
            activeBotInstance.pathfinder.setGoal(null);
            activeBotInstance.clearControlStates();
            safeWhisper(activeBotInstance, username, "Arrived!");
            return;
          }
          
          if (heightDiff > 2) {
            buildUp(activeBotInstance);
          }
          
          activeBotInstance.pathfinder.setGoal(new goals.GoalNear(currentTarget.position.x, currentTarget.position.y, currentTarget.position.z, 2), true);
          
          if (!activeBotInstance.pathfinder.isMoving()) {
            activeBotInstance.setControlState('jump', true);
            activeBotInstance.setControlState('forward', true);
            setTimeout(() => {
              activeBotInstance.setControlState('jump', false);
              activeBotInstance.setControlState('forward', false);
            }, 400);
          }
        }, 400);
        return;
      }
      
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (activeBotInstance.players[targetName]) {
          activeBotInstance.followTarget = targetName;
          safeWhisper(activeBotInstance, username, `Following ${targetName}!`);
        }
        return;
      }
      
      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if (!isNaN(x)) {
          activeBotInstance.followTarget = null;
          activeBotInstance.setControlState('sprint', true);
          activeBotInstance.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
          safeWhisper(activeBotInstance, username, `Going to ${x}, ${y}, ${z}`);
        }
        return;
      }
      
      if (command === '!dig') {
        const block = activeBotInstance.blockAtCursor(10);
        if (block && activeBotInstance.canDigBlock(block)) {
          activeBotInstance.lookAt(block.position);
          activeBotInstance.dig(block).catch(() => {});
          safeWhisper(activeBotInstance, username, `Digging ${block.name}`);
        }
        return;
      }
      
      if (command === '!mine') {
        if (args[1] === 'stop') {
          activeBotInstance.mineBlock = null;
        } else if (args[1]) {
          activeBotInstance.mineBlock = args.slice(1).join('_');
          safeWhisper(activeBotInstance, username, `Mining ${activeBotInstance.mineBlock}!`);
        }
        return;
      }
      
      if (command === '!stopmine') { activeBotInstance.mineBlock = null; return; }
      
      if (command === '!attack') {
        if (args[1] && activeBotInstance.players[args[1]]) {
          activeBotInstance.attackTarget = args[1];
          activeBotInstance.followTarget = null;
          safeWhisper(activeBotInstance, username, `Attacking ${args[1]}!`);
        }
        return;
      }
      
      if (command === '!hunt') {
        if (args[1] && activeBotInstance.players[args[1]]) {
          activeBotInstance.huntTarget = args[1];
          safeWhisper(activeBotInstance, username, `Hunting ${args[1]}!`);
        }
        return;
      }
      
      if (command === '!attackmobs') { activeBotInstance.attackMobs = !activeBotInstance.attackMobs; return; }
      if (command === '!protect') { activeBotInstance.protectMode = !activeBotInstance.protectMode; return; }
      if (command === '!kick') { if (args[1]) activeBotInstance.chat('/kick ' + args[1]); return; }
      if (command === '!survival' || command === '!survial') { activeBotInstance.chat('/gamemode survival'); return; }
      if (command === '!creative') { activeBotInstance.chat('/gamemode creative'); return; }
      if (command === '!msg') { if (args[1] && args[2]) safeWhisper(activeBotInstance, args[1], args.slice(2).join(' ')); return; }
      if (command === '!talk') { if (args[1]) activeBotInstance.chat(args.slice(1).join(' ')); return; }
      if (command === '!shout') { if (args[1]) activeBotInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
      if (command === '!skydrivebot') { activeBotInstance.chat('/effect give ' + activeBotInstance.username + ' minecraft:levitation 10 100'); return; }
      if (command === '!skydriveplayers') {
        const targetName = args[1];
        if (targetName) {
          activeBotInstance.chat('/effect give ' + targetName + ' minecraft:levitation 10 100');
        } else {
          Object.keys(activeBotInstance.players).forEach(p => {
            if (p !== activeBotInstance.username) activeBotInstance.chat('/effect give ' + p + ' minecraft:levitation 10 100');
          });
        }
        return;
      }
      if (command === '!healthgen') { activeBotInstance.chat('/effect give ' + activeBotInstance.username + ' minecraft:instant_health 1 255'); return; }
      if (command === '!tntrain') {
        const target = activeBotInstance.players[args[1]]?.entity;
        if (target) {
          let count = 0;
          const tntInterval = setInterval(() => {
            if (count >= 100) { clearInterval(tntInterval); return; }
            activeBotInstance.chat(`/summon tnt ${Math.round(target.position.x)} ${Math.round(target.position.y + 15)} ${Math.round(target.position.z)}`);
            count++;
          }, 50);
        }
        return;
      }
      if (command === '!stopserver') { activeBotInstance.chat('/stop'); return; }
      if (command === '!leakcoords') {
        const target = activeBotInstance.players[args[1]]?.entity;
        if (target) activeBotInstance.chat(`${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!armor') {
        const armor = activeBotInstance.inventory.items().filter(i => i.name.includes('helmet') || i.name.includes('chestplate') || i.name.includes('leggings') || i.name.includes('boots'));
        armor.forEach(item => {
          try {
            if (item.name.includes('helmet')) activeBotInstance.equip(item, 'head');
            if (item.name.includes('chestplate')) activeBotInstance.equip(item, 'torso');
            if (item.name.includes('leggings')) activeBotInstance.equip(item, 'legs');
            if (item.name.includes('boots')) activeBotInstance.equip(item, 'feet');
          } catch (e) {}
        });
        return;
      }
      if (command === '!attachplayer') {
        if (args[1] && activeBotInstance.players[args[1]]) {
          activeBotInstance.attachTarget = args[1];
          activeBotInstance.attackTarget = args[1];
        }
        return;
      }
      if (command === '!attachmob') {
        const mob = activeBotInstance.nearestEntity(e => e.type === 'mob' || e.type === 'monster');
        if (mob) activeBotInstance.attachTarget = mob.id;
        return;
      }
      if (command === '!drop') { const h = activeBotInstance.heldItem; if (h) activeBotInstance.tossStack(h); return; }
      if (command === '!dropall') { activeBotInstance.inventory.items().forEach(i => activeBotInstance.tossStack(i).catch(() => {})); return; }
      if (command === '!equip') {
        const item = activeBotInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        if (item) activeBotInstance.equip(item, 'hand').catch(() => {});
        return;
      }
      if (command === '!place') {
        const item = activeBotInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        const ref = activeBotInstance.blockAtCursor(5);
        if (item && ref) activeBotInstance.equip(item, 'hand').then(() => activeBotInstance.placeBlock(ref, {x:0,y:1,z:0})).catch(() => {});
        return;
      }
      if (command === '!collect') {
        const targets = activeBotInstance.findBlocks({ matching: b => b.name.includes(args[1] || ''), maxDistance: 32, count: parseInt(args[2]) || 1 });
        targets.forEach(pos => {
          const block = activeBotInstance.blockAt(pos);
          if (block && activeBotInstance.canDigBlock(block)) activeBotInstance.dig(block).catch(() => {});
        });
        return;
      }
      if (command === '!blockinfo') { const b = activeBotInstance.blockAtCursor(5); if (b) safeWhisper(activeBotInstance, username, `Block: ${b.name}`); return; }
      if (command === '!nearbyplayers') {
        const list = Object.values(activeBotInstance.players).filter(p => p.entity && p.username !== activeBotInstance.username).map(p => p.username);
        safeWhisper(activeBotInstance, username, list.length ? `Nearby: ${list.join(', ')}` : "No players");
        return;
      }
      if (command === '!nearbymobs') {
        const mobs = Object.values(activeBotInstance.entities).filter(e => e.type === 'mob' && e !== activeBotInstance.entity).map(e => e.name || 'mob');
        safeWhisper(activeBotInstance, username, mobs.length ? `Mobs: ${mobs.join(', ')}` : "No mobs");
        return;
      }
      if (command === '!health') {
        const target = activeBotInstance.players[args[1]]?.entity || activeBotInstance.players[username]?.entity;
        if (target) safeWhisper(activeBotInstance, username, `HP: ${target.health || 'unknown'}`);
        return;
      }
      if (command === '!whereis') {
        const target = activeBotInstance.players[args[1]]?.entity;
        if (target) safeWhisper(activeBotInstance, username, `${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!exp') { safeWhisper(activeBotInstance, username, `XP: ${activeBotInstance.experience.level}`); return; }
      if (command === '!gamemode') { safeWhisper(activeBotInstance, username, `Gamemode: ${activeBotInstance.game.gameMode}`); return; }
      if (command === '!uptime') { safeWhisper(activeBotInstance, username, `Uptime: ${fmtTime(Date.now() - spawnTime)}`); return; }
      if (command === '!echo') { safeWhisper(activeBotInstance, username, args.slice(1).join(' ')); return; }
      if (command === '!ping') { safeWhisper(activeBotInstance, username, `Ping: ${activeBotInstance.player?.ping || 'unknown'}ms`); return; }
      if (command === '!spin') {
        let yaw = activeBotInstance.entity.yaw;
        const interval = setInterval(() => {
          yaw += Math.PI / 4;
          activeBotInstance.look(yaw, activeBotInstance.entity.pitch, true);
          if (yaw >= activeBotInstance.entity.yaw + Math.PI * 2) clearInterval(interval);
        }, 100);
        return;
      }
      if (command === '!freeze') {
        activeBotInstance.freezeMode = !activeBotInstance.freezeMode;
        if (activeBotInstance.freezeMode) { activeBotInstance.pathfinder.setGoal(null); activeBotInstance.clearControlStates(); }
        return;
      }
      if (command === '!activate') {
        const block = activeBotInstance.blockAtCursor(5);
        if (block) activeBotInstance.activateBlock(block);
        return;
      }
      if (command === '!break') {
        if (args[1] === 'stop') { activeBotInstance.autoBreakBlock = null; } else { activeBotInstance.autoBreakBlock = args.slice(1).join('_'); }
        return;
      }
      if (command === '!sleeptest') { const bed = activeBotInstance.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 16 }); if (bed) activeBotInstance.sleep(bed).catch(() => {}); return; }
      if (command === '!textspam') {
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (activeBotInstance.textSpamInterval) { clearInterval(activeBotInstance.textSpamInterval); activeBotInstance.textSpamInterval = null; }
        if (targetName && text) {
          activeBotInstance.textSpamInterval = setInterval(() => safeWhisper(activeBotInstance, targetName, text), 1000);
        }
        return;
      }
      if (command === '!stoptextspam') {
        if (activeBotInstance.textSpamInterval) { clearInterval(activeBotInstance.textSpamInterval); activeBotInstance.textSpamInterval = null; }
        if (activeBotInstance.spamPrivateInterval) { clearInterval(activeBotInstance.spamPrivateInterval); activeBotInstance.spamPrivateInterval = null; }
        return;
      }
      
    } catch (e) {
      safeWhisper(bot, username, "Command failed: " + e.message);
    }
  }

  bot.on('whisper', (username, message) => handleCommand(username, message));
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!')) handleCommand(username, message);
  });
}

let activeBot = 'CloudAFK_Bot1'; // Default active bot

// Website
app.get('/', (req, res) => {
  let botStatuses = Object.keys(botStatus).map(name => `${name}: ${botStatus[name]}`).join('<br>');
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>CloudAFK Bots</title>
      <meta http-equiv="refresh" content="5">
      <style>
        body { font-family: Arial; background: #1a1a2e; color: white; padding: 20px; }
        h1 { color: #4CAF50; text-align: center; }
        .card { background: #16213e; padding: 20px; border-radius: 10px; text-align: center; margin: 10px 0; }
        .value { font-size: 1.5em; color: #4CAF50; font-weight: bold; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 200px; overflow-y: auto; margin: 10px 0; }
        .log { font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bots Dashboard</h1>
      <div class="card"><h3>Bot Status</h3><div class="value">${botStatuses}</div></div>
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
