const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'node-sg-free-01.tickhosting.com', port: 50838, version: '1.20.1', auth: 'offline' };

const myUsername = ['tcl', 'friend1', 'friend2', 'friend3', 'friend4', 'friend5'];
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';

// Generate bot configs - change 10 to 100 for 100 bots
const NUMBER_OF_BOTS = 10;
const botConfigs = [];
for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
  botConfigs.push({ username: `CloudAFK_Bot${i}` });
}

let bots = {};
let consoleLogs = [];
let mcConsoleLogs = [];
let botStatus = {};

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Website started on port ${PORT}`);
  console.log(`Creating ${NUMBER_OF_BOTS} bots...`);
  
  // Create bots with delay to avoid rate limiting
  botConfigs.forEach((botConfig, index) => {
    setTimeout(() => {
      createBot(botConfig.username);
    }, index * 1000); // 1 second delay between each bot
  });
});

function createBot(botUsername) {
  const botConfig = { ...config, username: botUsername };
  let bot;
  
  try {
    bot = mineflayer.createBot(botConfig);
    bot.loadPlugin(pathfinder);
    bots[botUsername] = bot;
    botStatus[botUsername] = 'connecting';
    addConsoleLog(`${botUsername} connecting...`);

    bot.on('spawn', () => {
      botStatus[botUsername] = 'online';
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

      setInterval(() => {
        if (bot.attackMobs && !bot.freezeMode) {
          const target = bot.nearestEntity(e => (e.type === 'mob' || e.type === 'monster' || e.type === 'hostile') && e !== bot.entity);
          if (target && bot.entity.position.distanceTo(target.position) < 8) {
            bot.lookAt(target.position.offset(0, target.height, 0));
            bot.attack(target);
          }
        }
      }, 300);

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

      setInterval(() => {
        if (bot.attackTarget && !bot.freezeMode) {
          const target = bot.players[bot.attackTarget]?.entity;
          if (target) {
            bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
            if (bot.entity.position.distanceTo(target.position) < 3) {
              bot.attack(target);
            }
          }
        }
      }, 300);

      setInterval(() => {
        if (bot.huntTarget && !bot.freezeMode) {
          const target = bot.players[bot.huntTarget]?.entity;
          if (target) {
            const distance = bot.entity.position.distanceTo(target.position);
            if (distance > 30) {
              bot.entity.position = target.position.clone();
            } else {
              bot.pathfinder.setGoal(new goals.GoalFollow(target, 1), true);
              if (distance < 3) {
                bot.attack(target);
              }
            }
          }
        }
      }, 300);

      setInterval(() => {
        if (bot.wanderMode && !bot.freezeMode && !bot.pathfinder.isMoving()) {
          const radius = bot.wanderMode.radius || 10;
          const origin = bot.wanderMode.origin;
          const dx = (Math.random() * 2 - 1) * radius;
          const dz = (Math.random() * 2 - 1) * radius;
          bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
        }
      }, 5000);
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
      setTimeout(() => createBot(botUsername), 5000);
    });

  } catch (e) {
    addConsoleLog(`${botUsername} Failed: ${e.message}`);
    setTimeout(() => createBot(botUsername), 3000);
  }

  function addConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    consoleLogs.push(log);
    if (consoleLogs.length > 200) consoleLogs.shift();
  }

  function addMCConsoleLog(message) {
    const log = `[${new Date().toLocaleTimeString()}] ${message}`;
    mcConsoleLogs.push(log);
    if (mcConsoleLogs.length > 200) mcConsoleLogs.shift();
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
      `Total Bots: ${NUMBER_OF_BOTS}`,
      "Owner: " + myUsername.join(', '),
      "",
      "Use: !command [botname] - Control specific bot",
      "Use: !command all - Control all bots",
      "Example: !come CloudAFK_Bot1",
      "Example: !come all",
      "Example: !talk hello all",
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
      "FUN: !echo [msg] !ping !spin"
    ];
    lines.forEach((line, i) => setTimeout(() => safeWhisper(botInstance, username, line), i * 75));
  }

  function getTargetBots(botArg) {
    if (!botArg || botArg.toLowerCase() === 'all') {
      return Object.values(bots).filter(b => b && botStatus[b.username] === 'online');
    }
    
    const targetBot = bots[botArg];
    if (targetBot && botStatus[botArg] === 'online') {
      return [targetBot];
    }
    
    const matchedBot = Object.values(bots).find(b => 
      b && b.username.toLowerCase().includes(botArg.toLowerCase()) && botStatus[b.username] === 'online'
    );
    
    return matchedBot ? [matchedBot] : [];
  }

  function handleCommand(username, message) {
    if (!myUsername.includes(username.toLowerCase())) {
      safeWhisper(bot, username, "Access denied.");
      return;
    }

    const args = message.trim().split(' ');
    const command = args[0]?.toLowerCase();
    
    let botArg = null;
    const lastArg = args[args.length - 1];
    const botNames = ['all', 'bot1', 'bot2', 'bot3', 'bot4', 'bot5', 'bot6', 'bot7', 'bot8', 'bot9', 'bot10'];
    for (let i = 1; i <= NUMBER_OF_BOTS; i++) {
      botNames.push(`cloudafk_bot${i}`);
    }
    
    if (lastArg && botNames.includes(lastArg.toLowerCase())) {
      botArg = lastArg;
      args.pop();
    }
    
    const targetBots = getTargetBots(botArg);
    
    if (targetBots.length === 0) {
      safeWhisper(bot, username, "No bots online or bot not found.");
      return;
    }

    targetBots.forEach(targetBot => {
      executeCommand(targetBot, username, args, command);
    });
  }

  function executeCommand(botInstance, username, args, command) {
    const botName = botInstance.username;
    
    try {
      if (command === '!cmdlist' || command === '!help') { showCmdList(botInstance, username); return; }
      if (command === '!coords') { const p = botInstance.entity.position; safeWhisper(botInstance, username, `${botName} X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
      if (command === '!status') { safeWhisper(botInstance, username, `${botName} HP:${botInstance.health}/20 Food:${botInstance.food}/20`); return; }
      if (command === '!players') { safeWhisper(botInstance, username, `${botName} Online: ${Object.keys(botInstance.players).join(', ')}`); return; }
      if (command === '!jump') { botInstance.setControlState('jump', true); setTimeout(() => botInstance.setControlState('jump', false), 500); return; }
      
      if (command === '!stop') {
        botInstance.pathfinder.setGoal(null); botInstance.clearControlStates();
        botInstance.followTarget = null; botInstance.attackTarget = null; botInstance.huntTarget = null;
        botInstance.protectMode = false; botInstance.wanderMode = false; botInstance.attackMobs = false; botInstance.mineBlock = null;
        if (botInstance.textSpamInterval) { clearInterval(botInstance.textSpamInterval); botInstance.textSpamInterval = null; }
        if (botInstance.spamPrivateInterval) { clearInterval(botInstance.spamPrivateInterval); botInstance.spamPrivateInterval = null; }
        return;
      }
      
      if (command === '!killbot') { botInstance.chat('/kill'); return; }
      if (command === '!tpbring') {
        botInstance.chat(`/tp ${botInstance.username} ${username}`);
        const player = botInstance.players[username];
        if (player?.entity?.position) botInstance.entity.position = player.entity.position.clone();
        return;
      }
      if (command === '!tp') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) botInstance.entity.position = target.position.clone();
        return;
      }
      if (command === '!call') {
        const pos = botInstance.entity.position;
        botInstance.chat(`/tp ${username} ${Math.round(pos.x)} ${Math.round(pos.y)} ${Math.round(pos.z)}`);
        return;
      }
      if (command === '!come') {
        botInstance.followTarget = null; botInstance.huntTarget = null; botInstance.attackTarget = null;
        const target = botInstance.players[username]?.entity;
        if (!target) return;
        
        const distance = botInstance.entity.position.distanceTo(target.position);
        
        if (distance > 100) {
          botInstance.entity.position = target.position.clone();
          return;
        }
        
        botInstance.setControlState('sprint', true);
        botInstance.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, 2), true);
        
        const walkInterval = setInterval(() => {
          const currentTarget = botInstance.players[username]?.entity;
          if (!currentTarget) { clearInterval(walkInterval); botInstance.setControlState('sprint', false); return; }
          
          const currentDistance = botInstance.entity.position.distanceTo(currentTarget.position);
          const heightDiff = currentTarget.position.y - botInstance.entity.position.y;
          
          if (currentDistance <= 2 && Math.abs(heightDiff) <= 1) {
            clearInterval(walkInterval);
            botInstance.setControlState('sprint', false);
            botInstance.pathfinder.setGoal(null);
            botInstance.clearControlStates();
            return;
          }
          
          if (heightDiff > 2) buildUp(botInstance);
          
          botInstance.pathfinder.setGoal(new goals.GoalNear(currentTarget.position.x, currentTarget.position.y, currentTarget.position.z, 2), true);
          
          if (!botInstance.pathfinder.isMoving()) {
            botInstance.setControlState('jump', true);
            botInstance.setControlState('forward', true);
            setTimeout(() => {
              botInstance.setControlState('jump', false);
              botInstance.setControlState('forward', false);
            }, 400);
          }
        }, 400);
        return;
      }
      if (command === '!follow') {
        const targetName = args[1] || username;
        if (botInstance.players[targetName]) botInstance.followTarget = targetName;
        return;
      }
      if (command === '!goto') {
        const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
        if (!isNaN(x)) {
          botInstance.followTarget = null;
          botInstance.setControlState('sprint', true);
          botInstance.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1), true);
        }
        return;
      }
      if (command === '!dig') {
        const block = botInstance.blockAtCursor(10);
        if (block && botInstance.canDigBlock(block)) {
          botInstance.lookAt(block.position);
          botInstance.dig(block).catch(() => {});
        }
        return;
      }
      if (command === '!mine') {
        if (args[1] === 'stop') { botInstance.mineBlock = null; }
        else if (args[1]) { botInstance.mineBlock = args.slice(1).join('_'); }
        return;
      }
      if (command === '!stopmine') { botInstance.mineBlock = null; return; }
      if (command === '!attack') {
        if (args[1] && botInstance.players[args[1]]) {
          botInstance.attackTarget = args[1];
          botInstance.followTarget = null;
        }
        return;
      }
      if (command === '!hunt') {
        if (args[1] && botInstance.players[args[1]]) {
          botInstance.huntTarget = args[1];
        }
        return;
      }
      if (command === '!attackmobs') { botInstance.attackMobs = !botInstance.attackMobs; return; }
      if (command === '!protect') { botInstance.protectMode = !botInstance.protectMode; return; }
      if (command === '!kick') { if (args[1]) botInstance.chat('/kick ' + args[1]); return; }
      if (command === '!survival' || command === '!survial') { botInstance.chat('/gamemode survival'); return; }
      if (command === '!creative') { botInstance.chat('/gamemode creative'); return; }
      if (command === '!msg') { if (args[1] && args[2]) safeWhisper(botInstance, args[1], args.slice(2).join(' ')); return; }
      if (command === '!talk') { if (args[1]) botInstance.chat(args.slice(1).join(' ')); return; }
      if (command === '!shout') { if (args[1]) botInstance.chat(args.slice(1).join(' ').toUpperCase() + '!!!'); return; }
      if (command === '!skydrivebot') { botInstance.chat('/effect give ' + botInstance.username + ' minecraft:levitation 10 100'); return; }
      if (command === '!skydriveplayers') {
        const targetName = args[1];
        if (targetName) {
          botInstance.chat('/effect give ' + targetName + ' minecraft:levitation 10 100');
        } else {
          Object.keys(botInstance.players).forEach(p => {
            if (p !== botInstance.username) botInstance.chat('/effect give ' + p + ' minecraft:levitation 10 100');
          });
        }
        return;
      }
      if (command === '!healthgen') { botInstance.chat('/effect give ' + botInstance.username + ' minecraft:instant_health 1 255'); return; }
      if (command === '!tntrain') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) {
          let count = 0;
          const tntInterval = setInterval(() => {
            if (count >= 100) { clearInterval(tntInterval); return; }
            botInstance.chat(`/summon tnt ${Math.round(target.position.x)} ${Math.round(target.position.y + 15)} ${Math.round(target.position.z)}`);
            count++;
          }, 50);
        }
        return;
      }
      if (command === '!stopserver') { botInstance.chat('/stop'); return; }
      if (command === '!leakcoords') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) botInstance.chat(`${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!armor') {
        const armor = botInstance.inventory.items().filter(i => i.name.includes('helmet') || i.name.includes('chestplate') || i.name.includes('leggings') || i.name.includes('boots'));
        armor.forEach(item => {
          try {
            if (item.name.includes('helmet')) botInstance.equip(item, 'head');
            if (item.name.includes('chestplate')) botInstance.equip(item, 'torso');
            if (item.name.includes('leggings')) botInstance.equip(item, 'legs');
            if (item.name.includes('boots')) botInstance.equip(item, 'feet');
          } catch (e) {}
        });
        return;
      }
      if (command === '!attachplayer') {
        if (args[1] && botInstance.players[args[1]]) {
          botInstance.attachTarget = args[1];
          botInstance.attackTarget = args[1];
        }
        return;
      }
      if (command === '!attachmob') {
        const mob = botInstance.nearestEntity(e => e.type === 'mob' || e.type === 'monster');
        if (mob) botInstance.attachTarget = mob.id;
        return;
      }
      if (command === '!drop') { const h = botInstance.heldItem; if (h) botInstance.tossStack(h); return; }
      if (command === '!dropall') { botInstance.inventory.items().forEach(i => botInstance.tossStack(i).catch(() => {})); return; }
      if (command === '!equip') {
        const item = botInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        if (item) botInstance.equip(item, 'hand').catch(() => {});
        return;
      }
      if (command === '!place') {
        const item = botInstance.inventory.items().find(i => i.name.includes(args.slice(1).join('_')));
        const ref = botInstance.blockAtCursor(5);
        if (item && ref) botInstance.equip(item, 'hand').then(() => botInstance.placeBlock(ref, {x:0,y:1,z:0})).catch(() => {});
        return;
      }
      if (command === '!collect') {
        const targets = botInstance.findBlocks({ matching: b => b.name.includes(args[1] || ''), maxDistance: 32, count: parseInt(args[2]) || 1 });
        targets.forEach(pos => {
          const block = botInstance.blockAt(pos);
          if (block && botInstance.canDigBlock(block)) botInstance.dig(block).catch(() => {});
        });
        return;
      }
      if (command === '!blockinfo') { const b = botInstance.blockAtCursor(5); if (b) safeWhisper(botInstance, username, `Block: ${b.name}`); return; }
      if (command === '!nearbyplayers') {
        const list = Object.values(botInstance.players).filter(p => p.entity && p.username !== botInstance.username).map(p => p.username);
        safeWhisper(botInstance, username, list.length ? `Nearby: ${list.join(', ')}` : "No players");
        return;
      }
      if (command === '!nearbymobs') {
        const mobs = Object.values(botInstance.entities).filter(e => e.type === 'mob' && e !== botInstance.entity).map(e => e.name || 'mob');
        safeWhisper(botInstance, username, mobs.length ? `Mobs: ${mobs.join(', ')}` : "No mobs");
        return;
      }
      if (command === '!health') {
        const target = botInstance.players[args[1]]?.entity || botInstance.players[username]?.entity;
        if (target) safeWhisper(botInstance, username, `HP: ${target.health || 'unknown'}`);
        return;
      }
      if (command === '!whereis') {
        const target = botInstance.players[args[1]]?.entity;
        if (target) safeWhisper(botInstance, username, `${args[1]}: X:${Math.round(target.position.x)} Y:${Math.round(target.position.y)} Z:${Math.round(target.position.z)}`);
        return;
      }
      if (command === '!exp') { safeWhisper(botInstance, username, `XP: ${botInstance.experience.level}`); return; }
      if (command === '!gamemode') { safeWhisper(botInstance, username, `Gamemode: ${botInstance.game.gameMode}`); return; }
      if (command === '!uptime') { safeWhisper(botInstance, username, `Uptime: ${fmtTime(Date.now() - spawnTime)}`); return; }
      if (command === '!echo') { safeWhisper(botInstance, username, args.slice(1).join(' ')); return; }
      if (command === '!ping') { safeWhisper(botInstance, username, `Ping: ${botInstance.player?.ping || 'unknown'}ms`); return; }
      if (command === '!spin') {
        let yaw = botInstance.entity.yaw;
        const interval = setInterval(() => {
          yaw += Math.PI / 4;
          botInstance.look(yaw, botInstance.entity.pitch, true);
          if (yaw >= botInstance.entity.yaw + Math.PI * 2) clearInterval(interval);
        }, 100);
        return;
      }
      if (command === '!freeze') {
        botInstance.freezeMode = !botInstance.freezeMode;
        if (botInstance.freezeMode) { botInstance.pathfinder.setGoal(null); botInstance.clearControlStates(); }
        return;
      }
      if (command === '!activate') { const block = botInstance.blockAtCursor(5); if (block) botInstance.activateBlock(block); return; }
      if (command === '!break') { if (args[1] === 'stop') { botInstance.autoBreakBlock = null; } else { botInstance.autoBreakBlock = args.slice(1).join('_'); } return; }
      if (command === '!sleeptest') { const bed = botInstance.findBlock({ matching: b => b.name.includes('bed'), maxDistance: 16 }); if (bed) botInstance.sleep(bed).catch(() => {}); return; }
      if (command === '!textspam') {
        const targetName = args[1];
        const text = args.slice(2).join(' ');
        if (botInstance.textSpamInterval) { clearInterval(botInstance.textSpamInterval); botInstance.textSpamInterval = null; }
        if (targetName && text) botInstance.textSpamInterval = setInterval(() => safeWhisper(botInstance, targetName, text), 1000);
        return;
      }
      if (command === '!stoptextspam') {
        if (botInstance.textSpamInterval) { clearInterval(botInstance.textSpamInterval); botInstance.textSpamInterval = null; }
        if (botInstance.spamPrivateInterval) { clearInterval(botInstance.spamPrivateInterval); botInstance.spamPrivateInterval = null; }
        return;
      }
      if (command === '!unsneak') { botInstance.setControlState('sneak', false); return; }
      if (command === '!sneak') { botInstance.setControlState('sneak', true); return; }
      if (command === '!lookatfollow') {
        const targetName = args[1] || username;
        const target = botInstance.players[targetName]?.entity;
        if (target) { botInstance.followTarget = targetName; botInstance.lookAt(target.position.offset(0, target.height, 0)); }
        return;
      }
      if (command === '!wander') { botInstance.wanderMode = { radius: parseInt(args[1]) || 10, origin: botInstance.entity.position.clone() }; return; }
      if (command === '!stopwander') { botInstance.wanderMode = false; botInstance.pathfinder.setGoal(null); return; }
      if (command === '!flee') {
        const distance = parseInt(args[1]) || 20;
        const hostile = botInstance.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
        if (hostile) {
          const away = botInstance.entity.position.minus(hostile.position).normalize().scale(distance).plus(botInstance.entity.position);
          botInstance.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1), true);
        }
        return;
      }
      
    } catch (e) {
      // Silently fail for multi-bot
    }
  }

  bot.on('whisper', (username, message) => handleCommand(username, message));
  bot.on('chat', (username, message) => {
    if (username !== bot.username && message.startsWith('!')) handleCommand(username, message);
  });
}

// Website
app.get('/', (req, res) => {
  const onlineCount = Object.values(botStatus).filter(s => s === 'online').length;
  
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
        .value { font-size: 2em; color: #4CAF50; font-weight: bold; }
        .console { background: #0f3460; padding: 15px; border-radius: 10px; height: 200px; overflow-y: auto; margin: 10px 0; }
        .log { font-family: monospace; font-size: 12px; }
      </style>
    </head>
    <body>
      <h1>CloudAFK Bots Dashboard</h1>
      <div class="card"><h3>Bots Online</h3><div class="value">${onlineCount} / ${NUMBER_OF_BOTS}</div></div>
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
