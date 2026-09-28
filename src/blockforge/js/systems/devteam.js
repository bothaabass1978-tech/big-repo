/**
 * BlockForge — hire developers for your games.
 *
 *   BF.devs.candidates()             people you can hire right now (refresh every T.rollMin)
 *   BF.devs.hire(gameId, botId)      hire one for a game (pays one hour up front)
 *   BF.devs.fire(hireId)             let one go
 *   BF.devs.team(gameId)             hires working on a game
 *   BF.devs.power(gameId)            update power (builders, scripters, artists, designers)
 *   BF.devs.visitMult(ug)            marketers + update hype, applied to organic visits
 *   BF.devs.quality(ug)              quality from shipped updates and community managers
 *   BF.devs.tick(now)                salaries and shipping updates (world tick)
 *
 * Each role does something: builders, scripters, artists and game designers
 * ship updates (a new version with patch notes, a permanent quality bump and
 * a 30-minute surge of players); marketers bring steady new visitors;
 * community managers raise quality and how many players stick around.
 * Salaries come out of the game's pending earnings first, then your wallet;
 * a dev who goes unpaid for T.quitAfterMin quits. Better devs cost more and
 * only work for well-known creators (BF.fame). All fictional and local.
 * Story: BLOCKFORGE-019
 */
(function (BF) {
  'use strict';

  const U = BF.util;

  /** Tuning (data). */
  const T = {
    roles: {
      builder: { name: 'Builder', icon: 'box', ships: 1, pay: 1, what: 'builds new maps and levels' },
      scripter: { name: 'Scripter', icon: 'wrench', ships: 1, pay: 1.15, what: 'adds new mechanics and fixes bugs' },
      artist: { name: 'Artist', icon: 'palette', ships: 0.8, pay: 0.9, what: 'makes new items, skins and effects' },
      designer: { name: 'Game Designer', icon: 'target', ships: 1.3, pay: 1.3, what: 'plans events and balances the game' },
      marketer: { name: 'Marketer', icon: 'megaphone', ships: 0, pay: 1.1, what: 'brings steady new players' },
      community: { name: 'Community Manager', icon: 'users', ships: 0, pay: 0.8, what: 'keeps players happy and coming back' },
    },
    skillOdds: [0.3, 0.3, 0.22, 0.12, 0.06], // 1 to 5 stars
    salaryBase: 40, // ForgeCoins per hour × skill² × role pay
    minTier: { 3: 'known', 4: 'popular', 5: 'famous' }, // fame needed before these devs will work for you
    candidates: 6,
    rollMin: 30,
    maxTeam: 8,
    updateMin: [6, 45], // minutes between updates: 45 / power, clamped
    qualityPerUpdate: 0.015, // × average skill of the shipping devs
    maxDevQuality: 0.4,
    hypeMin: 30,
    hypePerPower: 0.15,
    maxHype: 3,
    comebackShare: 0.15, // share of regulars who come back to see an update
    marketerPerSkill: 0.12,
    communityPerSkill: 0.012,
    payEveryMin: 10, // wallet payments are batched
    quitAfterMin: 10,
  };
  const TIER_ORDER = ['newcomer', 'rising', 'known', 'popular', 'famous', 'superstar', 'legend'];

  const NOTES = {
    builder: ['Added {n} new {level}s', 'Built a new area: {place}', 'Remade the spawn with more detail', 'New secret room somewhere in {place}'],
    scripter: ['New mechanic: {mech}', 'Fixed {n} bugs and made servers smoother', 'Added daily rewards inside the game', 'New game mode: {mode}'],
    artist: ['{n} new skins in the store', 'New particle effects for {mech}', 'Fresh lighting across the whole map', 'New victory animations'],
    designer: ['Weekend event: {mode}', 'Rebalanced rewards so progress feels faster', 'New quests with bigger prizes', 'Season 2 kicks off with {mode}'],
  };
  const FILL = {
    level: ['stage', 'level', 'map', 'course'], place: ['Crystal Caves', 'Sky Harbor', 'Lava Keep', 'Frost Peak', 'Neon District', 'Candy Canyon', 'Moon Base'],
    mech: ['double jump pads', 'grappling hooks', 'speed boosts', 'pet companions', 'trading cards', 'moving platforms', 'power-ups'],
    mode: ['Team Battle', 'Speedrun Rush', 'King of the Hill', 'Treasure Hunt', 'Boss Raid', 'Double Coins Weekend'],
  };

  function st() { return BF.store.state && BF.store.state.devs; }
  function ugOf(id) { return BF.creator ? BF.creator.get(id) : null; }
  const salaryOf = (role, skill) => Math.round(T.salaryBase * skill * skill * T.roles[role].pay);
  function tierOk(skill) {
    const need = T.minTier[skill];
    if (!need || !BF.fame) return true;
    return TIER_ORDER.indexOf(BF.fame.me().tier.id) >= TIER_ORDER.indexOf(need);
  }
  function note(role, rng) {
    return U.pick(NOTES[role] || NOTES.builder, rng).replace(/\{(\w+)\}/g, (m, k) => (k === 'n' ? String(2 + Math.floor(rng() * 6)) : U.pick(FILL[k] || ['it'], rng)));
  }

  const devs = (BF.devs = {
    T,
    salaryOf,

    /** People you can hire right now. Rolls a fresh list every T.rollMin minutes. */
    candidates(force) {
      const s = st();
      if (!s) return [];
      const now = BF.clock.now();
      if (force || !s.candidates.length || now - s.rolledAt > T.rollMin * 60000) devs.roll(now);
      return s.candidates.map((c) => Object.assign({}, c, { bot: BF.bots.get(c.botId), locked: !tierOk(c.skill), needs: T.minTier[c.skill] || null })).filter((c) => c.bot);
    },

    /** Roll a new candidate list. */
    roll(now, rng) {
      rng = rng || Math.random;
      const s = st();
      const taken = new Set(s.hires.map((h) => h.botId));
      const owners = BF.creatorEconomy ? new Set(BF.creatorEconomy.studios().map((x) => x.owner.id)) : new Set();
      const pool = BF.bots.list.filter((b) => !taken.has(b.id) && !owners.has(b.id) && !BF.friends.isBlocked(b.id));
      const roles = Object.keys(T.roles);
      const out = [];
      for (let i = 0; i < T.candidates && pool.length; i++) {
        const bot = pool.splice(Math.floor(rng() * pool.length), 1)[0];
        let r = rng(), skill = 1;
        for (let k = 0; k < T.skillOdds.length; k++) { if (r < T.skillOdds[k]) { skill = k + 1; break; } r -= T.skillOdds[k]; skill = k + 2; }
        skill = U.clamp(skill, 1, 5);
        const role = roles[(i + Math.floor(rng() * roles.length)) % roles.length];
        out.push({ botId: bot.id, role, skill, salary: salaryOf(role, skill) });
      }
      BF.store.update('devs', (x) => { x.devs.candidates = out; x.devs.rolledAt = now || BF.clock.now(); });
      return out;
    },

    /** Hires working on a game (or all of them). */
    team(gameId) {
      const s = st();
      return s ? s.hires.filter((h) => !gameId || h.gameId === gameId).map((h) => Object.assign({ bot: BF.bots.get(h.botId), roleInfo: T.roles[h.role] }, h)) : [];
    },

    /**
     * Hire a candidate for one of your games. Pays one hour of salary up front.
     * @returns {{ok:boolean, error?:string, hire?:object}}
     */
    hire(gameId, botId) {
      const s = st();
      const ug = ugOf(gameId);
      if (!ug) return { ok: false, error: 'Game not found.' };
      const c = s.candidates.find((x) => x.botId === botId);
      if (!c) return { ok: false, error: 'That developer is no longer available.' };
      if (!tierOk(c.skill)) return { ok: false, error: 'This developer only works for ' + ((BF.fame && BF.fame.T.tiers.find((t) => t.id === T.minTier[c.skill]) || {}).name || 'more famous') + ' creators. Grow your fame first.' };
      if (devs.team(gameId).length >= T.maxTeam) return { ok: false, error: 'A game can have up to ' + T.maxTeam + ' developers.' };
      const bot = BF.bots.get(botId);
      const paid = BF.economy.spend(c.salary, 'Hired ' + bot.displayName + ' (' + T.roles[c.role].name + ') for ' + ug.name, 'devs');
      if (!paid.ok) return { ok: false, error: 'You need ' + U.fmt(c.salary) + ' ForgeCoins to cover the first hour.' };
      const now = BF.clock.now();
      const hire = { id: U.uid('dev'), botId, gameId, role: c.role, skill: c.skill, salary: c.salary, hiredAt: now, owed: 0, paid: c.salary, unpaid: 0, updates: 0 };
      BF.store.update(['devs', 'created'], (x) => {
        x.devs.hires.push(hire);
        x.devs.candidates = x.devs.candidates.filter((y) => y.botId !== botId);
        if (!ug.nextUpdateAt || ug.nextUpdateAt < now) ug.nextUpdateAt = now + devs.period(gameId) * 60000;
      });
      if (BF.messages && BF.voice) {
        const lines = ['yooo thanks for hiring me!! cant wait to work on ' + ug.name, 'omg im on the ' + ug.name + ' team now?? lets gooo', 'thanks for the job! ill ' + T.roles[c.role].what.replace(/s /, ' ') + ' asap'];
        setTimeout(() => { if (BF.store.state) BF.messages.receive(botId, BF.voice.say(bot, U.pick(lines)), { quietIfOpen: true }); }, 2500);
      }
      BF.bus.emit('devs:changed', { gameId });
      return { ok: true, hire };
    },

    /** Let a developer go. */
    fire(hireId, reason) {
      const s = st();
      const h = s.hires.find((x) => x.id === hireId);
      if (!h) return { ok: false };
      BF.store.update('devs', (x) => { x.devs.hires = x.devs.hires.filter((y) => y.id !== hireId); });
      const bot = BF.bots.get(h.botId);
      if (bot && BF.messages && BF.voice && reason !== 'quiet') {
        const line = reason === 'unpaid' ? 'hey i havent been paid so im gonna go work somewhere else, sorry' : U.pick(['oh ok... good luck with the game', 'aw ok, it was fun working on it', 'np, thanks for the chance']);
        BF.messages.receive(h.botId, BF.voice.say(bot, line), { quietIfOpen: true });
      }
      BF.bus.emit('devs:changed', { gameId: h.gameId });
      return { ok: true };
    },

    /** Update power of a game's team: builders, scripters, artists and designers by skill. */
    power(gameId) {
      return devs.team(gameId).reduce((a, h) => a + h.skill * T.roles[h.role].ships, 0);
    },

    /** Minutes between updates for a game's team (Infinity with no one shipping). */
    period(gameId) {
      const p = devs.power(gameId);
      return p > 0 ? U.clamp(T.updateMin[1] / p, T.updateMin[0], T.updateMin[1]) : Infinity;
    },

    /** Multiplier on organic visits: marketers, plus the surge after an update. */
    visitMult(ug) {
      const now = BF.clock.now();
      const mk = devs.team(ug.id).filter((h) => h.role === 'marketer').reduce((a, h) => a + h.skill * T.marketerPerSkill, 0);
      const hype = ug.hype && ug.hype.until > now ? ug.hype.mult : 1;
      return (1 + mk) * hype;
    },

    /** Quality from shipped updates and community managers (added to creator.quality). */
    quality(ug) {
      const cm = devs.team(ug.id).filter((h) => h.role === 'community').reduce((a, h) => a + h.skill * T.communityPerSkill, 0);
      return Math.min(T.maxDevQuality, (ug.devq || 0) + cm);
    },

    /** Ship an update for a game now (the team decides what is in it). */
    ship(ug, now, rng) {
      rng = rng || Math.random;
      const team = devs.team(ug.id).filter((h) => T.roles[h.role].ships > 0);
      if (!team.length) return null;
      const p = devs.power(ug.id);
      const avg = team.reduce((a, h) => a + h.skill, 0) / team.length;
      const notes = U.shuffle(team.slice(), rng).slice(0, 3).map((h) => note(h.role, rng));
      const version = (Number(ug.version) || 1) + 1;
      const surge = Math.round((ug.aud || 0) * T.comebackShare + (BF.followers ? BF.followers.total() * 0.002 : 0));
      BF.store.update(['created', 'devs'], (x) => {
        ug.version = version;
        ug.updatedAt = now;
        ug.devq = Math.min(T.maxDevQuality, (ug.devq || 0) + T.qualityPerUpdate * avg);
        ug.hype = { until: now + T.hypeMin * 60000, mult: Math.min(T.maxHype, 1 + T.hypePerPower * p) };
        ug.updates = (ug.updates || 0) + 1;
        ug.changelog = [{ v: '1.' + version, date: new Date(now).toISOString().slice(0, 10), notes: notes.join('. ') + '.' }].concat(ug.changelog || []).slice(0, 12);
        ug.nextUpdateAt = now + devs.period(ug.id) * 60000;
        for (const h of x.devs.hires) if (h.gameId === ug.id && T.roles[h.role].ships > 0) h.updates = (h.updates || 0) + 1;
        x.devs.log.unshift({ ts: now, gameId: ug.id, v: version, notes });
        if (x.devs.log.length > 40) x.devs.log.length = 40;
      });
      if (surge > 0 && BF.creator) BF.creator.receiveVisits(ug, surge, 'update');
      if (BF.notify) BF.notify.push({ type: 'update', title: 'Your team shipped ' + ug.name + ' v1.' + version, body: notes.join(' · ') + (surge ? ' · ' + U.compact(surge) + ' players rushed back.' : ''), icon: 'rocket', route: '#/create/' + ug.id + '/team' });
      BF.bus.emit('devs:shipped', { gameId: ug.id, version });
      return { version, notes, surge };
    },

    /** World tick: pay salaries, quit when unpaid, ship updates on schedule. */
    tick(now) {
      const s = st();
      if (!s || !s.hires.length) return;
      now = now || BF.clock.now();
      const dt = s.tickAt ? U.clamp((now - s.tickAt) / 1000, 0, 600) : 4;
      s.tickAt = now;
      const quits = [];
      for (const h of s.hires.slice()) {
        const ug = ugOf(h.gameId);
        if (!ug) { quits.push([h.id, 'quiet']); continue; }
        const due = h.salary * (dt / 3600);
        // earnings of the game cover salaries first
        const fromGame = Math.min(ug.pending || 0, due);
        ug.pending = (ug.pending || 0) - fromGame;
        h.owed += due - fromGame;
        h.paid += fromGame;
        if (h.owed >= Math.max(1, h.salary * (T.payEveryMin / 60)) || (h.owed >= 1 && h.unpaid > 0)) {
          const amt = Math.floor(h.owed);
          const r = BF.economy.spend(amt, 'Salary: ' + (BF.bots.get(h.botId) || {}).displayName + ' (' + T.roles[h.role].name + ')', 'devs');
          if (r.ok) { h.owed -= amt; h.paid += amt; h.unpaid = 0; } else h.unpaid += dt;
        }
        if (h.unpaid > T.quitAfterMin * 60) quits.push([h.id, 'unpaid']);
      }
      // salaries are live numbers: a separate slice, so the Team tab is not rebuilt every tick
      BF.store.touch(['devStats', 'creatorStats']);
      for (const [id, why] of quits) {
        const h = s.hires.find((x) => x.id === id);
        devs.fire(id, why);
        if (why === 'unpaid' && h && BF.notify) BF.notify.push({ type: 'update', title: (BF.bots.get(h.botId) || {}).displayName + ' quit your team', body: 'They were not paid for ' + T.quitAfterMin + ' minutes. Keep ForgeCoins in your wallet or collect earnings to pay your team.', icon: 'users', route: '#/create/' + h.gameId + '/team' });
      }
      const games = new Set(s.hires.map((h) => h.gameId));
      for (const id of games) {
        const ug = ugOf(id);
        if (ug && ug.nextUpdateAt && now >= ug.nextUpdateAt) devs.ship(ug, now);
      }
    },

    /** Salary per hour for a game's team (or everyone). */
    payroll(gameId) {
      return devs.team(gameId).reduce((a, h) => a + h.salary, 0);
    },

    worldTick() { devs.tick(BF.clock.now()); },
  });
})((window.BF = window.BF || {}));
