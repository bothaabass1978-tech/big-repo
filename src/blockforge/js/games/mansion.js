/**
 * Mystery Mansion (gameType "mansion") — point-and-click detective case.
 * Search Ashcombe Manor room by room: inspect objects, collect clues and
 * items, solve the bookshelf poem, the fuse box and the study safe, then name
 * the culprit in the parlor. Five golden beetles (saved between visits) unlock
 * the true ending. The inspector arrives at midnight (12 minute limit).
 * Win: accuse the right suspect with enough evidence. Lose: time runs out.
 * Passes: lantern (hidden objects shimmer), hints (hint button).
 * The cellar furnace belongs to BF.secrets (see js/systems/secrets.js).
 */
(function (BF) {
  'use strict';

  const U = BF.util;
  const G = BF.gfx;

  const T = { limit: 720, rewards: { play: 15, win: 80, beetle: 10, trueEnd: 60, xpPlay: 30, xpWin: 150 } };
  const FLOOR = 360, DOCK = 478;
  const SUSPECTS = [
    { id: 'pell', name: 'Mr. Pell', role: 'the butler', color: '#39414f' },
    { id: 'ivy', name: 'Ivy Ashcombe', role: 'the niece', color: '#b67cff' },
    { id: 'thorne', name: 'Mr. Thorne', role: 'the business partner', color: '#7a4a2a' },
    { id: 'rosa', name: 'Rosa', role: 'the gardener', color: '#4ad17f' },
  ];
  const CLUES = {
    letter: { name: 'Torn letter', text: '"Thorne, the ledgers do not add up. We settle this tonight. — A."', key: true },
    boots: { name: 'Muddy boot print', text: 'A size 12 boot print by the kitchen door, still damp.' },
    rosaBoots: { name: "Rosa's boots", text: "The gardener's boots in the shed are size 8. The print was not hers." },
    will: { name: 'The will', text: 'Ivy inherits the manor... but the fortune was already moved to a private vault.' },
    keys: { name: "Butler's key ring", text: "Pell's key ring hangs in the foyer. The study key is missing from it." },
    clock: { name: 'Stopped clock', text: 'The grandfather clock stopped at 11:07 on the night Lord Ashcombe vanished.' },
    scarf: { name: 'Snagged scarf', text: 'A green scarf caught in the coal chute. It is monogrammed "E.T."', key: true },
    ticket: { name: 'Train ticket', text: 'A ticket for the 11:40 night train, bought by E. Thorne, dated the night of the disappearance.', key: true },
    note: { name: "Ashcombe's note", text: '"If you are reading this, Thorne has made his move. I am safe, and so is the fortune. Name him, and I will come out." — A.', key: true },
    poem: { name: 'Library poem', text: '"First the crimson, then the sea, the eldest next, and last the tree."' },
  };
  const BEETLES = ['foyer', 'library', 'kitchen', 'cellar', 'garden'];
  const BOOKS = [
    { color: '#c0392b', name: 'crimson', year: 1902 }, { color: '#2e86c1', name: 'blue', year: 1921 }, { color: '#7a5a3a', name: 'brown', year: 1871 },
    { color: '#27ae60', name: 'green', year: 1930 }, { color: '#d4ac0d', name: 'yellow', year: 1899 }, { color: '#7d3c98', name: 'purple', year: 1915 },
  ];
  const BOOK_ORDER = [0, 1, 2, 3]; // crimson, sea (blue), eldest (1871 brown), tree (green)

  BF.GameModules.register('mansion', {
    orders: ['follow', 'come', 'stay', 'leave', 'help'],
    three: true,
    maxBots: 3,
    feedTop: 0.13,
    actions: {},
    controls: { joystick: false, buttons: [] },
    create(ctx) {
      const W = ctx.W, H = ctx.H;
      const V = ctx.g3;
      if (V) V.sepAxis = 'z';
      // In 3D the back wall of every room sits on the plane Z = 0 and the camera is placed so that
      // plane maps 1:1 onto the 960×540 screen (screen x = X, screen y = FLOOR - Y). Hotspots,
      // puzzles and the cellar secret therefore keep their 2D screen rectangles unchanged.
      const CAM_D = (H / 2) / Math.tan((45 / 2) * Math.PI / 180);
      const toWall = (x, y) => [x, FLOOR - y, 0];
      const parts = V ? V.particles2d(0, (x, y) => toWall(x, y)) : new BF.Particles(400);
      const floats = V ? V.floaters2d(0, (x, y) => toWall(x, y)) : new BF.Floaters();
      const d = ctx.data;
      d.beetles = d.beetles || [];
      // Pocket Watch pass: three extra minutes before midnight
      const limit = T.limit + (ctx.hasPass('pocketwatch') ? 180 : 0);
      const lantern = ctx.hasPass('lantern');
      const hints = ctx.hasPass('hints');
      const secrets = BF.secrets;

      const st = {
        room: 'foyer', clues: [], items: [], selected: null, flags: {},
        fuses: randomFuses(), bookSeq: [], dials: ['A', 'A', 'A', 'A', 'A'], rhythm: null, beetlesNow: 0,
      };
      let phase = 'play';
      let time = 0;
      let hover = null;
      let panelOpen = null;
      let flash = 0;
      let furnaceGlow = secrets.state().wordSolved ? 1 : 0;
      let openTerminalT = 0;

      function randomFuses() {
        // lights-out on 5 lamps: each switch toggles itself and its neighbours; start from a solved board scrambled by real presses
        const on = [true, true, true, true, true];
        for (let i = 0; i < 4; i++) { const k = Math.floor(Math.random() * 5); for (const j of [k - 1, k, k + 1]) if (j >= 0 && j < 5) on[j] = !on[j]; }
        if (on.every(Boolean)) { on[0] = !on[0]; on[1] = !on[1]; }
        return on;
      }
      const hasClue = (id) => st.clues.includes(id);
      function addClue(id) {
        if (hasClue(id)) return;
        st.clues.push(id);
        ctx.sfx('powerup', { volume: 0.5 });
        ctx.feed('Clue found: ' + CLUES[id].name, 'star', '#ffd66b');
        renderDock();
      }
      function addItem(id, name) {
        if (st.items.some((i) => i.id === id)) return;
        st.items.push({ id, name });
        ctx.sfx('pickup');
        ctx.feed('Added to your bag: ' + name, 'info', '#8fd3ff');
        renderDock();
      }
      function hasItem(id) { return st.items.some((i) => i.id === id); }
      function useUp(id) { st.items = st.items.filter((i) => i.id !== id); if (st.selected === id) st.selected = null; renderDock(); }
      /** The signet ring opens the drawer under the beetle case once all five beetles are home. */
      function openDrawer() {
        const n = d.beetles.length;
        if (st.flags.drawerOpen) return say('The drawer is already open.');
        if (n < 5) { ctx.sfx('error'); st.selected = null; renderDock(); return say('The ring slides into the keyhole, but the drawer will not turn. Something inside clicks five times, as if counting. Only ' + n + ' of the five velvet slots are filled.'); }
        st.flags.drawerOpen = true;
        useUp('ring');
        ctx.sfx('secret');
        parts.emit(820, 290, { count: 30, colors: ['#ffd66b', '#fff1a8'], speed: 160, life: 0.8 });
        say('The ring turns and the five beetles click into place. The drawer slides open. Inside: a folded note in Lord Ashcombe\'s hand and a tiny brass key tied with a green ribbon.', 'The beetle drawer');
        addClue('note');
        addItem('greenkey', 'Greenhouse key');
        if (!ctx.hasItem('col_golden_beetle')) ctx.collectible('col_golden_beetle');
      }
      function beetle(where) {
        if (d.beetles.includes(where)) { say('A golden beetle... wait, you already have this one in your collection.'); return; }
        d.beetles.push(where);
        st.beetlesNow++;
        ctx.save();
        ctx.addStat('beetles', 1);
        ctx.sfx('secret', { volume: 0.5 });
        parts.emit(hover ? hover.x + hover.w / 2 : W / 2, hover ? hover.y + hover.h / 2 : H / 2, { count: 24, colors: ['#ffd66b', '#fff1a8'], speed: 150, life: 0.7 });
        ctx.feed('Golden beetle found! (' + d.beetles.length + ' / 5)', 'star', '#ffd66b');
        if (d.beetles.length >= 5) ctx.badge('mym_beetles');
        renderDock();
      }
      function say(text, who) {
        panelOpen = 'say';
        ctx.ui.panel('say', '<div class="dialog-name">' + U.esc(who || 'You') + '</div><p>' + text + '</p><div class="gp-actions"><button class="btn btn-primary btn-sm" data-gact="close-say">OK</button></div>', 'bottom');
      }
      function closePanels() { ['say', 'puzzle'].forEach((id) => ctx.ui.remove(id)); panelOpen = null; }

      // ------------------------------------------------------------- rooms
      const powered = () => !!st.flags.power;
      const ROOMS = {
        foyer: { name: 'Foyer', wall: '#5a2a2e', floor: '#4a3020', spots: [
          { id: 'portrait', x: 400, y: 80, w: 150, h: 180, label: 'Portrait of Lord Ashcombe', on() { if (!st.flags.portraitMoved) { st.flags.portraitMoved = true; say('A stern portrait. The frame is loose... behind it, a torn letter is tucked into the wallpaper.'); addClue('letter'); } else say('Lord Arthur Ashcombe, painted in 1874. He looks like a man who counts every coin.'); }, hidden: () => !st.flags.portraitMoved },
          { id: 'clock', x: 130, y: 110, w: 70, h: 250, label: 'Grandfather clock', on() { say('The hands have stopped at 11:07. The pendulum hangs still.'); addClue('clock'); } },
          { id: 'umbrella', x: 238, y: 280, w: 50, h: 80, label: 'Umbrella stand', on() { if (!d.beetles.includes('foyer')) { say('Among the umbrellas, something glints gold. A golden beetle!'); beetle('foyer'); } else say('Just umbrellas. One has a duck-shaped handle.'); }, hidden: () => !d.beetles.includes('foyer') },
          { id: 'keys', x: 590, y: 170, w: 50, h: 50, label: 'Key hooks', on() { say("Mr. Pell's key ring. Every key is labelled except for one empty hook: STUDY."); addClue('keys'); } },
          { id: 'toParlor', x: 20, y: 150, w: 90, h: 210, label: 'Parlor', door: 'parlor' },
          { id: 'toKitchen', x: 850, y: 150, w: 90, h: 210, label: 'Kitchen', door: 'kitchen' },
          { id: 'toUpper', x: 660, y: 60, w: 160, h: 120, label: 'Upstairs', door: 'upper' },
          { id: 'toCellar', x: 700, y: 260, w: 90, h: 100, label: 'Cellar door (under the stairs)', door: 'cellar' },
        ] },
        upper: { name: 'Upper Hall', wall: '#3a3a5a', floor: '#3a2a20', spots: [
          { id: 'toLibrary', x: 140, y: 110, w: 120, h: 250, label: 'Library', door: 'library' },
          { id: 'toStudy', x: 620, y: 110, w: 120, h: 250, label: 'Study', on() { if (st.flags.studyOpen) return go('study'); say('Locked. The keyhole is small and brass.'); },
            use: { studykey() { if (st.flags.studyOpen) return go('study'); st.flags.studyOpen = true; useUp('studykey'); ctx.sfx('open'); say('The key turns with a heavy click. The study is open.'); } } },
          { id: 'window', x: 380, y: 70, w: 160, h: 170, label: 'Hall window', on() { say('Moonlight over the hill. The house must look lovely from the village, with the moon behind it.'); } },
          { id: 'toFoyer', x: 400, y: 300, w: 160, h: 60, label: 'Stairs down', door: 'foyer' },
        ] },
        library: { name: 'Library', wall: '#2a3a2a', floor: '#3a2a1e', spots: [
          { id: 'shelf', x: 300, y: 90, w: 360, h: 230, label: 'Bookshelf', on() { if (st.flags.shelfOpen) say('The hidden compartment is empty now.'); else openBooks(); } },
          { id: 'poem', x: 90, y: 250, w: 110, h: 110, label: 'Reading stand', on() { say('A poem is inked on the open page:<br><i>' + U.esc(CLUES.poem.text) + '</i>'); addClue('poem'); } },
          { id: 'high', x: 700, y: 70, w: 70, h: 60, label: 'Top shelf', on() { if (!d.beetles.includes('library')) { say('You climb the ladder. Behind an atlas: a golden beetle!'); beetle('library'); } else say('Dusty atlases. Nothing else up here.'); }, hidden: () => !d.beetles.includes('library') },
          { id: 'globe', x: 800, y: 250, w: 90, h: 110, label: 'Globe', on() { say('An old globe. Someone circled a small island far to the east... "Hermit\'s Islet"? Probably a joke.'); } },
          { id: 'toUpper', x: 20, y: 150, w: 60, h: 210, label: 'Upper Hall', door: 'upper' },
        ] },
        study: { name: 'Study', wall: '#3a2a4a', floor: '#2a1e18', spots: [
          { id: 'safe', x: 560, y: 90, w: 130, h: 140, label: 'Painting (a safe behind it)', on() { if (st.flags.safeOpen) say('The safe is empty.'); else openSafe(); } },
          { id: 'desk', x: 220, y: 240, w: 260, h: 120, label: 'Desk', on() { say('The will lies on the desk: Ivy inherits the manor. A note in the margin says the fortune was moved to a private vault.'); addClue('will'); } },
          { id: 'case', x: 760, y: 200, w: 120, h: 120, label: 'Beetle display case', on() {
            const n = d.beetles.length;
            if (st.flags.drawerOpen) return say('Five golden beetles glitter in the case. The little drawer beneath it stands open and empty.');
            if (n < 5) return say('A display case with five velvet slots, each shaped like a beetle. You have found ' + n + ' / 5. Beneath it, a tiny locked drawer.');
            say('Five golden beetles glitter in the case. A tiny drawer beneath it has a keyhole shaped like a signet ring.' + (hasItem('ring') ? ' The ring would fit: pick it in your bag, then click the case.' : ''));
          }, use: { ring: openDrawer } },
          { id: 'toUpper', x: 20, y: 150, w: 60, h: 210, label: 'Upper Hall', door: 'upper' },
        ] },
        kitchen: { name: 'Kitchen', wall: '#4a4a3a', floor: '#6a6a6a', spots: [
          { id: 'fusebox', x: 110, y: 110, w: 110, h: 130, label: 'Fuse box', on() { if (powered()) say('The fuse box hums. Power is on.'); else openFuses(); } },
          { id: 'teacup', x: 420, y: 250, w: 60, h: 40, label: 'Teacup', on() { if (!d.beetles.includes('kitchen')) { say('At the bottom of a cold teacup: a golden beetle!'); beetle('kitchen'); } else say('Cold tea. Earl grey.'); }, hidden: () => !d.beetles.includes('kitchen') },
          { id: 'print', x: 640, y: 330, w: 90, h: 30, label: 'Boot print', on() { say('A large, muddy boot print. Size 12, still damp.'); addClue('boots'); } },
          { id: 'toGarden', x: 760, y: 130, w: 110, h: 230, label: 'Back door to the garden', door: 'garden' },
          { id: 'toFoyer', x: 20, y: 150, w: 60, h: 210, label: 'Foyer', door: 'foyer' },
        ] },
        garden: { name: 'Garden', wall: '#1a2a4a', floor: '#2a4a2a', outdoor: true, spots: [
          { id: 'roses', x: 360, y: 240, w: 160, h: 110, label: 'Rose bushes', on() { if (!d.beetles.includes('garden')) { say('A glint between the roses: a golden beetle!'); beetle('garden'); } else say('Red roses, carefully tended.'); }, hidden: () => !d.beetles.includes('garden') },
          { id: 'shed', x: 610, y: 150, w: 170, h: 200, label: "Gardener's shed", on() { say("Rosa's boots stand by the door: size 8. Too small for the print in the kitchen."); addClue('rosaBoots'); } },
          { id: 'greenhouse', x: 80, y: 120, w: 200, h: 230, label: 'Greenhouse', on() {
            if (st.flags.trueEnding) return say('The greenhouse is warm and full of light.');
            if (st.flags.greenOpen) return say('A shadow moves behind the glass and a voice whispers: "Name him in the parlor, detective. Then I will come out."');
            say('The greenhouse door is locked. Somebody lit a lamp in there recently...');
          }, use: { greenkey() { st.flags.greenOpen = true; useUp('greenkey'); ctx.sfx('open'); say('The little brass key turns. Before you can step inside, a familiar voice whispers from behind the ferns: "Not yet, detective. Thorne must not know I am here. Name him in the parlor, and I will come out."', 'A voice in the greenhouse'); } } },
          { id: 'toKitchen', x: 860, y: 150, w: 80, h: 210, label: 'Kitchen', door: 'kitchen' },
        ] },
        parlor: { name: 'Parlor', wall: '#4a2a3a', floor: '#3a2418', spots: [
          { id: 'suspects', x: 190, y: 140, w: 560, h: 220, label: 'The suspects', on() { openAccuse(); } },
          { id: 'fireplace', x: 790, y: 190, w: 130, h: 170, label: 'Fireplace', on() { say('A small fireplace, swept clean. Whatever the house burns, it is not up here.'); } },
          { id: 'toFoyer', x: 20, y: 150, w: 60, h: 210, label: 'Foyer', door: 'foyer' },
        ] },
        cellar: { name: 'Cellar', wall: '#1e1a1a', floor: '#2a2420', dark: true, spots: [
          { id: 'racks', x: 90, y: 110, w: 170, h: 240, label: 'Wine racks', need: powered, on() { if (!d.beetles.includes('cellar')) { say('Between two dusty bottles: a golden beetle!'); beetle('cellar'); } else say('Vintage wine. Very vintage.'); }, hidden: () => !d.beetles.includes('cellar') },
          { id: 'chute', x: 300, y: 60, w: 100, h: 130, label: 'Coal chute', need: powered, on() { say('Something green is snagged on the chute\'s iron lip: a scarf, monogrammed "E.T." Someone came in this way.'); addClue('scarf'); } },
          { id: 'furnace', x: 470, y: 110, w: 220, h: 250, label: 'Old furnace', need: powered, on() { openFurnace(); } },
          { id: 'anvil', x: 730, y: 270, w: 120, h: 90, label: 'Anvil', need: powered, on() { if (furnaceGlow < 1) say('A blacksmith\'s anvil, cold as the furnace. Four worn marks are cut into its face: ◆ ▲ ● ■'); else openRhythm(); } },
          { id: 'toFoyer', x: 840, y: 60, w: 100, h: 140, label: 'Stairs up', door: 'foyer' },
        ] },
      };
      function go(room) {
        closePanels();
        st.room = room;
        ctx.sfx('open', { volume: 0.4 });
        if (room === 'cellar' && !powered()) ctx.banner('Cellar', "It's pitch dark. Maybe the fuse box can help.", 1600);
        else ctx.banner(ROOMS[room].name, '', 900);
        bots.forEach((b) => { if (Math.random() < 0.25) b.room = room; });
      }

      // ------------------------------------------------------------ puzzles
      function openBooks() {
        panelOpen = 'puzzle';
        const books = BOOKS.map((b, i) => '<button class="mm-book" data-gact="book-' + i + '" style="background:' + b.color + '" title="' + b.name + ', ' + b.year + '"><span>' + b.year + '</span></button>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('layers', 18) + ' The bookshelf</h3><p>Six books have unusually worn spines. Pull them in the right order.' + (hasClue('poem') ? ' <i>' + U.esc(CLUES.poem.text) + '</i>' : '') + '</p><div class="mm-shelf">' + books + '</div><p class="faint">Pulled: ' + (st.bookSeq.length ? st.bookSeq.map((i) => BOOKS[i].name).join(' → ') : 'none') + '</p>', 'center');
      }
      function openSafe() {
        panelOpen = 'puzzle';
        st.safeEntry = st.safeEntry || '';
        const keys = [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((k) => '<button class="btn mm-key" data-gact="key-' + k + '">' + k + '</button>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('lock', 18) + ' Wall safe</h3><p>A four-digit dial. Lord Ashcombe liked to use times he could not forget.</p><div class="mm-display">' + (st.safeEntry + '____').slice(0, 4).split('').join(' ') + '</div><div class="mm-keypad">' + keys + '</div>', 'center');
      }
      function openFuses() {
        panelOpen = 'puzzle';
        const labels = ['Hall', 'Study', 'Cellar', 'Kitchen', 'Garden'];
        const row = st.fuses.map((on, i) => '<button class="mm-fuse' + (on ? ' on' : '') + '" data-gact="fuse-' + i + '"><i></i><span>' + labels[i] + '</span></button>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('bolt', 18) + ' Fuse box</h3><p>Each switch flips itself and the switches beside it. Light every lamp to restore power.</p><div class="mm-fuses">' + row + '</div>', 'center');
      }
      function openAccuse() {
        panelOpen = 'puzzle';
        const found = st.clues.map((c) => '<li><b>' + CLUES[c].name + ':</b> ' + U.esc(CLUES[c].text) + '</li>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('users', 18) + ' Name the culprit</h3><p>The household waits in the parlor. Who made Lord Ashcombe and his fortune disappear?</p>' +
          '<div class="gp-grid">' + SUSPECTS.map((s) => '<button class="gp-card" data-gact="accuse-' + s.id + '"><b style="color:' + U.shade(s.color, 0.45) + '">' + s.name + '</b><small>' + s.role + '</small></button>').join('') + '</div>' +
          '<h4>Your notes (' + st.clues.length + ')</h4>' + (found ? '<ul class="mm-notes">' + found + '</ul>' : '<p class="faint">No clues yet. Search the house.</p>'), 'center wide');
      }
      function openFurnace() {
        if (secrets.isUnlocked()) {
          panelOpen = 'puzzle';
          ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('fire', 18) + ' The furnace</h3><p>The fire burns steady and bright. It remembers you.</p><div class="gp-actions"><button class="btn btn-play" data-gact="terminal">' + BF.icon('terminal', 14) + 'Approach the core</button></div>', 'center');
          return;
        }
        if (furnaceGlow >= 1) { say('The furnace roars softly. Beside it, the anvil glows: four marks, ◆ ▲ ● ■, pulse with the fire.'); return; }
        panelOpen = 'puzzle';
        const dials = st.dials.map((ch, i) => '<div class="mm-dial"><button class="btn btn-xs" data-gact="dial-up-' + i + '">' + BF.icon('chevronUp', 12) + '</button><b>' + ch + '</b><button class="btn btn-xs" data-gact="dial-down-' + i + '">' + BF.icon('chevronDown', 12) + '</button></div>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('fire', 18) + ' The old furnace</h3><p>Cold iron, older than the house. Five brass letter dials are set into its door. A plaque reads: <b>SPEAK THE WORD AND I WILL WAKE.</b></p><div class="mm-dials">' + dials + '</div><div class="gp-actions"><button class="btn btn-outline" data-gact="lever">' + BF.icon('bolt', 14) + 'Pull the lever</button></div>', 'center');
      }
      function openRhythm() {
        if (secrets.isUnlocked()) return openFurnace();
        panelOpen = 'puzzle';
        if (!st.rhythm) st.rhythm = { round: 0, lens: [4, 5, 6], seq: secrets.sequence(4), input: [], showing: 0, showT: 0 };
        playRhythm();
      }
      function renderRhythm() {
        const r = st.rhythm;
        const runes = secrets.RUNES.map((g, i) => '<button class="mm-rune" data-gact="rune-' + i + '"' + (r.showing ? ' disabled' : '') + ' data-i="' + i + '">' + g + '</button>').join('');
        ctx.ui.panel('puzzle', '<button class="btn btn-ghost btn-sm gp-close" data-gact="close" aria-label="Close">' + BF.icon('x', 14) + '</button><h3>' + BF.icon('anvil', 18) + ' The anvil</h3><p>The fire flickers in a pattern. Strike the marks in the same rhythm.</p><div class="mm-runes">' + runes + '</div><p class="faint">' + (r.showing ? 'Watch the fire…' : 'Strikes: ' + r.input.length + ' / ' + r.seq.length) + ' · Round ' + (r.round + 1) + ' / ' + r.lens.length + '</p><div class="gp-actions"><button class="btn btn-ghost btn-sm" data-gact="replay"' + (r.showing ? ' disabled' : '') + '>Watch again</button></div>', 'center');
        highlightRune(r.lit);
      }
      function highlightRune(i) {
        const el = ctx.ui.el.querySelectorAll('.mm-rune');
        el.forEach((b) => b.classList.toggle('lit', +b.dataset.i === i));
      }
      function playRhythm() {
        const r = st.rhythm;
        r.showing = 1; r.showIdx = 0; r.showT = 0.6; r.lit = -1; r.input = [];
        renderRhythm();
      }

      function accuse(id) {
        const keyClues = st.clues.filter((c) => CLUES[c].key).length;
        if (id !== 'thorne') { ctx.sfx('error'); say(SUSPECTS.find((s) => s.id === id).name + ' looks shocked. "Me? Look at the evidence, detective." It does not add up. Keep searching.'); const b = U.pick(bots); if (b) ctx.botSay(b.bot, 'any', 800); return; }
        if (keyClues < 2) { ctx.sfx('error'); say('Mr. Thorne scoffs. "Accusations need proof." You need at least two pieces of evidence that point to the culprit.'); return; }
        st.flags.solved = true;
        closePanels();
        ctx.sfx('win');
        const trueEnd = d.beetles.length >= 5;
        if (trueEnd) {
          st.flags.trueEnding = true;
          ctx.badge('mym_true');
          say('Thorne confesses: he forged the ledgers and tried to take the fortune. But the vault was empty. As the inspector\'s car pulls up, the five golden beetles in the study click into place and the greenhouse lamp flickers. Lord Ashcombe steps out, very much alive. "I hid the fortune where only a patient eye would find it," he says. "Thank you, detective."', 'The whole truth');
        } else say('Thorne\'s face falls. "The ledgers... I only borrowed it. I meant to pay it back." He planned to catch the 11:40 night train. The case is closed... but the golden beetles hint that the story is not over.', 'Case closed');
        finish(true, trueEnd);
      }
      function finish(win, trueEnd) {
        if (phase !== 'play') return;
        phase = 'over';
        if (win) {
          ctx.badge('mym_solved');
          ctx.quest('mansion_solved', 1);
          ctx.best('bestTime', Math.round(time * 1000), 'min');
        }
        ctx.end({
          outcome: win ? 'win' : 'lose',
          title: win ? (trueEnd ? 'The whole truth' : 'Case closed!') : 'The inspector has arrived',
          subtitle: win ? 'Solved in ' + U.fmtClock(time) + (trueEnd ? ' · true ending' : '') : 'Midnight struck before you named the culprit.',
          coins: T.rewards.play + (win ? T.rewards.win : 0) + st.beetlesNow * T.rewards.beetle + (trueEnd ? T.rewards.trueEnd : 0),
          xp: T.rewards.xpPlay + (win ? T.rewards.xpWin : 0),
          stats: [['Clues', st.clues.length + ' / ' + Object.keys(CLUES).length], ['Golden beetles', d.beetles.length + ' / 5'], ['Time', U.fmtClock(time)]],
          delay: win ? 2600 : 900,
        });
      }

      function hint() { say(nextHint(), 'Hint journal'); }
      function nextHint() {
        const steps = [
          [!hasClue('letter'), 'The portrait in the foyer hangs a little crooked.'],
          [!st.flags.power, 'The fuse box in the kitchen controls the cellar lights. Each switch flips its neighbours too.'],
          [!hasClue('scarf'), 'Search the cellar once the power is on. Check how someone could get in from outside.'],
          [!st.flags.shelfOpen, 'The library poem tells you which books to pull: crimson, sea, the eldest, the tree.'],
          [!st.flags.studyOpen, 'Use the study key on the study door upstairs (select it in your bag first).'],
          [!st.flags.safeOpen, 'The clock in the foyer stopped at a time. Try it on the safe.'],
          [d.beetles.length >= 5 && !st.flags.drawerOpen && st.flags.safeOpen, 'All five beetles are home. Try the signet ring on the display case in the study.'],
          [true, 'Go to the parlor and name the culprit. The letter, the scarf and the ticket all point one way.'],
        ];
        return steps.find((x) => x[0])[1];
      }

      // ------------------------------------------------------------------ UI
      function renderDock() {
        if (phase !== 'play') { ctx.ui.remove('dock'); return; }
        const items = st.items.map((it) => '<button class="btn btn-sm' + (st.selected === it.id ? ' btn-primary' : '') + '" data-gact="item-' + it.id + '">' + BF.icon('key', 12) + it.name + '</button>').join('');
        ctx.ui.panel('dock', '<div class="gp-row"><span class="pill">' + BF.icon('note', 11) + 'Clues ' + st.clues.length + '</span><span class="pill gold">' + BF.icon('sparkle', 11) + 'Beetles ' + d.beetles.length + '/5</span>' + (items || '<span class="faint" style="font-size:12px">Bag is empty</span>') +
          '<button class="btn btn-sm btn-ghost" data-gact="notes">' + BF.icon('note', 12) + 'Notes</button>' + (hints ? '<button class="btn btn-sm btn-outline" data-gact="hint">' + BF.icon('info', 12) + 'Hint</button>' : '') + '</div>', 'dock');
      }
      renderDock();

      ctx.ui.on((a) => {
        if (a === 'close' || a === 'close-say') { closePanels(); return; }
        if (a === 'hint') return hint();
        if (a === 'notes') return say(st.clues.length ? st.clues.map((c) => '<b>' + CLUES[c].name + ':</b> ' + U.esc(CLUES[c].text)).join('<br>') : 'No clues yet.', 'Notes');
        if (a.indexOf('item-') === 0) { const id = a.slice(5); st.selected = st.selected === id ? null : id; renderDock(); ctx.sfx('click'); return; }
        if (a.indexOf('book-') === 0) {
          const i = +a.slice(5);
          st.bookSeq.push(i);
          ctx.sfx('click');
          const k = st.bookSeq.length - 1;
          if (st.bookSeq[k] !== BOOK_ORDER[k]) { st.bookSeq = []; ctx.sfx('error'); openBooks(); floats.add(W / 2, 200, 'The books slide back into place.', '#cfd6e2', 14); return; }
          if (st.bookSeq.length === BOOK_ORDER.length) { st.flags.shelfOpen = true; closePanels(); ctx.sfx('powerup'); say('A click, and a panel in the shelf swings open. Inside: a small brass key labelled STUDY.'); addItem('studykey', 'Study key'); return; }
          openBooks(); return;
        }
        if (a.indexOf('key-') === 0) {
          const k = a.slice(4);
          if (k === 'C') st.safeEntry = '';
          else if (k === 'OK') {
            if (st.safeEntry === '1107') { st.flags.safeOpen = true; closePanels(); ctx.sfx('purchase'); say('The safe swings open. Inside: a train ticket and Lord Ashcombe\'s signet ring.'); addClue('ticket'); addItem('ring', 'Signet ring'); return; }
            ctx.sfx('error'); st.safeEntry = '';
          } else if (st.safeEntry.length < 4) { st.safeEntry += k; ctx.sfx('beep', { volume: 0.3 }); }
          openSafe(); return;
        }
        if (a.indexOf('fuse-') === 0) {
          const i = +a.slice(5);
          for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < 5) st.fuses[j] = !st.fuses[j];
          ctx.sfx('click');
          if (st.fuses.every(Boolean)) { st.flags.power = true; closePanels(); ctx.sfx('powerup'); say('Every lamp glows. Somewhere below, lights flicker on in the cellar.'); return; }
          openFuses(); return;
        }
        if (a.indexOf('accuse-') === 0) return accuse(a.slice(7));
        if (a.indexOf('dial-') === 0) {
          const [, dir, idx] = a.split('-');
          const i = +idx, c = st.dials[i].charCodeAt(0) - 65;
          st.dials[i] = String.fromCharCode(65 + ((c + (dir === 'up' ? 1 : 25)) % 26));
          ctx.sfx('click', { volume: 0.4 });
          openFurnace(); return;
        }
        if (a === 'lever') {
          if (secrets.checkWord(st.dials.join(''))) {
            secrets.markLit();
            furnaceGlow = 0.01;
            closePanels();
            flash = 1;
            ctx.sfx('secret');
            parts.emit(580, 250, { count: 90, colors: ['#ff7a2e', '#ffd66b', '#ffffff'], speed: 300, life: 1.2 });
            say('The dials lock. Deep inside the iron, something breathes in... and the furnace roars awake. Beside it, the anvil begins to glow.', '???');
          } else { ctx.sfx('error'); say('The lever clanks. The furnace stays cold.'); }
          return;
        }
        if (a === 'replay' && st.rhythm && !st.rhythm.showing) return playRhythm();
        if (a.indexOf('rune-') === 0 && st.rhythm && !st.rhythm.showing) {
          const r = st.rhythm, v = +a.slice(5);
          r.input.push(v);
          ctx.sfx('anvil', { pitch: 0.8 + v * 0.15 });
          const k = r.input.length - 1;
          if (r.input[k] !== r.seq[k]) { ctx.sfx('error'); r.input = []; floats.add(W / 2, 200, 'The rhythm falters. The fire shows it again.', '#ff8b98', 14); r.replayT = 0.8; renderRhythm(); return; }
          if (r.input.length === r.seq.length) {
            r.round++;
            if (r.round >= r.lens.length) {
              closePanels();
              const first = secrets.unlock();
              flash = 1.5;
              ctx.sfx('secret');
              parts.emit(580, 250, { count: 140, colors: ['#ff5f0f', '#ffd66b', '#ffffff', '#ff2e00'], speed: 380, life: 1.4 });
              ctx.banner('FORGECORE', first ? 'You found something that wasn\'t supposed to be found.' : 'The core remembers you.', 2400);
              openTerminalT = 1.6;
              return;
            }
            r.seq = secrets.sequence(r.lens[r.round]); r.input = [];
            ctx.sfx('powerup', { volume: 0.5 });
            r.replayT = 0.7;
          }
          renderRhythm(); return;
        }
        if (a === 'terminal') { closePanels(); if (BF.forgecore) BF.forgecore.open(); }
      });

      // ---------------------------------------------------------------- bots
      const bots = [];
      function addBot(b) { if (bots.some((x) => x.bot.id === b.id)) return; bots.push({ bot: b, room: U.pick(Object.keys(ROOMS).filter((r) => r !== 'cellar')), x: 300 + Math.random() * 400, t: 10 + Math.random() * 20, facing: Math.random() < 0.5 ? 1 : -1 }); }
      ctx.bots.forEach(addBot);

      function visibleSpots() {
        const room = ROOMS[st.room];
        return room.spots.filter((s) => !(room.dark && s.need && !s.need()));
      }

      // ---------------------------------------------------------------- draw
      function drawRoom(g, t) {
        const room = ROOMS[st.room];
        const dark = room.dark && !powered();
        g.fillStyle = room.wall; g.fillRect(0, 0, W, FLOOR);
        if (!room.outdoor) {
          g.fillStyle = 'rgba(255,255,255,.04)';
          for (let x = 0; x < W; x += 48) g.fillRect(x, 0, 22, FLOOR);
          g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, FLOOR - 16, W, 16);
        } else {
          for (let i = 0; i < 40; i++) G.circle(g, (i * 137) % W, (i * 53) % 200, 1.2, 'rgba(255,255,255,.6)');
          G.circle(g, 840, 70, 34, '#f4f1ea'); G.circle(g, 828, 62, 30, room.wall);
        }
        g.fillStyle = room.floor; g.fillRect(0, FLOOR, W, DOCK - FLOOR);
        g.fillStyle = 'rgba(0,0,0,.18)'; for (let x = -40; x < W; x += 60) { g.beginPath(); g.moveTo(x, FLOOR); g.lineTo(x + 30, FLOOR); g.lineTo(x - 30, DOCK); g.lineTo(x - 90, DOCK); g.fill(); }
        // room props
        const R = st.room;
        if (R === 'foyer') {
          G.fillRR(g, 395, 75, 160, 190, 6, '#b8860b'); G.fillRR(g, 405, 85, 140, 170, 4, '#3a2a1e'); G.circle(g, 475, 150, 34, '#e0ac69'); G.fillRR(g, 440, 185, 70, 60, 10, '#1f2a44'); G.fillRR(g, 452, 118, 46, 16, 6, '#6b6b6b');
          if (st.flags.portraitMoved) { g.save(); g.translate(395, 75); g.rotate(-0.06); g.globalAlpha = 0.2; g.fillStyle = '#000'; g.fillRect(0, 0, 160, 190); g.restore(); }
          G.fillRR(g, 130, 110, 70, 250, 6, '#5a3a2a'); G.circle(g, 165, 160, 24, '#f4f1ea'); G.line(g, 165, 160, 165, 142, '#1b1b22', 3); G.line(g, 165, 160, 171, 164, '#1b1b22', 2);
          G.fillRR(g, 240, 290, 46, 70, 6, '#2a2f3a'); G.line(g, 252, 290, 246, 250, '#8b5a2b', 3); G.line(g, 270, 290, 280, 256, '#c0392b', 3);
          g.fillStyle = '#6a4a2a'; for (let i = 0; i < 8; i++) g.fillRect(660 + i * 20, 180 - i * 16, 160 - i * 20, 14);
          G.fillRR(g, 700, 260, 90, 100, 4, '#2a1e18'); G.circle(g, 775, 312, 4, '#b8860b');
          G.fillRR(g, 20, 150, 90, 210, 6, '#3a2418'); G.fillRR(g, 850, 150, 90, 210, 6, '#3a2418');
          for (let i = 0; i < 4; i++) G.circle(g, 598 + (i % 2) * 22, 180 + Math.floor(i / 2) * 22, 5, '#b8860b');
        } else if (R === 'upper') {
          G.fillRR(g, 140, 110, 120, 250, 6, '#3a2418'); G.fillRR(g, 620, 110, 120, 250, 6, st.flags.studyOpen ? '#1b1b22' : '#3a2418');
          G.fillRR(g, 380, 70, 160, 170, 6, '#1a2a4a'); G.circle(g, 480, 130, 22, '#f4f1ea');
          g.fillStyle = '#5a3a2a'; g.fillRect(380, 150, 160, 6); g.fillRect(456, 70, 6, 170);
          g.fillStyle = '#4a3020'; g.fillRect(400, 300, 160, 60);
        } else if (R === 'library') {
          G.fillRR(g, 300, 90, 360, 230, 6, '#4a3020');
          for (let row = 0; row < 3; row++) for (let i = 0; i < 16; i++) { const c = ['#8b3a3a', '#3a5a8b', '#6b8b3a', '#8b7a3a', '#5a3a6b'][(i * 3 + row) % 5]; g.fillStyle = c; g.fillRect(312 + i * 21, 102 + row * 72, 16, 60); }
          if (st.flags.shelfOpen) { g.fillStyle = '#0b0a0e'; g.fillRect(450, 180, 60, 40); }
          G.fillRR(g, 100, 250, 90, 110, 4, '#5a3a2a'); G.fillRR(g, 90, 240, 110, 30, 4, '#f4ecd0');
          G.circle(g, 845, 290, 40, '#2e86c1'); G.line(g, 845, 330, 845, 360, '#5a3a2a', 6);
          G.fillRR(g, 700, 70, 70, 50, 4, '#6a4a2a');
        } else if (R === 'study') {
          G.fillRR(g, 560, 90, 130, 140, 6, '#b8860b'); G.fillRR(g, 570, 100, 110, 120, 4, st.flags.safeOpen ? '#2a2f3a' : '#3a5a3a');
          if (st.flags.safeOpen) { G.fillRR(g, 585, 115, 80, 90, 4, '#1b1b22'); }
          G.fillRR(g, 220, 250, 260, 110, 6, '#5a3a2a'); G.fillRR(g, 250, 236, 110, 20, 3, '#f4ecd0');
          G.fillRR(g, 760, 200, 120, 120, 6, '#6a4a2a'); for (let i = 0; i < 5; i++) G.circle(g, 782 + i * 19, 250, 6, i < d.beetles.length ? '#ffd66b' : '#2a1e18');
        } else if (R === 'kitchen') {
          G.fillRR(g, 110, 110, 110, 130, 6, '#6a707c'); for (let i = 0; i < 5; i++) G.circle(g, 130 + i * 18, 150, 5, st.fuses[i] ? '#ffd66b' : '#2a2f3a');
          G.fillRR(g, 300, 290, 330, 70, 6, '#8b5a2b'); G.fillRR(g, 410, 256, 60, 34, 10, '#f4f1ea');
          g.fillStyle = 'rgba(60,40,20,.7)'; g.beginPath(); g.ellipse(685, 345, 30, 12, 0.2, 0, Math.PI * 2); g.fill();
          G.fillRR(g, 760, 130, 110, 230, 6, '#3a2418'); G.fillRR(g, 780, 150, 70, 60, 4, '#1a2a4a');
        } else if (R === 'garden') {
          G.fillRR(g, 80, 120, 200, 230, 8, 'rgba(143,211,255,.25)'); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 2; g.strokeRect(80, 120, 200, 230);
          if (Math.sin(t * 2) > 0 || st.flags.trueEnding) G.circle(g, 180, 230, 8, '#ffd66b');
          for (let i = 0; i < 6; i++) { G.circle(g, 380 + i * 26, 300, 20, '#2f8f47'); G.circle(g, 380 + i * 26, 288, 6, '#c0392b'); }
          G.fillRR(g, 610, 150, 170, 200, 6, '#6b4b2a'); g.fillStyle = '#4a3020'; g.beginPath(); g.moveTo(600, 156); g.lineTo(695, 100); g.lineTo(790, 156); g.fill();
        } else if (R === 'parlor') {
          SUSPECTS.forEach((sp, i) => {
            const x = 250 + i * 140;
            G.avatarSide(g, x, FLOOR + 4, 110, { skin: ['#e0ac69', '#f1c27d', '#c68642', '#8d5524'][i], shirt: sp.color, pants: '#1f2a44', shoes: '#1b1b22', hair: ['#d7dde6', '#ff9a3c', '#1b1b22', '#1b1b22'][i] }, { facing: i < 2 ? 1 : -1 });
            G.text(g, sp.name, x, FLOOR + 26, { size: 12, align: 'center', color: '#fff', weight: 800 });
          });
          G.fillRR(g, 790, 190, 130, 170, 6, '#6a707c'); G.fillRR(g, 815, 250, 80, 110, 4, '#1b1b22');
        } else if (R === 'cellar') {
          G.fillRR(g, 90, 110, 170, 240, 4, '#3a2418'); for (let r = 0; r < 5; r++) for (let c = 0; c < 4; c++) G.circle(g, 115 + c * 40, 140 + r * 44, 12, '#1a3a2a');
          G.fillRR(g, 300, 60, 100, 130, 4, '#2a2f3a');
          const glow = furnaceGlow;
          G.fillRR(g, 470, 110, 220, 250, 14, '#2a2426'); G.fillRR(g, 500, 180, 160, 140, 10, glow > 0 ? '#3a1a0a' : '#141012');
          for (let i = 0; i < 5; i++) { G.fillRR(g, 506 + i * 31, 138, 26, 30, 4, '#8a6a2a'); G.text(g, secrets.state().wordSolved ? 'EMBER'[i] : st.dials[i], 519 + i * 31, 160, { size: 16, align: 'center', color: '#1b1b22', weight: 900 }); }
          if (glow > 0) {
            const fl = glow * (0.75 + Math.sin(t * 13) * 0.15);
            g.globalAlpha = fl; G.circle(g, 580, 270, 60, '#ff7a2e'); G.circle(g, 580, 280, 36, '#ffd66b'); g.globalAlpha = 1;
            const halo = g.createRadialGradient(580, 250, 20, 580, 250, 320);
            halo.addColorStop(0, 'rgba(255,122,46,' + 0.35 * glow + ')'); halo.addColorStop(1, 'rgba(255,122,46,0)');
            g.fillStyle = halo; g.fillRect(0, 0, W, DOCK);
          }
          G.fillRR(g, 730, 290, 120, 40, 6, '#39414f'); G.fillRR(g, 760, 330, 60, 30, 4, '#2a2f3a');
          secrets.RUNES.forEach((r2, i) => G.text(g, r2, 752 + i * 26, 318, { size: 14, align: 'center', color: glow > 0 ? (st.rhythm && st.rhythm.lit === i ? '#ffffff' : '#ff9d5c') : '#5a5f6a', weight: 900 }));
          g.fillStyle = '#3a3030'; for (let i = 0; i < 6; i++) g.fillRect(840 + i * 14, 200 - i * 22, 90 - i * 14, 12);
          if (dark) { g.fillStyle = 'rgba(0,0,0,.93)'; g.fillRect(0, 0, W, DOCK); G.text(g, 'It is too dark to see.', W / 2, 240, { size: 16, align: 'center', color: '#5a5f6a' }); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(840, 60, 100, 140); }
        }
        // bots in this room
        for (const b of bots) if (b.room === st.room && !dark) {
          G.avatarSide(g, b.x, FLOOR + 90, 70, b.bot.look, { facing: b.facing });
          G.nameTag(g, b.x, FLOOR + 10, b.bot.displayName, '#fff');
          const bb = ctx.bubbleText(b.bot.id);
          if (bb) G.bubble(g, b.x, FLOOR - 10, bb);
        }
        G.avatarSide(g, 90, FLOOR + 100, 80, ctx.player.look, { facing: 1 });
        const mb = ctx.bubbleText('me');
        if (mb) G.bubble(g, 90, FLOOR - 4, mb);
      }

      // ------------------------------------------------------------ 3D view
      const view = !V ? null : (() => {
        let builtKey = null, roomG = null, glowParts = [], fireLight = null, suspects = [];
        const P = (x, y, w, h, d, color, o) => V.box(x + w / 2, FLOOR - y - h, (o && o.z != null ? o.z : 0) + d / 2, w, h, d, color, Object.assign({ parent: roomG }, o));
        const wallTex = (key, base, stripe) => BF.g3d.canvasTex('mm-wall:' + key, 128, 128, (g2, w, h) => { g2.fillStyle = base; g2.fillRect(0, 0, w, h); g2.fillStyle = stripe; for (let x = 0; x < w; x += 32) g2.fillRect(x, 0, 14, h); g2.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 8; y < h; y += 32) for (let x = 8; x < w; x += 32) { g2.beginPath(); g2.arc(x + 12, y + 8, 4, 0, Math.PI * 2); g2.fill(); } }, { repeat: [960 / 128 * 1.5, 360 / 128 * 1.5] });
        const floorTex = (key, base) => BF.g3d.canvasTex('mm-floor:' + key, 128, 128, (g2, w, h) => { g2.fillStyle = base; g2.fillRect(0, 0, w, h); g2.fillStyle = 'rgba(0,0,0,.2)'; for (let y = 0; y < h; y += 16) g2.fillRect(0, y, w, 2); for (let y = 0; y < h; y += 16) g2.fillRect(((y * 37) % 90) + 20, y, 2, 16); }, { repeat: [12, 6] });
        // ------------------------------------------------ set dressing kit
        // Wall-mounted pieces use P() (screen rectangle on the back wall, depth outward).
        // Floor pieces use atS() so they stand where the 2D art had them.
        const atS = (sx, z) => 480 + (sx - 480) * (CAM_D - z) / CAM_D;
        const light = (x, y, z, color, power, dist) => { const l = new THREE.PointLight(color, power, dist || 700, 1); l.position.set(x, y, z); roomG.add(l); return l; };
        const tex = (key, w, h, fn, opts) => BF.g3d.canvasTex('mm-' + key, w, h, fn, opts);
        const painting = (kind) => tex('paint:' + kind, 128, 160, (g2, w, h) => {
          const sky = g2.createLinearGradient(0, 0, 0, h);
          if (kind === 'ashcombe' || kind === 'lady') {
            sky.addColorStop(0, kind === 'lady' ? '#3a2a4a' : '#2a3a2a'); sky.addColorStop(1, '#0e120e');
            g2.fillStyle = sky; g2.fillRect(0, 0, w, h);
            const lady = kind === 'lady';
            g2.fillStyle = lady ? '#6a2a5a' : '#15151c'; g2.beginPath(); g2.moveTo(14, h); g2.quadraticCurveTo(20, 100, 64, 96); g2.quadraticCurveTo(108, 100, 114, h); g2.fill();
            g2.fillStyle = lady ? '#f4ecd0' : '#e8e2d0'; g2.beginPath(); g2.moveTo(52, 98); g2.lineTo(64, 122); g2.lineTo(76, 98); g2.fill();
            g2.fillStyle = '#e0ac69'; g2.fillRect(44, 44, 40, 50);
            if (lady) { g2.fillStyle = '#5a2a1a'; g2.fillRect(38, 34, 52, 16); g2.fillRect(36, 40, 10, 50); g2.fillRect(82, 40, 10, 50); }
            else { g2.fillStyle = '#b9b3a6'; g2.fillRect(40, 48, 8, 34); g2.fillRect(80, 48, 8, 34); g2.fillRect(46, 40, 36, 6); g2.fillStyle = '#1b1b22'; g2.fillRect(40, 18, 48, 24); g2.fillRect(34, 38, 60, 5); }
            g2.fillStyle = '#1b1b22'; g2.fillRect(52, 60, 7, 4); g2.fillRect(69, 60, 7, 4);
            g2.fillStyle = lady ? '#a0304a' : '#6b3a2a'; g2.fillRect(56, 80, 16, 3);
            if (!lady) { g2.fillStyle = '#c9a227'; g2.beginPath(); g2.arc(64, 130, 6, 0, Math.PI * 2); g2.fill(); }
          } else if (kind === 'sea') {
            sky.addColorStop(0, '#1d2a4a'); sky.addColorStop(0.55, '#e8a060'); sky.addColorStop(0.56, '#2a4a6a'); sky.addColorStop(1, '#10203a');
            g2.fillStyle = sky; g2.fillRect(0, 0, w, h);
            g2.fillStyle = '#ffd08a'; g2.beginPath(); g2.arc(88, 84, 12, 0, Math.PI * 2); g2.fill();
            g2.fillStyle = '#2a1a10'; g2.fillRect(30, 96, 44, 10); g2.fillRect(50, 50, 3, 46);
            g2.fillStyle = '#f4ecd0'; g2.beginPath(); g2.moveTo(53, 52); g2.lineTo(74, 88); g2.lineTo(53, 88); g2.fill(); g2.beginPath(); g2.moveTo(50, 58); g2.lineTo(32, 88); g2.lineTo(50, 88); g2.fill();
            g2.strokeStyle = 'rgba(255,255,255,.25)'; for (let y = 104; y < h; y += 9) { g2.beginPath(); g2.moveTo(0, y); g2.lineTo(w, y + 3); g2.stroke(); }
          } else {
            sky.addColorStop(0, '#0f1a33'); sky.addColorStop(1, '#3a4a6a');
            g2.fillStyle = sky; g2.fillRect(0, 0, w, h);
            g2.fillStyle = '#f4f1ea'; g2.beginPath(); g2.arc(92, 36, 12, 0, Math.PI * 2); g2.fill();
            g2.fillStyle = '#2f5a3a'; g2.beginPath(); g2.moveTo(0, 120); g2.quadraticCurveTo(50, 80, 128, 110); g2.lineTo(128, h); g2.lineTo(0, h); g2.fill();
            g2.fillStyle = '#1b1b22'; g2.fillRect(46, 82, 36, 26); g2.beginPath(); g2.moveTo(42, 84); g2.lineTo(64, 66); g2.lineTo(86, 84); g2.fill();
            g2.fillStyle = '#ffd66b'; g2.fillRect(52, 90, 5, 6); g2.fillRect(70, 90, 5, 6);
          }
          g2.strokeStyle = 'rgba(0,0,0,.35)'; g2.lineWidth = 6; g2.strokeRect(0, 0, w, h);
        });
        const rugTex = (c1, c2) => tex('rug:' + c1 + c2, 256, 128, (g2, w, h) => {
          g2.fillStyle = c1; g2.fillRect(0, 0, w, h);
          g2.strokeStyle = c2; g2.lineWidth = 6; g2.strokeRect(10, 10, w - 20, h - 20); g2.lineWidth = 2; g2.strokeRect(20, 20, w - 40, h - 40);
          g2.fillStyle = c2; g2.beginPath(); g2.moveTo(w / 2, 30); g2.lineTo(w / 2 + 60, h / 2); g2.lineTo(w / 2, h - 30); g2.lineTo(w / 2 - 60, h / 2); g2.fill();
          g2.fillStyle = c1; g2.beginPath(); g2.moveTo(w / 2, 46); g2.lineTo(w / 2 + 38, h / 2); g2.lineTo(w / 2, h - 46); g2.lineTo(w / 2 - 38, h / 2); g2.fill();
          g2.fillStyle = c2; for (let x = 30; x < w - 20; x += 22) { g2.fillRect(x, 26, 6, 6); g2.fillRect(x, h - 32, 6, 6); }
          g2.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 400; i++) g2.fillRect((i * 37) % w, (i * 53) % h, 1, 1);
        });
        const brickTex = (base) => tex('brick:' + base, 128, 128, (g2, w, h) => {
          g2.fillStyle = U.shade(base, -0.35); g2.fillRect(0, 0, w, h);
          for (let r = 0; r < 8; r++) for (let c = -1; c < 4; c++) { g2.fillStyle = U.shade(base, ((r * 7 + c * 3) % 5) * 0.03 - 0.05); g2.fillRect(c * 32 + (r % 2 ? 16 : 0) + 2, r * 16 + 2, 28, 12); }
        }, { repeat: [8, 3] });
        const tileTex = (a, b) => tex('tile:' + a + b, 64, 64, (g2, w, h) => {
          for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g2.fillStyle = (x + y) % 2 ? a : b; g2.fillRect(x * 16, y * 16, 16, 16); }
          g2.strokeStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i <= 4; i++) { g2.strokeRect(0, i * 16, w, 0.5); g2.strokeRect(i * 16, 0, 0.5, h); }
        }, { repeat: [10, 2] });
        const woodC = '#5a3a22', darkWood = '#3a2414', brass = '#c9a227';
        const panelWall = (base) => {
          // wainscot with raised panels, a chair rail and crown moulding
          P(-240, 250, 1440, 110, 3, U.shade(base, -0.45));
          for (let x = -220; x < 1180; x += 90) { P(x, 264, 72, 80, 5, U.shade(base, -0.38)); P(x + 6, 270, 60, 68, 6, U.shade(base, -0.42)); }
          P(-240, 244, 1440, 8, 8, U.shade(base, -0.2));
          P(-240, 0, 1440, 12, 10, U.shade(base, -0.3)); P(-240, 12, 1440, 5, 6, U.shade(base, 0.1));
        };
        const frame = (x, y, w, h, kind) => { P(x - 10, y - 10, w + 20, h + 20, 6, brass, { metal: 0.6, rough: 0.35 }); P(x - 4, y - 4, w + 8, h + 8, 7, U.shade(brass, -0.3), { metal: 0.5 }); const c = P(x, y, w, h, 8, '#ffffff', { map: painting(kind) }); return c; };
        const sconce = (x, y) => { P(x - 6, y, 12, 26, 6, brass, { metal: 0.6 }); P(x - 10, y + 16, 20, 5, 16, brass, { metal: 0.6 }); const f = V.shape('cone', x, FLOOR - y - 8, 13, 5, 12, 5, '#ffd66b', { parent: roomG, glow: 1.6, shadow: false }); glowParts.push(f); f.userData.candle = true; P(x - 3, y + 2, 6, 14, 14, '#f4ecd0'); };
        const lamp = (sx, z, shade) => {
          const x = atS(sx, z);
          V.shape('cyl', x, 3, z, 34, 6, 34, darkWood, { parent: roomG }); V.shape('cylLo', x, 60, z, 4, 114, 4, brass, { parent: roomG, metal: 0.6 });
          const s = V.shape('cone', x, 128, z, 40, 30, 40, shade || '#f4d7a0', { parent: roomG, glow: 0.7 }); s.rotation.x = 0;
          light(x, 120, z + 10, '#ffcf8a', 90, 520);
        };
        const armchair = (sx, z, color, rot) => {
          const g = V.group(roomG); g.position.set(atS(sx, z), 0, z); g.rotation.y = rot || 0;
          V.box(0, 0, 0, 56, 26, 50, U.shade(color, -0.3), { parent: g }); V.box(0, 26, 4, 50, 10, 44, color, { parent: g });
          V.box(0, 26, -22, 56, 48, 10, color, { parent: g }); V.box(0, 72, -22, 60, 8, 12, U.shade(color, 0.1), { parent: g });
          for (const sd of [-1, 1]) { V.box(sd * 26, 26, 0, 8, 22, 50, U.shade(color, -0.1), { parent: g }); V.box(sd * 26, 0, 20, 6, 6, 6, darkWood, { parent: g }); }
          return g;
        };
        const table = (sx, z, w, d, h, color) => {
          const x = atS(sx, z);
          V.box(x, h - 5, z, w, 5, d, color, { parent: roomG });
          for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) V.box(x + ox * (w / 2 - 5), 0, z + oz * (d / 2 - 5), 5, h - 5, 5, U.shade(color, -0.2), { parent: roomG });
          return x;
        };
        const plant = (sx, z, s) => {
          const x = atS(sx, z); s = s || 1;
          V.shape('cyl', x, 12 * s, z, 22 * s, 24 * s, 22 * s, '#8a4a2a', { parent: roomG });
          for (let i = 0; i < 6; i++) { const a = i * 1.05; const l = V.shape('sphere', x + Math.cos(a) * 9 * s, 34 * s + (i % 2) * 8 * s, z + Math.sin(a) * 9 * s, 20 * s, 16 * s, 20 * s, i % 2 ? '#2f8f47' : '#3aa656', { parent: roomG }); l.castShadow = true; }
        };
        const windowAt = (x, y, w, h) => {
          P(x - 12, y - 12, w + 24, h + 24, 6, '#e8e2d0'); P(x, y, w, h, 7, '#0e1a33', { basic: true });
          const moon = V.shape('sphere', x + w * 0.7, FLOOR - y - h * 0.3, 8, 26, 26, 4, '#f4f1ea', { parent: roomG, basic: true }); moon.castShadow = false;
          P(x + w / 2 - 3, y, 6, h, 10, '#e8e2d0'); P(x, y + h / 2 - 3, w, 6, 10, '#e8e2d0');
          P(x - 16, y + h + 4, w + 32, 8, 18, '#e8e2d0');
          for (const sd of [0, 1]) P(sd ? x + w - 10 : x - 34, y - 20, 44, h + 50, 14, '#7a1e2e');
          P(x - 40, y - 26, w + 80, 8, 16, brass, { metal: 0.5 });
        };
        // a proper panelled door with casing, knob and hinges
        const doorAt = (x, y, w, h, color, open) => {
          P(x - 10, y - 10, w + 20, h + 10, 6, '#e8e2d0'); P(x - 14, y - 16, w + 28, 8, 9, '#e8e2d0');
          if (open) { P(x, y, w, h, 9, '#07060a', { basic: true }); return; }
          const c = color || '#4a2c1a';
          P(x, y, w, h, 8, c);
          for (const [py, ph] of [[0.08, 0.36], [0.52, 0.4]]) for (const px of [0.12, 0.54]) P(x + w * px, y + h * py, w * 0.34, h * ph, 10, U.shade(c, 0.08));
          V.shape('sphere', x + w - 16, FLOOR - y - h * 0.52, 12, 9, 9, 9, brass, { parent: roomG, metal: 0.7, rough: 0.3 });
          for (const hy of [0.15, 0.8]) P(x + 2, y + h * hy, 5, 12, 10, brass, { metal: 0.6 });
        };
        const rug = (c1, c2, x0, z0, x1, z1) => { const r = V.ground(x0, z0, x1, z1, '#ffffff', { parent: roomG, y: 0.6, map: rugTex(c1, c2) }); r.receiveShadow = true; return r; };

        function build() {
          const R = st.room, room = ROOMS[R];
          builtKey = key();
          if (roomG) V.remove(roomG);
          if (fireLight) { V.remove(fireLight); fireLight = null; }
          roomG = V.group();
          glowParts = []; suspects = [];
          const outdoor = room.outdoor;
          V.preset(outdoor ? 'night' : R === 'cellar' ? 'cave' : 'indoor', { fogNear: 2400, fogFar: 5000 });
          V.shadowSize(600);
          V.focus(480, 100);
          if (outdoor) {
            V.box(480, -1, -400, 3000, 1400, 2, '#101a33', { parent: roomG, basic: true });
            const moon = V.shape('sphere', 840, FLOOR - 70, -300, 60, 60, 60, '#f4f1ea', { parent: roomG, basic: true });
            moon.position.set(480 + (840 - 480) * (CAM_D + 300) / CAM_D, 90 + (FLOOR - 70 - 90) * (CAM_D + 300) / CAM_D, -300);
            const r = U.rng('mm-stars'), stars = [];
            for (let i = 0; i < 70; i++) stars.push({ x: -300 + r() * 1600, y: 200 + r() * 700, z: -390, w: 3, h: 3, d: 1, color: '#ffffff' });
            V.boxes(stars, { parent: roomG, basic: true, shadow: false });
            const hedge = [];
            for (let x = -200; x < 1200; x += 60) hedge.push({ x, y: 0, z: -40, w: 70, h: 70 + ((x * 7) % 30), d: 60, color: '#1f4a2a' });
            V.boxes(hedge, { parent: roomG, geo: 'sphereLo' });
            // the manor's back wall on the right, with the kitchen door in it
            P(740, 60, 460, 300, 30, '#4a3a3a', { map: brickTex('#6a4a3a') });
            P(730, 44, 480, 18, 40, '#2a2226');
          } else if (R === 'cellar') {
            V.box(480, 0, -10, 1600, FLOOR + 400, 20, '#ffffff', { parent: roomG, map: brickTex('#5a4a44') });
          } else {
            V.box(480, 0, -10, 1600, FLOOR + 400, 20, '#ffffff', { parent: roomG, map: wallTex(R, room.wall, U.shade(room.wall, 0.06)) });
            panelWall(room.wall);
          }
          V.ground(-600, 0, 1560, 700, '#ffffff', { parent: roomG, map: outdoor ? BF.g3d.gridTex('#2a4a2a', 'rgba(0,0,0,0)', 1, { repeat: [16, 8], noise: true }) : R === 'kitchen' ? tileTex('#d7dde6', '#39414f') : floorTex(R, room.floor) });
          // doors (the foyer stairs, upper-hall stair gap and cellar stairs are built with their rooms)
          for (const sp of room.spots) if (sp.door && !(R === 'foyer' && (sp.id === 'toUpper' || sp.id === 'toCellar')) && !(R === 'upper' && sp.id === 'toFoyer') && !(R === 'cellar' && sp.id === 'toFoyer')) doorAt(sp.x, sp.y, sp.w, sp.h, R === 'kitchen' && sp.id === 'toGarden' ? '#5a4030' : null);
          if (!outdoor) light(480, 300, 320, R === 'cellar' ? '#ffb070' : '#ffe0b0', R === 'cellar' ? (powered() ? 70 : 0) : 60, 900);

          if (R === 'foyer') {
            rug('#7a1e2e', '#c9a227', 150, 170, 810, 330);
            // portrait of Lord Ashcombe (the frame hangs crooked once moved)
            const g = V.group(roomG); g.position.set(475, FLOOR - 170, 0); g.rotation.z = st.flags.portraitMoved ? 0.07 : 0;
            V.box(0, -100, 0, 170, 200, 6, brass, { parent: g, metal: 0.6, rough: 0.35 }); V.box(0, -94, 2, 158, 188, 6, U.shade(brass, -0.3), { parent: g, metal: 0.5 });
            V.box(0, -88, 4, 146, 176, 6, '#ffffff', { parent: g, map: painting('ashcombe') });
            if (st.flags.portraitMoved) P(430, 250, 40, 22, 2, '#f4ecd0');
            // grandfather clock with a hood, face at 11:07 and a still pendulum
            P(126, 150, 78, 210, 42, darkWood); P(122, 104, 86, 52, 46, woodC); P(118, 96, 94, 10, 50, U.shade(woodC, 0.1));
            for (const fx of [128, 196]) V.shape('sphere', fx, FLOOR - 92, 25, 8, 12, 8, brass, { parent: roomG, metal: 0.6 });
            V.shape('cyl', 165, FLOOR - 130, 47, 46, 2, 46, '#f4f1ea', { parent: roomG }).rotation.x = Math.PI / 2;
            // clock hands stopped at 11:07
            for (const [ang, len, w] of [[(11 + 7 / 60) / 12, 11, 3], [7 / 60, 17, 2]]) { const hub = V.group(roomG); hub.position.set(165, FLOOR - 130, 49); hub.rotation.z = -ang * Math.PI * 2; V.box(0, 0, 0, w, len, 2, '#1b1b22', { parent: hub }); }
            P(140, 190, 50, 130, 44, '#1a1008'); P(162, 200, 4, 80, 46, brass, { metal: 0.6 });
            V.shape('cyl', 164, FLOOR - 290, 47, 20, 3, 20, brass, { parent: roomG, metal: 0.7 }).rotation.x = Math.PI / 2;
            // umbrella stand
            V.shape('cyl', 263, 34, 25, 44, 68, 44, '#2a2f3a', { parent: roomG, metal: 0.3 });
            for (const y of [8, 58]) V.shape('cyl', 263, y, 25, 46, 4, 46, brass, { parent: roomG, metal: 0.6 });
            for (const [x, c, tilt] of [[252, '#8b5a2b', 0.15], [270, '#c0392b', -0.2], [262, '#1f2a44', 0.05]]) { const u = V.shape('cyl', x, 92, 25, 5, 64, 5, c, { parent: roomG }); u.rotation.z = tilt; const hk = V.shape('torus', x - Math.sin(tilt) * 32, 124, 25, 12, 12, 16, c, { parent: roomG }); hk.rotation.y = Math.PI / 2; }
            // key board
            P(584, 164, 62, 62, 6, darkWood);
            for (let i = 0; i < 4; i++) { const hx = 598 + (i % 2) * 30, hy = 180 + Math.floor(i / 2) * 22; P(hx - 2, hy - 2, 4, 4, 12, brass, { metal: 0.6 }); if (i !== 3) V.shape('sphere', hx, FLOOR - hy - 10, 14, 8, 12, 3, brass, { parent: roomG, metal: 0.6 }); }
            // grand staircase with a runner and banister
            for (let i = 0; i < 9; i++) { P(660 + i * 18, 180 - i * 15, 170 - i * 18, 16, 80 - i * 5, woodC); P(680 + i * 18, 180 - i * 15, 120 - i * 18 > 20 ? 50 : 0, 3, 81 - i * 5, '#7a1e2e'); }
            P(660, 196, 170, 164, 22, '#4a3020');
            doorAt(700, 260, 90, 100, '#2a1a10');
            for (let i = 0; i < 9; i++) P(664 + i * 18, 136 - i * 15, 4, 44, 84 - i * 5, '#e8e2d0');
            { const rail = V.box(0, 0, 0, 200, 6, 8, darkWood, { parent: roomG }); rail.position.set(750, FLOOR - 120 + 10, 76); rail.rotation.z = Math.atan2(15, 18); }
            P(654, 120, 14, 76, 88, darkWood); V.shape('sphere', 661, FLOOR - 116, 94, 16, 16, 16, brass, { parent: roomG, metal: 0.6 });
            table(330, 60, 70, 36, 64, woodC); plant(330, 60, 0.9);
            sconce(340, 120); sconce(605, 110);
          } else if (R === 'upper') {
            rug('#1f2a44', '#c9a227', 100, 200, 860, 330);
            doorAt(620, 110, 120, 250, '#4a2c1a', st.flags.studyOpen);
            windowAt(380, 70, 160, 170);
            frame(800, 100, 110, 130, 'sea');
            sconce(305, 130); sconce(575, 130);
            // the stairwell: a gap in the floor edged by a balustrade
            P(390, 300, 180, 60, 2, '#0b0908', { basic: true });
            P(384, 292, 192, 8, 40, darkWood);
            for (let i = 0; i < 9; i++) P(392 + i * 22, 300, 5, 26, 36, '#e8e2d0');
            P(384, 296, 8, 64, 42, darkWood); P(568, 296, 8, 64, 42, darkWood);
            table(850, 40, 80, 36, 70, woodC); { const x = atS(850, 40); V.shape('cyl', x, 80, 40, 14, 18, 14, '#f4ecd0', { parent: roomG }); const fl = V.shape('cone', x, 94, 40, 5, 10, 5, '#ffd66b', { parent: roomG, glow: 1.6, shadow: false }); glowParts.push(fl); fl.userData.candle = true; }
            plant(300, 40, 1.1);
          } else if (R === 'library') {
            rug('#2a4a2a', '#c9a227', 150, 170, 810, 330);
            // bookcase: carcass, crown, shelves and uneven books
            // hollow carcass: back board plus sides, so the books sit inside and stay visible
            P(290, 70, 380, 290, 6, U.shade(darkWood, -0.2)); for (const x of [290, 660]) P(x, 70, 10, 290, 42, darkWood);
            P(282, 62, 396, 14, 44, woodC); P(282, 346, 396, 14, 44, woodC);
            const books = [];
            const r = U.rng('mm-books');
            for (let row = 0; row < 3; row++) {
              let x = 304;
              for (let i = 0; x < 650; i++) {
                const w = 12 + Math.floor(r() * 10), h = 50 + Math.floor(r() * 16);
                if (!(st.flags.shelfOpen && row === 1 && x > 440 && x < 510)) books.push({ x: x + w / 2, y: FLOOR - (102 + row * 72) - h + 2, z: 18, w: w - 1, h, d: 24 + r() * 6, color: ['#8b3a3a', '#3a5a8b', '#6b8b3a', '#8b7a3a', '#5a3a6b', '#2a4a4a', '#7a4a2a'][Math.floor(r() * 7)] });
                x += w;
              }
            }
            V.boxes(books, { parent: roomG });
            for (let row = 0; row < 3; row++) P(290, 96 + row * 72 - 6, 380, 6, 40, woodC);
            if (st.flags.shelfOpen) P(450, 180, 60, 40, 44, '#0b0a0e', { basic: true });
            // reading stand with the open book and a candle
            P(122, 262, 46, 98, 24, woodC); P(104, 350, 82, 10, 40, darkWood);
            { const bk = P(92, 240, 106, 10, 44, '#f4ecd0'); bk.rotation.x = 0.35; P(144, 238, 2, 12, 48, '#8b3a3a'); }
            // globe on a stand with a brass meridian
            V.shape('sphere', 845, FLOOR - 285, 36, 74, 74, 74, '#2e86c1', { parent: roomG, rough: 0.5 });
            for (const [lx, ly, s] of [[830, 270, 22], [860, 300, 16], [840, 305, 12]]) V.shape('sphere', lx, FLOOR - ly, 70, s, s * 0.8, 4, '#4a9a4a', { parent: roomG });
            { const m = V.shape('torus', 845, FLOOR - 285, 36, 88, 88, 20, brass, { parent: roomG, metal: 0.7 }); m.rotation.y = Math.PI / 2; }
            P(840, 322, 10, 30, 36, darkWood); P(816, 350, 58, 10, 44, darkWood);
            // rolling ladder to the top shelf
            P(694, 60, 84, 60, 26, woodC); for (let i = 0; i < 3; i++) P(700 + i * 24, 66, 18, 50, 30, ['#8b3a3a', '#3a5a8b', '#8b7a3a'][i]);
            for (const x of [690, 740]) { const rail = P(x, 100, 7, 260, 52, '#8b5a2b'); rail.rotation.z = x === 690 ? 0.04 : 0.04; }
            for (let i = 0; i < 8; i++) P(694, 118 + i * 30, 50, 5, 54, '#8b5a2b');
            armchair(230, 170, '#2f5a3a', 0.4); lamp(160, 110);
            sconce(245, 120);
          } else if (R === 'study') {
            rug('#5a1e2e', '#c9a227', 150, 190, 810, 330);
            // painting that hides the safe
            if (st.flags.safeOpen) { P(560, 90, 130, 140, 10, '#2a2f3a', { metal: 0.6 }); P(585, 115, 80, 90, 12, '#0b0b10', { basic: true }); const door = P(690, 90, 18, 140, 110, '#3a3f4a', { metal: 0.6 }); door.rotation.y = 0.1; }
            else frame(566, 96, 118, 128, 'hills');
            // desk: top, pedestals with drawers, green-shaded lamp, papers and quill
            P(210, 236, 280, 14, 76, woodC);
            for (const x of [220, 400]) { P(x, 250, 80, 110, 66, darkWood); for (let i = 0; i < 3; i++) { P(x + 6, 256 + i * 34, 68, 28, 68, woodC); P(x + 36, 266 + i * 34, 8, 6, 72, brass, { metal: 0.6 }); } }
            P(250, 228, 110, 8, 56, '#f4ecd0'); P(270, 226, 60, 4, 60, '#e8e2d0');
            V.shape('cylLo', 430, FLOOR - 236, 40, 16, 4, 16, brass, { parent: roomG, metal: 0.6 }); V.shape('cylLo', 430, FLOOR - 222, 40, 3, 26, 3, brass, { parent: roomG, metal: 0.6 });
            { const sh = V.shape('cylLo', 430, FLOOR - 210, 40, 34, 10, 18, '#1f6a3a', { parent: roomG, glow: 0.4 }); sh.rotation.z = 0; }
            light(430, FLOOR - 200, 70, '#fff0c8', 40, 360);
            armchair(350, 120, '#5a1e2e', Math.PI);
            // beetle cabinet: a glass case on a wooden base with the signet drawer
            P(760, 270, 120, 50, 40, '#6a4a2a'); P(756, 266, 128, 6, 44, '#4e3420');
            P(764, 204, 112, 62, 4, '#5a1e2e');
            for (const [x, w] of [[760, 4], [876, 4]]) P(x, 200, w, 66, 40, '#4e3420');
            P(760, 196, 120, 6, 40, '#4e3420');
            P(764, 204, 112, 62, 38, '#cfeeff', { opacity: 0.18, depthWrite: false, shadow: false });
            for (let i = 0; i < 5; i++) {
              const has = i < d.beetles.length;
              P(772 + i * 21, 252, 14, 3, 30, '#3a1420');
              const b = V.shape('sphere', 779 + i * 21, FLOOR - 245, 22, 12, 8, 14, has ? '#ffd66b' : '#2a1e18', { parent: roomG, metal: has ? 0.7 : 0, rough: 0.3, glow: has ? 0.3 : 0 });
              if (has) { V.shape('sphere', 779 + i * 21, FLOOR - 243, 29, 6, 5, 5, '#c89a2a', { parent: roomG, metal: 0.7 }); glowParts.push(b); }
            }
            const drawerOut = st.flags.drawerOpen ? 20 : 0;
            if (drawerOut) P(792, 284, 56, 22, 40, '#1a1008', { z: 0.5 });
            P(790, 282, 60, 24, 40, '#7a5634', { z: drawerOut + 2 });
            P(816, 290, 8, 8, 44, '#b8860b', { metal: 0.7, z: drawerOut });
            // bookcase between the desk and the safe, and a fireplace-side plant
            P(110, 110, 80, 250, 30, darkWood); for (let row = 0; row < 4; row++) { P(110, 110 + row * 60 + 54, 80, 6, 32, woodC); for (let i = 0; i < 5; i++) P(116 + i * 14, 110 + row * 60 + 12, 12, 42, 26, ['#8b3a3a', '#3a5a8b', '#6b8b3a', '#8b7a3a', '#5a3a6b'][(i + row) % 5]); }
            sconce(530, 120); plant(720, 50, 1);
          } else if (R === 'kitchen') {
            // tiled splashback, counters with cupboard doors, stove, sink and shelves
            P(-240, 190, 1440, 60, 4, '#ffffff', { map: tileTex('#e8ecf1', '#bcd0dc') });
            P(110, 110, 110, 130, 30, '#6a707c', { metal: 0.4 });
            P(118, 118, 94, 20, 32, '#39414f');
            for (let i = 0; i < 5; i++) V.shape('sphere', 130 + i * 18, FLOOR - 150, 32, 11, 11, 6, st.fuses[i] ? '#ffd66b' : '#2a2f3a', { parent: roomG, glow: st.fuses[i] ? 1.2 : 0 });
            P(160, 20, 8, 92, 12, '#39414f', { metal: 0.4 });
            // counters
            P(290, 250, 350, 110, 60, '#e8e2d0'); P(284, 244, 362, 8, 66, '#39414f');
            for (let i = 0; i < 4; i++) { P(298 + i * 86, 262, 78, 88, 62, '#d7cfbd'); P(330 + i * 86, 300, 14, 4, 66, brass, { metal: 0.6 }); }
            // teacup and saucer on the counter
            V.shape('cyl', 450, FLOOR - 246, 40, 40, 3, 28, '#f4f1ea', { parent: roomG });
            V.shape('cyl', 450, FLOOR - 236, 40, 24, 18, 20, '#f4f1ea', { parent: roomG });
            { const h = V.shape('torus', 464, FLOOR - 236, 40, 12, 12, 10, '#f4f1ea', { parent: roomG }); h.rotation.y = Math.PI / 2; }
            // cast-iron range set into the counter, with burners, a pot and a kettle under a hood
            P(530, 250, 100, 110, 64, '#2a2f3a', { metal: 0.4 }); P(546, 290, 68, 50, 66, '#1b1b22'); P(560, 282, 40, 4, 68, brass, { metal: 0.6 });
            for (const bx of [552, 604]) V.shape('cyl', bx, FLOOR - 248, 36, 24, 3, 24, '#1b1b22', { parent: roomG });
            V.shape('cyl', 552, FLOOR - 234, 36, 28, 24, 28, '#8a94a6', { parent: roomG, metal: 0.6 });
            V.shape('sphere', 604, FLOOR - 236, 36, 26, 22, 26, '#c0392b', { parent: roomG, metal: 0.3 });
            P(520, 130, 120, 40, 40, '#8a94a6', { metal: 0.5 }); P(566, 20, 28, 110, 30, '#8a94a6', { metal: 0.5 });
            // hanging pans on a rail
            P(300, 110, 200, 6, 14, brass, { metal: 0.6 });
            for (let i = 0; i < 4; i++) { P(316 + i * 48, 116, 2, 20, 16, '#39414f'); V.shape('cyl', 317 + i * 48, FLOOR - 150, 16, 28 - i * 3, 5, 28 - i * 3, i % 2 ? '#b87333' : '#39414f', { parent: roomG, metal: 0.6 }).rotation.x = Math.PI / 2; }
            // shelf of jars
            P(640, 90, 100, 8, 26, woodC);
            for (let i = 0; i < 4; i++) V.shape('cyl', 656 + i * 22, FLOOR - 76, 14, 16, 26, 16, ['#e8a060', '#d0e0a0', '#f4ecd0', '#a0c0e0'][i], { parent: roomG, opacity: 0.85 });
            // the muddy boot print by the back door
            const print = V.shape('disc', 685, 0.8, 150, 60, 26, 1, '#3c2814', { parent: roomG, opacity: 0.8, shadow: false }); print.rotation.x = -Math.PI / 2; print.rotation.z = 0.2;
            P(782, 152, 66, 56, 12, '#0e1a33', { basic: true });
          } else if (R === 'garden') {
            // stone path, lamp post, rose bushes, shed and the greenhouse
            const path = [];
            for (let i = 0; i < 9; i++) path.push({ x: 560 + i * 34, y: 0, z: 80 + (i % 2) * 20, w: 30, h: 1.5, d: 28, color: '#8a8f99' });
            V.boxes(path, { parent: roomG });
            P(80, 120, 200, 230, 110, '#8fd3ff', { opacity: 0.22, depthWrite: false });
            for (const [x, y, w, h] of [[80, 120, 6, 230], [274, 120, 6, 230], [80, 120, 200, 6], [177, 120, 6, 230], [80, 234, 200, 5]]) P(x, y, w, h, 112, '#e8ecf1');
            { const roof = V.shape('cone4', 180, FLOOR - 100, 55, 290, 50, 160, '#bfe6ff', { parent: roomG, opacity: 0.3, depthWrite: false }); roof.rotation.y = Math.PI / 4; }
            for (let i = 0; i < 4; i++) V.shape('sphere', 120 + i * 40, 30, 60, 30, 30, 30, '#2f8f47', { parent: roomG });
            const lamp2 = V.shape('sphere', 180, FLOOR - 230, 55, 18, 18, 18, '#ffd66b', { parent: roomG, glow: 1.4 });
            glowParts.push(lamp2); lamp2.userData.flicker = !st.flags.trueEnding;
            if (st.flags.greenOpen || st.flags.trueEnding) P(200, 250, 60, 100, 114, '#1a2a1a', { opacity: 0.6 });
            for (let i = 0; i < 6; i++) {
              V.shape('sphere', 380 + i * 26, 22, 60, 42, 40, 42, '#2f8f47', { parent: roomG });
              for (let k = 0; k < 3; k++) V.shape('sphere', 372 + i * 26 + k * 8, 34 + (k % 2) * 10, 76, 10, 10, 10, '#c0392b', { parent: roomG });
            }
            // gardener's shed with a slanted roof, door and window
            P(610, 150, 170, 200, 90, '#8a6a4a');
            for (let i = 0; i < 8; i++) P(612 + i * 21, 152, 3, 196, 92, '#6b4b2a');
            const roof = V.shape('cone4', 695, FLOOR - 128, 45, 240, 60, 130, '#4a3020', { parent: roomG }); roof.rotation.y = Math.PI / 4;
            P(670, 250, 50, 100, 94, '#3a2418'); P(716, 296, 4, 8, 96, brass, { metal: 0.6 });
            P(626, 190, 34, 30, 94, '#ffd66b', { glow: 0.5 });
            // lamp post by the path
            { const x = atS(560, 140); V.shape('cylLo', x, 90, 140, 6, 180, 6, '#1b1b22', { parent: roomG }); const bulb = V.shape('sphere', x, 186, 140, 22, 22, 22, '#ffe8b0', { parent: roomG, glow: 1.3 }); glowParts.push(bulb); light(x, 180, 150, '#ffd9a0', 90, 600); }
            // picket fence in front of the hedge
            const fence = [];
            for (let x = -140; x < 740; x += 26) fence.push({ x, y: 0, z: 6, w: 8, h: 60, d: 4, color: '#e8e2d0' });
            V.boxes(fence, { parent: roomG });
            V.box(300, 20, 6, 880, 6, 3, '#e8e2d0', { parent: roomG }); V.box(300, 44, 6, 880, 6, 3, '#e8e2d0', { parent: roomG });
          } else if (R === 'parlor') {
            rug('#4a1e3a', '#c9a227', 130, 160, 830, 330);
            // the household, each dressed for their part
            const cast = [
              { skin: '#e0ac69', equipped: { head: 'head_block', face: { style: 'determined' }, hair: { style: 'short', c1: '#d7dde6' }, shirt: { style: 'tux', c1: '#1b1b22', c2: '#f4f1ea' }, pants: { style: 'plain', c1: '#1b1b22' }, shoes: { style: 'sneaker', c1: '#1b1b22', c2: '#1b1b22' }, neck: { style: 'bowtie', c1: '#1b1b22' } } },
              { skin: '#f1c27d', equipped: { head: 'head_block', face: { style: 'wink' }, hair: { style: 'long', c1: '#ff9a3c' }, shirt: { style: 'logo', c1: '#8a4ad0', c2: '#e0c8ff' }, pants: { style: 'plain', c1: '#3a2a5a' }, shoes: { style: 'sneaker', c1: '#5a2a7a', c2: '#ffffff' }, neck: { style: 'chain', c1: '#ffd66b' } } },
              { skin: '#c68642', equipped: { head: 'head_block', face: { style: 'sleepy' }, hair: { style: 'short', c1: '#1b1b22' }, shirt: { style: 'tux', c1: '#6b3a1a', c2: '#e8e2d0' }, pants: { style: 'plain', c1: '#3a2418' }, shoes: { style: 'boot', c1: '#2a1a10', c2: '#1b1b22' }, neck: { style: 'scarf', c1: '#2f8f47', c2: '#f4f1ea' }, accessory: { style: 'monocle', c1: '#c9a227' } } },
              { skin: '#8d5524', equipped: { head: 'head_block', face: { style: 'smile' }, hair: { style: 'bun', c1: '#1b1b22' }, shirt: { style: 'stripe', c1: '#2f8f47', c2: '#4ad17f' }, pants: { style: 'cargo', c1: '#5a4a2a' }, shoes: { style: 'boot', c1: '#4a3020', c2: '#2a1a10' }, hat: { style: 'explorer', c1: '#c9a26a', c2: '#2f8f47' } } },
            ];
            cast.forEach((av, i) => {
              const rig = BF.char3d.build(av);
              rig.group.scale.setScalar(19);
              rig.group.position.set(250 + i * 140, 0, 60);
              rig.group.rotation.y = i < 2 ? 0.45 : -0.45;
              roomG.add(rig.group);
              suspects.push(rig);
            });
            // fireplace: brick surround, mantel, firebox with logs and a real glow
            P(780, 180, 150, 180, 36, '#ffffff', { map: brickTex('#8a4a3a') });
            P(772, 172, 166, 12, 48, woodC); P(768, 164, 174, 8, 52, U.shade(woodC, 0.1));
            P(815, 250, 80, 110, 38, '#120a08', { basic: true });
            for (const [x, rz] of [[835, 0.2], [860, -0.15]]) { const log = V.shape('cyl', x, 10, 30, 12, 50, 12, '#5a3a22', { parent: roomG }); log.rotation.z = Math.PI / 2 + rz; }
            const fire = V.shape('cone', 855, 26, 30, 44, 44, 22, '#ff7a2e', { parent: roomG, glow: 1.5, shadow: false });
            const fire2 = V.shape('cone', 855, 22, 34, 24, 30, 14, '#ffd66b', { parent: roomG, glow: 1.6, shadow: false });
            glowParts.push(fire, fire2);
            fireLight = light(855, 60, 110, '#ff9a4a', 110, 700);
            for (let i = 0; i < 2; i++) V.shape('cylLo', 800 + i * 110, FLOOR - 186, 30, 10, 26, 10, '#f4ecd0', { parent: roomG });
            frame(830, 60, 70, 88, 'lady');
            // armchair and sofa for the waiting household, plus a tea table
            armchair(150, 150, '#7a3b4a', 0.5);
            { const g = V.group(roomG); g.position.set(atS(120, 60), 0, 60); V.box(0, 0, 0, 80, 26, 50, '#5a2a36', { parent: g }); V.box(0, 26, -18, 80, 44, 12, '#7a3b4a', { parent: g }); }
            table(300, 250, 90, 50, 40, woodC);
            { const x = atS(300, 250); V.shape('cyl', x - 14, 44, 250, 16, 12, 16, '#f4f1ea', { parent: roomG }); V.shape('sphere', x + 14, 50, 250, 20, 20, 20, '#f4f1ea', { parent: roomG }); }
            sconce(140, 120); plant(760, 40, 1);
          } else if (R === 'cellar') {
            P(90, 110, 170, 240, 50, '#3a2418');
            const bottles = [];
            for (let r2 = 0; r2 < 5; r2++) for (let c = 0; c < 4; c++) bottles.push({ x: 115 + c * 40, y: FLOOR - (140 + r2 * 44) - 10, z: 52, w: 20, h: 20, d: 14, color: '#1a3a2a' });
            V.boxes(bottles, { parent: roomG, geo: 'cylLo' });
            for (let r2 = 0; r2 < 6; r2++) P(90, 110 + r2 * 44, 170, 4, 54, '#2a1a10');
            const chute = P(300, 60, 100, 130, 60, '#2a2f3a', { metal: 0.5 }); chute.rotation.x = -0.2;
            P(310, 70, 80, 20, 64, '#141418');
            P(470, 110, 220, 250, 44, '#2a2426');
            P(500, 180, 160, 140, 46, furnaceGlow > 0 ? '#3a1a0a' : '#141012');
            for (let i = 0; i < 5; i++) P(506 + i * 31, 138, 26, 30, 46, '#8a6a2a', { metal: 0.5 });
            P(560, 30, 40, 80, 40, '#2a2426');
            for (const bx of [476, 676]) for (let i = 0; i < 6; i++) V.shape('sphere', bx + 4, FLOOR - (124 + i * 40), 46, 8, 8, 6, '#5a5055', { parent: roomG, metal: 0.5 });
            if (furnaceGlow > 0) {
              const f1 = V.shape('sphere', 580, FLOOR - 270, 44, 110, 90, 30, '#ff7a2e', { parent: roomG, glow: 1.6, shadow: false });
              const f2 = V.shape('sphere', 580, FLOOR - 280, 50, 60, 50, 20, '#ffd66b', { parent: roomG, glow: 1.6, shadow: false });
              glowParts.push(f1, f2);
              fireLight = new THREE.PointLight('#ff7a2e', 1.8, 900, 1.2);
              fireLight.position.set(580, 80, 160);
              V.scene.add(fireLight);
            }
            P(730, 290, 120, 40, 50, '#39414f', { metal: 0.4 }); P(760, 330, 60, 30, 40, '#2a2f3a');
            for (let i = 0; i < 6; i++) P(840 + i * 14, 200 - i * 22, 90 - i * 14, 12, 60, '#3a3030');
            // barrels and a hanging bulb that lights when the power is on
            for (const [sx, z] of [[300, 120], [360, 150]]) { const x = atS(sx, z); V.shape('cyl', x, 30, z, 50, 60, 50, '#6b4226', { parent: roomG }); for (const y of [8, 52]) V.shape('cyl', x, y, z, 52, 4, 52, '#39414f', { parent: roomG, metal: 0.5 }); }
            P(418, 0, 2, 40, 90, '#1b1b22');
            const bulb = V.shape('sphere', 419, FLOOR - 46, 91, 14, 16, 14, powered() ? '#ffe8b0' : '#3a3a3a', { parent: roomG, glow: powered() ? 1.3 : 0 });
            if (powered()) glowParts.push(bulb);
            // cobwebs in the corners
            for (const [x, y] of [[20, 20], [900, 20]]) { const web = P(x, y, 40, 40, 2, '#d7dde6', { opacity: 0.25, depthWrite: false }); web.rotation.z = 0.785; }
          }
        }

        const key = () => [st.room, JSON.stringify(st.flags), st.fuses.join(''), d.beetles.length, furnaceGlow > 0 ? 1 : 0, powered() ? 1 : 0].join('|');

        return function sync(dt) {
          const t = ctx.time;
          if (key() !== builtKey) build();
          V.look(480, 90, 0, { dist: CAM_D, pitch: 0.0001, yaw: 0, fov: 45 }, 0);
          glowParts.forEach((m, i) => { if (m.userData.flicker && Math.sin(t * 2) <= 0) m.visible = false; else m.visible = true; m.scale.x *= 1; if (m.material && m.material.emissiveIntensity != null && !m.material.userData.shared) m.material.emissiveIntensity = 1.3 + Math.sin(t * 13 + i) * 0.3; });
          if (fireLight) fireLight.intensity = (1.5 + Math.sin(t * 13) * 0.3) * furnaceGlow;
          suspects.forEach((rig) => rig.tick(dt));
          const room = ROOMS[st.room];
          const dark = room.dark && !powered();
          // the player and other detectives on the floor in front of the wall
          const atScreen = (sx, z) => 480 + (sx - 480) * (CAM_D - z) / CAM_D;
          const me = V.actor('me', ctx.player.avatar, { scale: 9 });
          me.setPos(atScreen(90, 200), 0, 200);
          me.faceAngle(0.9);
          me.group.visible = !dark;
          for (const b of bots) {
            if (b.room !== st.room || dark) continue;
            const rig = V.actor(b.bot.id, b.bot.avatar, { scale: 8.5 });
            rig.setPos(atScreen(b.x, 170), 0, 170);
            rig.faceAngle(b.facing > 0 ? 0.6 : Math.PI - 0.6);
            V.label(atScreen(b.x, 170), 62, 170, { name: b.bot.displayName, color: '#ffffff', bubble: ctx.bubbleText(b.bot.id) });
          }
          if (!dark) V.label(atScreen(90, 200), 66, 200, { bubble: ctx.bubbleText('me') });
          V.sweep();
        };
      })();

      return {
        update(dt) {
          parts.update(dt);
          floats.update(dt);
          if (flash > 0) flash -= dt;
          if (furnaceGlow > 0 && furnaceGlow < 1) furnaceGlow = Math.min(1, furnaceGlow + dt * 0.8);
          // anvil rhythm playback
          if (openTerminalT > 0) { openTerminalT -= dt; if (openTerminalT <= 0 && BF.forgecore) BF.forgecore.open(); }
          const r = st.rhythm;
          if (r && r.replayT > 0) { r.replayT -= dt; if (r.replayT <= 0 && panelOpen === 'puzzle') playRhythm(); }
          if (r && r.showing) {
            r.showT -= dt;
            if (r.showT <= 0) {
              if (r.lit >= 0) { r.lit = -1; r.showT = 0.18; }
              else if (r.showIdx < r.seq.length) { r.lit = r.seq[r.showIdx++]; r.showT = 0.5; ctx.sfx('anvil', { pitch: 0.8 + r.lit * 0.15, volume: 0.5 }); }
              else { r.showing = 0; r.lit = -1; }
              if (panelOpen === 'puzzle') renderRhythm();
            }
          }
          for (const b of bots) {
            // orders from chat: follow / come / help stay in your room, stay keeps them where they are, leave sends them elsewhere
            const ord = ctx.botOrder(b.bot.id);
            if (ord && ['follow', 'come', 'help'].includes(ord.verb) && b.room !== st.room) { b.room = st.room; b.x = 200 + Math.random() * 500; b.t = 20; if (ord.verb === 'come') ctx.clearOrder(b.bot.id); }
            if (ord && ord.verb === 'leave' && b.room === st.room) { b.room = U.pick(Object.keys(ROOMS).filter((x) => x !== 'cellar' && x !== st.room)); ctx.clearOrder(b.bot.id); }
            if (ord && ord.verb === 'stay') { b.t = Math.max(b.t, 2); continue; }
            b.t -= dt; if (b.t <= 0) { b.t = 15 + Math.random() * 25; b.room = U.pick(Object.keys(ROOMS).filter((x) => x !== 'cellar')); b.x = 300 + Math.random() * 450; b.facing = Math.random() < 0.5 ? 1 : -1; }
          }
          if (phase !== 'play') return;
          time += dt;
          if (time >= limit) { closePanels(); finish(false); return; }
          if (limit - time < 60 && Math.floor(limit - time) !== Math.floor(limit - time + dt) && Math.floor(limit - time) % 15 === 0) ctx.banner('The clock strikes...', Math.floor(limit - time) + ' seconds until midnight', 1200);
          const p = ctx.input.pointer;
          hover = visibleSpots().find((s) => p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h) || null;
          ctx.canvas.style.cursor = hover ? 'pointer' : 'default';
          if (p.pressed && hover && !panelOpen) {
            const item = st.selected;
            if (hover.door) go(hover.door);
            else if (item && hover.use && hover.use[item]) hover.use[item]();
            else if (item) { const it = st.items.find((i) => i.id === item); st.selected = null; renderDock(); say('You try the ' + (it ? it.name.toLowerCase() : 'item') + ' on the ' + hover.label.toLowerCase() + '. Nothing happens.'); }
            else if (hover.on) hover.on();
          } else if (p.pressed && panelOpen === 'say') closePanels();
        },

        draw(g) {
          drawRoom(g, ctx.time);
          drawHud(g);
        },

        render3d(dt) { view(dt); },
        /** "help me" in chat: a detective shares the next step from the hint journal. */
        onBotOrder(bot, order) {
          if (order.verb !== 'help') return;
          const b = bots.find((x) => x.bot.id === bot.id);
          if (b) { b.room = st.room; b.x = 200 + Math.random() * 500; }
          const tip = nextHint();
          if (tip) ctx.botText(bot, 'i think... ' + tip.charAt(0).toLowerCase() + tip.slice(1), 2200);
        },
        hud(g) { drawHud(g); },

        /** Automated-test hooks (not used by gameplay). */
        _test: { st, d, go, click(id) { const s = visibleSpots().find((x) => x.id === id); if (!s) return false; if (s.door) go(s.door); else if (st.selected && s.use && s.use[st.selected]) s.use[st.selected](); else s.on(); return true; }, get glow() { return furnaceGlow; } },
        onBotJoin(b) { addBot(b); },
        onBotLeave(b) { const i = bots.findIndex((x) => x.bot.id === b.id); if (i >= 0) bots.splice(i, 1); },
        destroy() { ctx.canvas.style.cursor = ''; ctx.save(); },
      };

      function drawHud(g) {
          const t = ctx.time;
          const room = ROOMS[st.room];
          const dark = room.dark && !powered();
          if (V) drawOverlay3d(g, t, dark);
          for (const s of visibleSpots()) {
            if (s.door) { g.globalAlpha = hover === s ? 0.9 : 0.35; G.text(g, (s.door === 'foyer' || s.door === 'upper' ? '' : '') + '▸ ' + s.label, s.x + s.w / 2, s.y + s.h / 2, { size: 12, align: 'center', color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 }); g.globalAlpha = 1; }
            if (lantern && s.hidden && s.hidden() && !dark) { g.globalAlpha = 0.35 + Math.sin(t * 5 + s.x) * 0.25; G.ring(g, s.x + s.w / 2, s.y + s.h / 2, Math.min(s.w, s.h) / 2 + 6, '#ffd66b', 2); g.globalAlpha = 1; }
          }
          if (hover) {
            g.strokeStyle = 'rgba(255,214,107,.8)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(hover.x, hover.y, hover.w, hover.h); g.setLineDash([]);
            G.text(g, hover.label, Math.min(W - 90, Math.max(90, hover.x + hover.w / 2)), Math.max(20, hover.y - 8), { size: 13, align: 'center', color: '#ffd66b', weight: 800, stroke: 'rgba(0,0,0,.7)', strokeW: 4 });
          }
          parts.draw(g);
          floats.draw(g);
          if (flash > 0) { g.fillStyle = 'rgba(255,140,40,' + Math.min(0.7, flash * 0.5) + ')'; g.fillRect(0, 0, W, H); }
          g.fillStyle = '#0d1016'; g.fillRect(0, DOCK, W, H - DOCK);
          // HUD
          G.panel(g, 10, 10, 240, 50);
          G.text(g, room.name, 22, 32, { size: 16, weight: 800, color: '#fff' });
          const left = Math.max(0, limit - time);
          G.text(g, 'Midnight in ' + U.fmtClock(left), 238, 32, { size: 12, align: 'right', color: left < 60 ? '#ff8b98' : '#cfd6e2' });
          G.text(g, 'Ashcombe Manor · ' + st.clues.length + ' clues', 22, 52, { size: 11, color: '#a1abbb' });
          if (st.selected) G.text(g, 'Using: ' + st.items.find((i) => i.id === st.selected).name + ' (click an object)', W / 2, DOCK - 10, { size: 12, align: 'center', color: '#8fd3ff', stroke: 'rgba(0,0,0,.7)', strokeW: 3 });
      }

      /** Screen-space details drawn over the 3D room (dial letters, runes, darkness, furnace halo). */
      function drawOverlay3d(g, t, dark) {
        if (st.room === 'cellar') {
          const glow = furnaceGlow;
          // letters and runes are painted onto the protruding dial and anvil faces
          for (let i = 0; i < 5; i++) { const p = V.toScreen(519 + i * 31, FLOOR - 153, 46.5); G.text(g, secrets.state().wordSolved ? 'EMBER'[i] : st.dials[i], p.x, p.y + 6, { size: 17, align: 'center', color: '#1b1b22', weight: 900 }); }
          secrets.RUNES.forEach((r2, i) => { const p = V.toScreen(752 + i * 26, FLOOR - 312, 50.5); G.text(g, r2, p.x, p.y + 5, { size: 14, align: 'center', color: glow > 0 ? (st.rhythm && st.rhythm.lit === i ? '#ffffff' : '#ff9d5c') : '#5a5f6a', weight: 900 }); });
          if (glow > 0) {
            const halo = g.createRadialGradient(580, 250, 20, 580, 250, 320);
            halo.addColorStop(0, 'rgba(255,122,46,' + 0.22 * glow + ')'); halo.addColorStop(1, 'rgba(255,122,46,0)');
            g.fillStyle = halo; g.fillRect(0, 0, W, DOCK);
          }
          if (dark) { g.fillStyle = 'rgba(0,0,0,.93)'; g.fillRect(0, 0, W, DOCK); G.text(g, 'It is too dark to see.', W / 2, 240, { size: 16, align: 'center', color: '#5a5f6a' }); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(840, 60, 100, 140); }
        }
        if (st.room === 'parlor') SUSPECTS.forEach((sp, i) => G.text(g, sp.name, 250 + i * 140, FLOOR + 26, { size: 12, align: 'center', color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.6)', strokeW: 3 }));
      }
    },
  });
})((window.BF = window.BF || {}));
