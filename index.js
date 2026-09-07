const mineflayer = require('mineflayer');
const express = require('express');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const app = express();

const config = { host: 'nbtplace.play.hosting', port: 25565, username: 'CloudAFK_Bot', version: '1.20.1', auth: 'offline' };

const myUsername = 'tcl';
const useAuthPlugin = false;
const accountPassword = 'YourBotPassword123';
let bot, customCommands = {}, defaultMove = null, attachTarget = null, attachType = null, protectMode = false, attackTarget = null, wanderMode = false, spawnTime = null;

function createBot() {
  bot = mineflayer.createBot(config);
  bot.loadPlugin(pathfinder);

  bot.on('spawn', () => {
    console.log(`${bot.username} joined!`);
    spawnTime = Date.now();
    const mcData = require('minecraft-data')(bot.version);
    defaultMove = new Movements(bot, mcData);
    defaultMove.canDig = true;
    defaultMove.allow1by1towers = false;
    defaultMove.allowParkour = true;
    defaultMove.allowSprinting = true;
    bot.pathfinder.setMovements(defaultMove);

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
        if (e) { bot.entity.position = e.position.offset(0, e.height, 0); } else { attachTarget = null; attachType = null; }
      }
    }, 50);

    // Anti-AFK Jump Loop
    setInterval(() => {
      if (!bot.pathfinder.isMoving() && !attachTarget && !wanderMode) {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 500);
      }
    }, 30000);

    // Protect Mode Loop
    setInterval(() => {
      if (!protectMode) return;
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (hostile && bot.entity.position.distanceTo(hostile.position) < 16) {
        bot.pathfinder.setGoal(new goals.GoalFollow(hostile, 2), true);
        if (bot.entity.position.distanceTo(hostile.position) < 3) bot.attack(hostile);
      }
    }, 1000);

    // Attack Mode Loop
    setInterval(() => {
      if (!attackTarget) return;
      const target = bot.players[attackTarget]?.entity;
      if (!target) { bot.chat(`Lost track of ${attackTarget}, stopping attack.`); attackTarget = null; bot.pathfinder.setGoal(null); return; }
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      if (bot.entity.position.distanceTo(target.position) < 3) bot.attack(target);
    }, 1000);

    // Wander Loop
    setInterval(() => {
      if (!wanderMode || bot.pathfinder.isMoving()) return;
      const radius = wanderMode.radius || 10;
      const origin = wanderMode.origin;
      const dx = (Math.random() * 2 - 1) * radius;
      const dz = (Math.random() * 2 - 1) * radius;
      bot.pathfinder.setGoal(new goals.GoalNear(origin.x + dx, origin.y, origin.z + dz, 1));
    }, 8000);

    // Stuck Detector - jumps + pushes forward if bot has an active goal but isn't progressing
    let lastPos = null;
    let stuckTicks = 0;
    setInterval(() => {
      const hasGoal = bot.pathfinder.goal !== null && bot.pathfinder.goal !== undefined;
      if (!hasGoal) { lastPos = null; stuckTicks = 0; return; }

      const pos = bot.entity.position;
      if (lastPos && pos.distanceTo(lastPos) < 0.15) {
        stuckTicks++;
        if (stuckTicks >= 1) {
          bot.setControlState('forward', true);
          bot.setControlState('jump', true);
          setTimeout(() => {
            bot.setControlState('jump', false);
          }, 300);
        }
      } else {
        stuckTicks = 0;
        bot.setControlState('forward', false);
      }
      lastPos = pos.clone();
    }, 500);
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

  function handleCommand(username, message) {
    if (username.toLowerCase() !== myUsername.toLowerCase()) {
      bot.whisper(username, "Access denied.");
      return;
    }

    const msg = message.trim();
    const args = msg.split(' ');
    if (!args || args.length === 0) return;
    const command = args[0].toLowerCase();

    if (command === '!cmds') {
      const sections = [
        "§6§l✦ ═══ CLOUDAFK BOT COMMANDS ═══ ✦",
        "§b▶ Info: §f!coords (location) !status (hp/food) !info (biome/ping) !inventory !players !time !weather !nearbyplayers [r] !nearbymobs [r] !health [p] !whereis [p] !exp !gamemode !uptime !tps",
        "§a▶ Movement: §f!come (to you) !follow [p] !goto x y z !wander [r] !flee !attachplayer [p] !attachmob !jump !stop",
        "§c▶ Combat: §f!attack [p] (hunt+fight) !protect [stop] (guard mode)",
        "§d▶ Actions: §f!talk [msg] !shout [msg] !click !sneak [stop] !activate !lookat [p] !sleeptest",
        "§e▶ Building: §f!place [item] !placeat x y z item !fill item w h d !dig !collect block amt !blockinfo",
        "§9▶ Inventory: §f!drop !dropall !hand !equip [item]",
        "§5▶ Fun: §f!echo msg !ping [p] !spin !emote wave/sit/stand !8ball q !coinflip !roll [sides]",
        "§7▶ Sandbox: §f!addcmd !name reply !delcmd !name !listcmds !clean",
        "§6§l✦ Type !help for category shortcuts ✦"
      ];
      sections.forEach((line, i) => {
        setTimeout(() => bot.whisper(username, line), i * 150);
      });
      return;
    }

    if (command === '!help') { bot.whisper(username, "Modules: !help1(Info) !help2(Move) !help3(Act) !help4(Inv) !help5(Sandbox) !help6(Build) !help7(Fun) !help8(Combat)"); return; }
    if (command === '!help1') { bot.whisper(username, "Info: !coords !status !info !inventory !players !time !weather !nearbyplayers !nearbymobs !health !tps !whereis !exp !gamemode !uptime"); return; }
    if (command === '!help2') { bot.whisper(username, "Move: !jump !come !follow !protect !lookat !attachplayer !attachmob !stop !goto !wander !flee"); return; }
    if (command === '!help3') { bot.whisper(username, "Act: !talk !shout !click !sneak !activate !sleeptest"); return; }
    if (command === '!help4') { bot.whisper(username, "Inv: !drop !dropall !hand !equip"); return; }
    if (command === '!help5') { bot.whisper(username, "Sandbox: !addcmd !delcmd !listcmds !clean"); return; }
    if (command === '!help6') { bot.whisper(username, "Build: !place !placeat !fill !dig !collect !blockinfo"); return; }
    if (command === '!help7') { bot.whisper(username, "Fun: !echo !ping !spin !emote !8ball !coinflip !roll"); return; }
    if (command === '!help8') { bot.whisper(username, "Combat: !attack !protect !flee"); return; }

    if (command === '!coords') { const p = bot.entity.position; bot.whisper(username, `X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`); return; }
    if (command === '!status') { bot.whisper(username, `HP:${bot.health}/20 | Food:${bot.food}/20`); return; }
    if (command === '!info') { bot.whisper(username, `Biome:${bot.blockAt(bot.entity.position)?.biome.name} | Ping:${bot.player.ping}ms`); return; }
    if (command === '!inventory') { const items = bot.inventory.items().map(i => `${i.name} x${i.count}`).join(', '); bot.whisper(username, items ? `Holding: ${items}` : "Empty"); return; }
    if (command === '!players') { bot.whisper(username, `Online: ${Object.keys(bot.players).join(', ').substring(0, 100)}...`); return; }
    if (command === '!time') { bot.whisper(username, `Time: ${bot.time.timeOfDay}`); return; }
    if (command === '!weather') { bot.whisper(username, bot.isRaining ? "Raining/Snowing" : "Clear"); return; }
    if (command === '!jump') { bot.setControlState('jump', true); setTimeout(() => bot.setControlState('jump', false), 500); bot.whisper(username, "Jumped!"); return; }

    if (command === '!stop') {
      bot.pathfinder.setGoal(null);
      bot.clearControlStates();
      attachTarget = null; attachType = null;
      protectMode = false; attackTarget = null; wanderMode = false;
      bot.whisper(username, "Cleared actions.");
      return;
    }

    if (command === '!come') {
      attachTarget = null; attachType = null;
      const target = bot.players[username]?.entity;
      if (!target) return bot.whisper(username, "Can't see you.");
      const p = target.position;
      bot.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 1));
      bot.whisper(username, "Coming!");
      return;
    }

    if (command === '!follow') {
      attachTarget = null; attachType = null;
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      bot.pathfinder.setGoal(new goals.GoalFollow(target, 2), true);
      bot.whisper(username, `Following ${args[1] || username}`);
      return;
    }

    if (command === '!goto') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      if ([x, y, z].some(isNaN)) return bot.whisper(username, "Use: !goto [x] [y] [z]");
      attachTarget = null; attachType = null;
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
      bot.whisper(username, `Heading to ${x}, ${y}, ${z}`);
      return;
    }

    if (command === '!wander') {
      if (args[1] === 'stop') { wanderMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Wander off."); return; }
      const radius = parseInt(args[1]) || 10;
      wanderMode = { radius, origin: bot.entity.position.clone() };
      bot.whisper(username, `Wandering within ${radius} blocks.`);
      return;
    }

    if (command === '!flee') {
      const hostile = bot.nearestEntity(e => e.type === 'hostile' || e.type === 'monster');
      if (!hostile) return bot.whisper(username, "No hostiles nearby.");
      const away = bot.entity.position.minus(hostile.position).normalize().scale(15).plus(bot.entity.position);
      bot.pathfinder.setGoal(new goals.GoalNear(away.x, away.y, away.z, 1));
      bot.whisper(username, `Fleeing from ${hostile.name || 'mob'}!`);
      return;
    }

    if (command === '!attack') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { attackTarget = null; bot.pathfinder.setGoal(null); bot.whisper(username, "Attack stopped."); return; }
      if (!bot.players[pTarget]) return bot.whisper(username, "Player offline.");
      attackTarget = pTarget;
      bot.whisper(username, `Attacking ${pTarget}!`);
      return;
    }

    if (command === '!protect') {
      if (args[1] === 'stop') { protectMode = false; bot.pathfinder.setGoal(null); bot.whisper(username, "Protect mode off."); return; }
      protectMode = true;
      bot.whisper(username, "Protect mode on - attacking nearby hostiles.");
      return;
    }

    if (command === '!lookat') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      bot.lookAt(target.position.offset(0, target.height, 0));
      bot.whisper(username, `Looking at ${args[1] || username}`);
      return;
    }

    if (command === '!talk') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "Use: !talk [message]");
      bot.chat(text);
      return;
    }

    if (command === '!shout') {
      const text = args.slice(1).join(' ');
      if (!text) return bot.whisper(username, "Use: !shout [message]");
      bot.chat(`${text.toUpperCase()}!!!`);
      return;
    }

    if (command === '!click') {
      const target = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (!target) return bot.whisper(username, "Nothing in range.");
      bot.attack(target);
      bot.whisper(username, `Clicked ${target.name || target.username || target.displayName || 'entity'}`);
      return;
    }

    if (command === '!sneak') {
      const state = args[1] !== 'stop';
      bot.setControlState('sneak', state);
      bot.whisper(username, state ? "Sneaking." : "Standing.");
      return;
    }

    if (command === '!activate') {
      const block = bot.blockAtCursor(5);
      if (block) { bot.activateBlock(block); bot.whisper(username, `Activated block: ${block.name}`); return; }
      const entity = bot.nearestEntity(e => e !== bot.entity && bot.entity.position.distanceTo(e.position) < 4);
      if (entity) { bot.activateEntity(entity); bot.whisper(username, `Activated entity: ${entity.name || entity.displayName || 'entity'}`); return; }
      bot.whisper(username, "Nothing to activate.");
      return;
    }

    if (command === '!sleeptest') {
      const bedBlock = bot.findBlock({ matching: (block) => block.name.includes('bed'), maxDistance: 16 });
      if (!bedBlock) return bot.whisper(username, "No bed nearby.");
      bot.sleep(bedBlock).then(() => bot.whisper(username, "Sleeping.")).catch(e => bot.whisper(username, `Can't sleep: ${e.message}`));
      return;
    }

    if (command === '!attachplayer') {
      const pTarget = args[1];
      if (!pTarget || pTarget === 'stop') { attachTarget = null; attachType = null; bot.whisper(username, "Detached."); return; }
      if (!bot.players[pTarget]) return bot.whisper(username, "Player offline.");
      attachTarget = pTarget; attachType = 'player'; bot.pathfinder.setGoal(null); bot.whisper(username, `Attached to ${pTarget}`); return;
    }
    if (command === '!attachmob') {
      if (args[1] === 'stop') { attachTarget = null; attachType = null; bot.whisper(username, "Detached."); return; }
      let closest = null, min = 999;
      for (const id in bot.entities) {
        const e = bot.entities[id];
        if (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') {
          const d = bot.entity.position.distanceTo(e.position);
          if (d < min) { min = d; closest = e; }
        }
      }
      if (!closest) return bot.whisper(username, "No mobs nearby.");
      attachTarget = closest.id; attachType = 'mob';
      bot.pathfinder.setGoal(null);
      bot.whisper(username, `Attached to nearest mob (${closest.name || closest.displayName || 'unknown'})`);
      return;
    }

    if (command === '!drop') { const h = bot.inventory.slots[bot.getEquipmentDestSlot('hand')]; if (!h) return bot.whisper(username, "Hand empty."); bot.tossStack(h); bot.whisper(username, "Dropped."); return; }
    if (command === '!dropall') { const items = bot.inventory.items(); if (items.length === 0) return bot.whisper(username, "Empty."); async function tossAll() { for (const i of items) { try { await bot.tossStack(i); } catch (e) {} } } tossAll(); bot.whisper(username, "Dropped all."); return; }
    if (command === '!hand') { const i = bot.heldItem; bot.whisper(username, i ? `Holding: ${i.name} x${i.count}` : "Empty."); return; }
    if (command === '!equip') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "Use: !equip [item name]");
      const items = bot.inventory.items();
      const item = items.find(i => i.name.includes(itemName));
      if (!item) { bot.whisper(username, `Item not found. You're holding: ${items.map(i => i.name).join(', ') || 'nothing'}`); return; }
      bot.equip(item, 'hand').then(() => bot.whisper(username, `Equipped ${item.name}`)).catch(e => bot.whisper(username, `Equip failed: ${e.message}`));
      return;
    }

    // ---- BUILD ----
    if (command === '!place') {
      const itemName = args.slice(1).join('_').toLowerCase();
      if (!itemName) return bot.whisper(username, "Use: !place [item name]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAtCursor(5);
      if (!refBlock) return bot.whisper(username, "No block in view to place against.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, bot.entity.position.offset(0, 1, 0).minus(refBlock.position).normalize()))
        .then(() => bot.whisper(username, `Placed ${item.name}`))
        .catch(e => bot.whisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!placeat') {
      const x = parseFloat(args[1]), y = parseFloat(args[2]), z = parseFloat(args[3]);
      const itemName = args.slice(4).join('_').toLowerCase();
      if ([x, y, z].some(isNaN) || !itemName) return bot.whisper(username, "Use: !placeat [x] [y] [z] [item]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      const refBlock = bot.blockAt({ x, y: y - 1, z });
      if (!refBlock) return bot.whisper(username, "No reference block below target position.");
      bot.equip(item, 'hand')
        .then(() => bot.placeBlock(refBlock, { x: 0, y: 1, z: 0 }))
        .then(() => bot.whisper(username, `Placed ${item.name} at ${x},${y},${z}`))
        .catch(e => bot.whisper(username, `Place failed: ${e.message}`));
      return;
    }

    if (command === '!fill') {
      const itemName = args[1]?.toLowerCase();
      const w = parseInt(args[2]) || 1, h = parseInt(args[3]) || 1, d = parseInt(args[4]) || 1;
      if (!itemName) return bot.whisper(username, "Use: !fill [item] [w] [h] [d]");
      const item = bot.inventory.items().find(i => i.name.includes(itemName));
      if (!item) return bot.whisper(username, "Item not found in inventory.");
      bot.whisper(username, `Filling ${w}x${h}x${d} with ${item.name}...`);
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
        bot.whisper(username, "Fill complete.");
      })();
      return;
    }

    if (command === '!dig') {
      const block = bot.blockAtCursor(5);
      if (!block || block.name === 'air') return bot.whisper(username, "No block in view.");
      bot.dig(block).then(() => bot.whisper(username, `Dug ${block.name}`)).catch(e => bot.whisper(username, `Dig failed: ${e.message}`));
      return;
    }

    if (command === '!collect') {
      const blockName = args[1]?.toLowerCase();
      const amount = parseInt(args[2]) || 1;
      if (!blockName) return bot.whisper(username, "Use: !collect [block name] [amount]");

      const targets = bot.findBlocks({ matching: (block) => block.name.includes(blockName), maxDistance: 32, count: amount * 3 });
      if (!targets || targets.length === 0) return bot.whisper(username, "None found nearby.");

      bot.whisper(username, `Attempting to collect ${amount} ${blockName}...`);

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
        bot.whisper(username, `Collect finished. Got ${collected}/${amount}.`);
      })();
      return;
    }

    if (command === '!blockinfo') {
      const block = bot.blockAtCursor(5);
      bot.whisper(username, block ? `Looking at: ${block.name}` : "No block in view.");
      return;
    }

    // ---- INFO ----
    if (command === '!nearbyplayers') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.players)
        .filter(p => p.entity && p.username !== bot.username)
        .map(p => ({ name: p.username, d: bot.entity.position.distanceTo(p.entity.position) }))
        .filter(p => p.d <= radius).sort((a, b) => a.d - b.d)
        .map(p => `${p.name}(${p.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `Nearby: ${list.join(', ')}` : "No players in range.");
      return;
    }

    if (command === '!nearbymobs') {
      const radius = parseInt(args[1]) || 32;
      const list = Object.values(bot.entities)
        .filter(e => (e.type === 'mob' || e.type === 'animal' || e.type === 'monster') && e !== bot.entity)
        .map(e => ({ name: e.name || e.displayName || 'unknown', d: bot.entity.position.distanceTo(e.position) }))
        .filter(e => e.d <= radius).sort((a, b) => a.d - b.d)
        .map(e => `${e.name}(${e.d.toFixed(1)}m)`);
      bot.whisper(username, list.length ? `Nearby mobs: ${list.join(', ')}` : "No mobs in range.");
      return;
    }

    if (command === '!health') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline.");
      const hp = target.health !== undefined ? target.health : 'unknown (not visible to bot)';
      bot.whisper(username, `${args[1] || username} HP: ${hp}`);
      return;
    }

    if (command === '!tps') { bot.whisper(username, "TPS not exposed by this server (no plugin support detected)."); return; }

    if (command === '!whereis') {
      const target = findPlayerOrArg(username, args);
      if (!target) return bot.whisper(username, "Player not found/offline (or out of render distance).");
      const p = target.position;
      bot.whisper(username, `${args[1] || username}: X:${Math.round(p.x)} Y:${Math.round(p.y)} Z:${Math.round(p.z)}`);
      return;
    }

    if (command === '!exp') { bot.whisper(username, `XP Level: ${bot.experience.level} (${bot.experience.points} pts)`); return; }
    if (command === '!gamemode') { bot.whisper(username, `Gamemode: ${bot.game.gameMode}`); return; }
    if (command === '!uptime') { bot.whisper(username, spawnTime ? `Connected for: ${fmtTime(Date.now() - spawnTime)}` : "Not spawned yet."); return; }

    // ---- FUN / SANDBOX ----
    if (command === '!echo') { bot.whisper(username, args.slice(1).join(' ') || "(nothing to echo)"); return; }
    if (command === '!ping') {
      const pTarget = args[1];
      if (pTarget) {
        const p = bot.players[pTarget];
        if (!p) return bot.whisper(username, "Player offline.");
        bot.whisper(username, `${pTarget} ping: ${p.ping}ms`);
      } else {
        bot.whisper(username, `Bot ping: ${bot.player?.ping ?? 'unknown'}ms`);
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
      bot.whisper(username, "Spinning!");
      return;
    }

    if (command === '!emote') {
      const type = args[1]?.toLowerCase();
      if (type === 'wave') { bot.swingArm('right'); bot.whisper(username, "*waves*"); }
      else if (type === 'sit') { bot.setControlState('sneak', true); bot.whisper(username, "*sits*"); }
      else if (type === 'stand') { bot.setControlState('sneak', false); bot.whisper(username, "*stands up*"); }
      else bot.whisper(username, "Emotes: wave, sit, stand");
      return;
    }

    if (command === '!8ball') {
      const question = args.slice(1).join(' ');
      if (!question) return bot.whisper(username, "Use: !8ball [question]");
      const answers = ["Yes.", "No.", "Definitely.", "Ask again later.", "Unlikely.", "Absolutely!", "My sources say no.", "It is certain.", "Very doubtful."];
      bot.whisper(username, answers[Math.floor(Math.random() * answers.length)]);
      return;
    }

    if (command === '!coinflip') { bot.whisper(username, Math.random() < 0.5 ? "Heads!" : "Tails!"); return; }
    if (command === '!roll') { const sides = parseInt(args[1]) || 6; bot.whisper(username, `Rolled a ${Math.floor(Math.random() * sides) + 1} (d${sides})`); return; }

    // ---- SANDBOX COMMAND MANAGEMENT ----
    if (command === '!addcmd') { const cmdName = args[1], cmdReply = args.slice(2).join(' '); if (!cmdName || !cmdReply) return bot.whisper(username, 'Use: !addcmd [!name] [reply]'); customCommands[cmdName.toLowerCase()] = cmdReply; bot.whisper(username, `Created command: ${cmdName}`); return; }
    if (command === '!delcmd') { const cmdName = args[1]?.toLowerCase(); if (customCommands[cmdName]) { delete customCommands[cmdName]; bot.whisper(username, `Deleted ${cmdName}`); } else { bot.whisper(username, 'Not found.'); } return; }
    if (command === '!listcmds') { const keys = Object.keys(customCommands); bot.whisper(username, keys.length ? `Custom: ${keys.join(', ')}` : "No custom commands."); return; }
    if (command === '!clean') { customCommands = {}; bot.whisper(username, "Cleared sandbox memory."); return; }

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
