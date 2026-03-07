/**
 * Cutscene system — timed multi-frame story sequences with ASCII art,
 * drama, humor, and biome-aware narrative. Plays at dungeon entry,
 * before/after boss fights, on dungeon clear, random encounters, and trophy unlocks.
 *
 * Each cutscene is an array of frames: { lines[], art[], color, duration }
 * - lines: text lines to display (centered)
 * - art: optional ASCII art lines (centered above text)
 * - color: text color for the frame (default 'white')
 * - duration: ms to hold the frame (default 1200)
 */

// ── BIOME STORY POOLS ──────────────────────────────────────────────

const DUNGEON_INTROS = {
  cave: [
    [
      { art: ['  .  .  .  .  .', ' .  __|__  .', '   /     \\', '  | ENTER |', '   \\_____/'], lines: ['The cave mouth yawns open like a hungry beast.', 'Your torchlight barely pierces the darkness.'], color: 'cyan', duration: 2000 },
      { lines: ['Water drips somewhere deep below.', 'Each drop echoes like a countdown.'], color: 'brightBlack', duration: 1500 },
      { lines: ['"I\'ve got a bad feeling about this,"', 'mutters someone from the back of the party.'], color: 'yellow', duration: 1500 },
      { art: ['  ~~~~', ' /    \\', '|  ??  |', ' \\    /', '  ~~~~'], lines: ['The air thickens with the scent of iron and old cookies.', 'Something crunches underfoot. Best not to look.'], color: 'white', duration: 1500 },
    ],
    [
      { art: ['     /\\', '    /  \\', '   / .. \\', '  /______\\', '  |      |', '  |______|'], lines: ['A jagged crack in the mountainside.', 'The locals call it "The Crumb Pit."'], color: 'brightBlack', duration: 2000 },
      { lines: ['No one who enters ever comes back', 'with clean shoes.'], color: 'white', duration: 1500 },
      { lines: ['"Last one in buys the tavern round!"', 'Your bard charges ahead. Typical.'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['The cavern walls glitter with embedded crystals.', 'Beautiful. Deadly. Full of spiders.'], color: 'cyan', duration: 1800 },
      { lines: ['Someone painted "TURN BACK" on the wall.', 'In cookie frosting. Still fresh.'], color: 'red', duration: 1800 },
      { lines: ['Your team squares their shoulders.', 'Adventure waits for no cookie.'], color: 'green', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { art: ['  _____', ' |     |', ' | R.I.P|', ' |     |', ' |_____|', '  /   \\'], lines: ['The crypt gates groan open on rusty hinges.', 'A cold wind rushes past, carrying whispers.'], color: 'magenta', duration: 2000 },
      { lines: ['"Did that skeleton just... wave at us?"', '"Don\'t wave back. Trust me."'], color: 'yellow', duration: 1500 },
      { lines: ['Cobwebs thick as curtains part before you.', 'The dead have been busy redecorating.'], color: 'brightBlack', duration: 1500 },
    ],
    [
      { lines: ['Ancient stone coffins line the corridor.', 'Most are sealed. Some are suspiciously ajar.'], color: 'white', duration: 1800 },
      { lines: ['A ghost drifts past, reading a newspaper.', 'The headline: "ADVENTURERS STILL TRESPASSING"'], color: 'cyan', duration: 2000 },
      { lines: ['Your healer clutches their holy symbol.', '"Just in case," they mumble. Reassuring.'], color: 'yellow', duration: 1500 },
    ],
    [
      { art: ['  .-.  ', ' (o o) ', ' | O | ', ' |   | ', ' ^~^~^ '], lines: ['The candles along the walls light themselves.', 'One by one. Watching your approach.'], color: 'magenta', duration: 2000 },
      { lines: ['Somewhere deep inside, something laughs.', 'It sounds like it hasn\'t laughed in centuries.'], color: 'red', duration: 1800 },
      { lines: ['Nobody says anything.', 'Everyone walks faster.'], color: 'white', duration: 1200 },
    ],
  ],
  forest: [
    [
      { art: ['   /\\', '  /  \\', ' /    \\', '/______\\', '  ||||  ', '  ||||  '], lines: ['The ancient trees close behind you like a door.', 'Sunlight filters through the canopy in thin green shafts.'], color: 'green', duration: 2000 },
      { lines: ['A bird calls out. Another answers.', 'A third one calls you a fool. Probably.'], color: 'yellow', duration: 1500 },
      { lines: ['The forest floor is soft with fallen leaves,', 'and the occasional discarded cookie wrapper.'], color: 'brightBlack', duration: 1500 },
    ],
    [
      { lines: ['Mushroom circles dot the path ahead.', 'The fairies left a note: "Trespassers will be jinxed."'], color: 'magenta', duration: 1800 },
      { lines: ['"Does anyone actually read those signs?"', 'Your scout already stepped in three circles.'], color: 'yellow', duration: 1500 },
      { lines: ['The trees creak and sway.', 'They are watching. They are always watching.'], color: 'green', duration: 1500 },
    ],
  ],
  volcano: [
    [
      { art: ['    /\\', '   /  \\', '  / ~~ \\', ' / ~~~~ \\', '/________\\'], lines: ['Heat hits you like opening an oven door.', 'The ground pulses with a deep, slow heartbeat.'], color: 'red', duration: 2000 },
      { lines: ['Lava rivers carve glowing veins through obsidian.', 'Everything smells like burnt caramel and regret.'], color: 'yellow', duration: 1500 },
      { lines: ['"Anyone else suddenly craving s\'mores?"', 'Your mage is already sweating through their robes.'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['A geyser of molten chocolate erupts nearby.', 'Deadly. Delicious. Definitely deadly.'], color: 'red', duration: 1800 },
      { lines: ['An imp sits on a rock, roasting a cookie.', 'It hisses at your team. You hiss back.'], color: 'yellow', duration: 1800 },
      { lines: ['The deeper you go, the more the walls glow.', 'Like walking into a furnace with ambition.'], color: 'red', duration: 1500 },
    ],
  ],
  abyss: [
    [
      { art: ['  . : . : .', ' :  ...  :', '. .     . .', ' :  ...  :', '  . : . : .'], lines: ['Reality bends. The floor becomes the ceiling.', 'The ceiling becomes a polite suggestion.'], color: 'magenta', duration: 2000 },
      { lines: ['You look down and see yourself looking up.', 'Both of you wave awkwardly.'], color: 'cyan', duration: 1800 },
      { lines: ['Physics is more of a guideline here.', 'Your compass is spinning. So is your stomach.'], color: 'magenta', duration: 1500 },
    ],
    [
      { lines: ['A door stands alone in empty space.', 'It opens to another door. And another. And another.'], color: 'brightBlack', duration: 1800 },
      { lines: ['A cookie floats past, perfectly baked.', 'Suspiciously perfect. Nothing here is what it seems.'], color: 'yellow', duration: 1800 },
      { lines: ['"Which way is forward?"', '"Yes."'], color: 'cyan', duration: 1500 },
    ],
  ],
};

const PRE_MINIBOSS = {
  cave: [
    [
      { lines: ['The tunnel widens into a grand chamber.', 'Something large breathes in the darkness ahead.'], color: 'red', duration: 1500 },
      { lines: ['Heavy footsteps shake loose dust from the ceiling.', 'This is not going to be a regular fight.'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['A low growl reverberates through the stone.', 'Your torchlight catches a glint of fangs.'], color: 'red', duration: 1500 },
      { lines: ['"That\'s... bigger than I expected."', '"They always are."'], color: 'yellow', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { lines: ['The air grows colder. Much colder.', 'Frost crawls across the stone floor toward you.'], color: 'cyan', duration: 1500 },
      { lines: ['A guardian of the dead stirs from its eternal watch.', 'It does not look happy about visitors.'], color: 'magenta', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['The trees part to reveal a massive clearing.', 'In its center, something ancient waits.'], color: 'green', duration: 1500 },
      { lines: ['Birds go silent. Even the wind holds its breath.', 'This is a guardian\'s domain.'], color: 'yellow', duration: 1500 },
    ],
  ],
  volcano: [
    [
      { lines: ['The lava flows converge into a ring.', 'Within it, something rises from the magma.'], color: 'red', duration: 1500 },
      { lines: ['Heat intensifies until your armor glows.', 'A forgeborn sentinel guards this passage.'], color: 'yellow', duration: 1500 },
    ],
  ],
  abyss: [
    [
      { lines: ['Space folds around a nexus of dark energy.', 'A warden of the void materializes before you.'], color: 'magenta', duration: 1500 },
      { lines: ['Reality screams. Or maybe that\'s your scout.', 'Hard to tell down here.'], color: 'cyan', duration: 1500 },
    ],
  ],
};

const POST_MINIBOSS = {
  cave: [
    [
      { lines: ['The chamber falls silent.', 'Only the dripping of water remains.'], color: 'cyan', duration: 1200 },
      { art: ['  *  *  *', ' \\|/ \\|/', '  *   *'], lines: ['Victory! The guardian is defeated.', 'The path ahead opens.'], color: 'green', duration: 1500 },
    ],
    [
      { lines: ['The beast collapses with a thunderous crash.', 'Cookie crumbs scatter from its pockets. Even monsters snack.'], color: 'yellow', duration: 1500 },
      { lines: ['Your team catches their breath.', '"Is there a bigger one? There\'s always a bigger one."'], color: 'white', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { lines: ['The guardian crumbles to dust and silence.', 'The cold recedes... slightly.'], color: 'magenta', duration: 1500 },
      { lines: ['"I think it dropped a coupon for the afterlife."', '"...That\'s a bone."'], color: 'yellow', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['The ancient guardian falls, returning to the earth.', 'Flowers bloom where it stood. Life from death.'], color: 'green', duration: 1500 },
      { lines: ['"Beautiful." "Also terrifying." "Both."'], color: 'yellow', duration: 1200 },
    ],
  ],
  volcano: [
    [
      { lines: ['The sentinel shatters into cooling obsidian.', 'The heat drops by exactly one degree. Progress.'], color: 'red', duration: 1500 },
      { lines: ['"My eyebrows grew back yet?" "No." "Great."'], color: 'yellow', duration: 1200 },
    ],
  ],
  abyss: [
    [
      { lines: ['The void warden dissolves into particles of nothing.', 'Which is technically something, philosophically.'], color: 'magenta', duration: 1500 },
      { lines: ['"Did we win, or did reality just hiccup?"', '"Same thing down here."'], color: 'cyan', duration: 1200 },
    ],
  ],
};

const PRE_BOSS = {
  cave: [
    [
      { art: ['     /\\_)', '    / o o\\', '   /  >  ^)', '  /  /|~|', ' /__/ | |', '       ^^'], lines: ['A COLOSSAL SHAPE stirs in the deepest chamber.', 'The ground itself trembles.'], color: 'red', duration: 2000 },
      { lines: ['Eyes like furnaces lock onto your team.', 'This is the ruler of the deep.'], color: 'yellow', duration: 1500 },
      { lines: ['Your bard starts playing. Badly.', '"For morale!" they shout. Debatable.'], color: 'yellow', duration: 1200 },
      { lines: ['The final battle begins.', 'May the crumbs be ever in your favor.'], color: 'cyan', duration: 1500 },
    ],
    [
      { lines: ['The cavern opens into a cathedral of stone.', 'In its center: something impossibly old.'], color: 'brightBlack', duration: 1800 },
      { lines: ['It has been waiting. Patient. Hungry.', 'And it smells your cookies.'], color: 'red', duration: 1500 },
      { lines: ['"Final boss." "How do you know it\'s final?"', '"Dramatic lighting. Dead giveaway."'], color: 'yellow', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { art: [' /^~^\\', ' |o o|', ' |~~~|', ' |   |', ' /   \\'], lines: ['A LICH LORD rises from its throne of bones.', 'Ancient magic crackles through the air.'], color: 'magenta', duration: 2000 },
      { lines: ['"FOOLISH MORTALS," it booms.', '"DO YOU HAVE AN APPOINTMENT?"'], color: 'cyan', duration: 1800 },
      { lines: ['Your team draws their weapons.', 'The lich draws a surprisingly nice cup of tea.'], color: 'yellow', duration: 1500 },
      { lines: ['The final stand begins.'], color: 'red', duration: 1200 },
    ],
  ],
  forest: [
    [
      { art: [' /==\\', ' |oo|', '/|--|\\', ' |  |', ' |__|'], lines: ['An ANCIENT TREANT awakens, its roots shaking the earth.', 'Centuries of growth concentrated into fury.'], color: 'green', duration: 2000 },
      { lines: ['Branches reach out like grasping fingers.', 'The forest itself has come alive.'], color: 'yellow', duration: 1500 },
      { lines: ['"Anyone bring an axe?" "I HAVE A LUTE!"', '"...We\'re doomed."'], color: 'yellow', duration: 1500 },
    ],
  ],
  volcano: [
    [
      { art: [' /^V^\\', ' |><||', ' /  \\'], lines: ['A DEMON LORD emerges from the magma itself.', 'Reality warps around its presence.'], color: 'red', duration: 2000 },
      { lines: ['The temperature spikes. Metal begins to glow.', 'This is the heart of the inferno.'], color: 'yellow', duration: 1500 },
      { lines: ['"I can literally see my life flashing."', '"That\'s just the lava. Focus."'], color: 'yellow', duration: 1500 },
    ],
  ],
  abyss: [
    [
      { art: [' /---\\', ' |(O)|', ' \\---/', '  |||'], lines: ['AN ELDRITCH HORROR unfolds from between dimensions.', 'Looking at it hurts. Not looking is worse.'], color: 'magenta', duration: 2000 },
      { lines: ['It speaks in a language that predates language.', 'Your teeth vibrate. Your shadow runs away.'], color: 'cyan', duration: 1800 },
      { lines: ['"I\'d like to file a complaint with reality."', '"The complaint department doesn\'t exist here."'], color: 'yellow', duration: 1500 },
    ],
  ],
};

const POST_BOSS = {
  cave: [
    [
      { art: ['  * * * * *', ' * VICTORY *', '  * * * * *'], lines: ['THE BEAST FALLS!', 'The cavern shakes as the colossus crashes down.'], color: 'yellow', duration: 2000 },
      { lines: ['Silence. Then a single cookie rolls', 'out of the rubble. The sweetest victory.'], color: 'cyan', duration: 1800 },
      { lines: ['Your team cheers! Your bard plays!', 'It\'s still terrible! Nobody cares!'], color: 'green', duration: 1500 },
      { lines: ['The dungeon trembles as light pours in.', 'A path to the surface reveals itself.'], color: 'white', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { lines: ['THE LICH LORD SHATTERS!', 'Its phylactery crumbles to glittering dust.'], color: 'yellow', duration: 2000 },
      { lines: ['The undead slump back into their coffins.', 'One waves goodbye. Old habits.'], color: 'magenta', duration: 1500 },
      { lines: ['"Did we just save the afterlife?"', '"Let\'s not think too hard about it."'], color: 'yellow', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['THE ANCIENT ONE FALLS!', 'It returns to the earth from which it rose.'], color: 'yellow', duration: 2000 },
      { lines: ['The forest exhales. Sunlight floods in.', 'A single golden leaf drifts to your feet.'], color: 'green', duration: 1800 },
      { lines: ['Somewhere, a bird sings. Not a warning this time.', 'Just a song.'], color: 'cyan', duration: 1500 },
    ],
  ],
  volcano: [
    [
      { lines: ['THE DEMON LORD IS BANISHED!', 'It screams as the magma reclaims it.'], color: 'yellow', duration: 2000 },
      { lines: ['The volcano rumbles and settles.', 'The temperature drops from "lethal" to merely "awful."'], color: 'red', duration: 1500 },
      { lines: ['"My armor is literally welded to my body."', '"That\'s the price of glory."'], color: 'yellow', duration: 1500 },
    ],
  ],
  abyss: [
    [
      { lines: ['THE HORROR UNRAVELS!', 'Reality snaps back into place. Mostly.'], color: 'yellow', duration: 2000 },
      { lines: ['Your shadow returns, looking sheepish.', 'Geometry remembers how angles work.'], color: 'magenta', duration: 1500 },
      { lines: ['"Is it over?" "Define \'over\'."', '"In a non-philosophical way." "...Yes."'], color: 'cyan', duration: 1500 },
    ],
  ],
};

const DUNGEON_COMPLETE = {
  cave: [
    [
      { art: ['  .---.', ' / \\ / \\', '|  EXIT |', ' \\ / \\ /', '  \'---\''], lines: ['Daylight! Sweet, blinding daylight!', 'You emerge from the depths, victorious.'], color: 'yellow', duration: 1800 },
      { lines: ['Your pockets jingle with crumbs.', 'Your hearts swell with triumph. And mild indigestion.'], color: 'green', duration: 1500 },
    ],
  ],
  crypt: [
    [
      { lines: ['The crypt seals shut behind you.', 'The dead return to their rest.'], color: 'magenta', duration: 1500 },
      { lines: ['Fresh air has never tasted so good.', 'Especially after breathing centuries of dust.'], color: 'green', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['The trees part to reveal the path home.', 'The forest has decided to let you leave. This time.'], color: 'green', duration: 1500 },
      { lines: ['Sunlight warms your face.', 'Nature is beautiful when it isn\'t trying to kill you.'], color: 'yellow', duration: 1500 },
    ],
  ],
  volcano: [
    [
      { lines: ['You climb out of the caldera, singed but alive.', 'The cool air is like a blessing from the cookie gods.'], color: 'red', duration: 1500 },
      { lines: ['"I am never going back there."', '*narrator voice* They went back there.'], color: 'yellow', duration: 1800 },
    ],
  ],
  abyss: [
    [
      { lines: ['You tumble out of the void onto solid ground.', 'Solid, predictable, beautifully boring ground.'], color: 'magenta', duration: 1500 },
      { lines: ['Up is up again. Down is down. Left is left.', 'You appreciate geometry more than ever.'], color: 'cyan', duration: 1500 },
    ],
  ],
};

const RANDOM_ENCOUNTERS = [
  [
    { lines: ['You hear a distant melody...', 'Someone is singing off-key in the darkness.'], color: 'cyan', duration: 1500 },
    { lines: ['"Is that... a goblin karaoke night?"', 'Your bard looks offended. "Their technique is awful."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A skeleton sits in a corner, holding a sign:', '"WILL FIGHT FOR COOKIES"'], color: 'brightBlack', duration: 1800 },
    { lines: ['Your team walks past. The skeleton sighs.', 'The economy is tough everywhere.'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['You find graffiti on the wall:', '"FLOOR 99 WAS HERE"'], color: 'white', duration: 1500 },
    { lines: ['Below it, in different handwriting:', '"no they weren\'t lol"'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A mouse wearing a tiny crown scurries past.', 'It drops a single crumb and vanishes.'], color: 'cyan', duration: 1500 },
    { lines: ['"All hail the Crumb King!" your scout whispers.', 'Everyone pretends they didn\'t see that.'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['You find a perfectly preserved cookie on a pedestal.', 'A sign reads: "DO NOT EAT. MUSEUM PROPERTY."'], color: 'yellow', duration: 1800 },
    { lines: ['Your warrior eats it immediately.', '"What? I can\'t read."'], color: 'red', duration: 1500 },
  ],
  [
    { lines: ['A ghost approaches. "Hey, do you have Wi-Fi?"', '"We\'re in a dungeon." "So... no?"'], color: 'cyan', duration: 1800 },
    { lines: ['The ghost drifts away, muttering about', 'dead zones being literal.'], color: 'brightBlack', duration: 1500 },
  ],
  [
    { lines: ['You stumble upon a room full of mirrors.', 'Your reflections look slightly more competent.'], color: 'magenta', duration: 1500 },
    { lines: ['"Is it weird that my reflection has better gear?"', '"Please stop talking to the mirror."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A vending machine stands against the wall.', 'It sells "Dungeon Insurance" for 999 crumbs.'], color: 'cyan', duration: 1800 },
    { lines: ['"What does it cover?" "Emotional damage."', 'Your healer considers it seriously.'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['An arrow sticks out of the wall with a note:', '"If you can read this, you\'re too close."'], color: 'red', duration: 1500 },
    { lines: ['Your scout pulls it out as a souvenir.', '"Three-star dungeon. Would maybe visit again."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['You hear snoring. Enormous, ground-shaking snoring.', 'Something very large is napping nearby.'], color: 'brightBlack', duration: 1500 },
    { lines: ['Your team tiptoes past.', 'Your bard trips. Everyone holds their breath.', '...The snoring continues. Lucky.'], color: 'yellow', duration: 2000 },
  ],
  [
    { lines: ['A chest sits in the corner with a sticky note:', '"NOT A MIMIC (promise)"'], color: 'yellow', duration: 1500 },
    { lines: ['"That\'s exactly what a mimic would say."', 'You move on. The chest sighs in disappointment.'], color: 'cyan', duration: 1800 },
  ],
  [
    { lines: ['The walls are covered in tally marks.', 'Hundreds of them. Someone was counting something.'], color: 'brightBlack', duration: 1500 },
    { lines: ['Below the marks: "Days since last cookie: ||||"', 'Only four. Amateurs.'], color: 'yellow', duration: 1500 },
  ],
];

// ── ADDITIONAL RANDOM ENCOUNTERS ──────────────────────────────────
// Expands the encounter pool for more dungeon variety

const EXTRA_ENCOUNTERS = [
  [
    { lines: ['A door slams shut behind the party.', 'A voice booms: "ANSWER MY RIDDLE!"'], color: 'magenta', duration: 1800 },
    { lines: ['"What has eyes but cannot see?"', '"A potato," your mage answers immediately.', 'The door opens. "...Correct."'], color: 'yellow', duration: 2000 },
  ],
  [
    { art: ['  _____', ' |     |', ' | ??? |', ' |_____|'], lines: ['You find a mysterious vending machine.', 'It only accepts exact change. In crumbs.'], color: 'cyan', duration: 1800 },
    { lines: ['Your scout inserts 3 crumbs. Nothing happens.', '"Out of order since the Third Age."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A group of goblins is having a tea party.', 'They invite you to sit down.'], color: 'green', duration: 1500 },
    { lines: ['"One lump or two?" asks the goblin.', 'Your warrior nervously accepts a scone.', 'It\'s actually quite good.'], color: 'yellow', duration: 2000 },
  ],
  [
    { lines: ['You find a painting of your team on the wall.', 'It\'s labeled "Intruders — Do Not Feed."'], color: 'magenta', duration: 1800 },
    { lines: ['"When was this painted?" "We just got here!"', '"The dungeon has wifi. And a social media account."'], color: 'yellow', duration: 1800 },
  ],
  [
    { lines: ['A trapped adventurer hangs from a net.', '"Oh hey. Can you help me down?" "How long you been up there?"'], color: 'cyan', duration: 1800 },
    { lines: ['"Three days. I\'ve named the spiders."', '"That\'s... concerning." "Reginald says hi."'], color: 'yellow', duration: 1800 },
  ],
  [
    { art: ['  \\o/', '   |', '  / \\'], lines: ['A skeleton is doing yoga in the corner.', 'Downward-facing bone.'], color: 'brightBlack', duration: 1800 },
    { lines: ['"Namaste," it whispers as you pass.', 'Your healer nods respectfully.'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['You step into a room full of mirrors.', 'Each reflection shows a different version of you.'], color: 'magenta', duration: 1500 },
    { lines: ['One version waves. Another is eating cookies.', 'A third is running away. "Interesting priorities."'], color: 'yellow', duration: 1800 },
  ],
  [
    { lines: ['A fountain in the center bubbles with... chocolate?', 'A sign reads: "Drink at own risk."'], color: 'cyan', duration: 1500 },
    { lines: ['Your bard takes a sip.', '"It\'s actually just mud." "...Still good though."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['The floor is covered in coins. All of them fake.', '"Cursed monopoly money," your scout mutters.'], color: 'brightBlack', duration: 1800 },
    { lines: ['Your warrior picks one up anyway.', '"It\'s the principle of the thing."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A dungeon review board is nailed to the wall:', '"2 stars. Not enough loot. Too many traps."'], color: 'white', duration: 1800 },
    { lines: ['"Previous reviewer: \'The boss was rude.\'"', '"Next reviewer: \'I died. 0/10.\'"'], color: 'yellow', duration: 1800 },
  ],
  [
    { lines: ['Two monsters are playing chess in the corner.', 'They glare at you. "Do you MIND?"'], color: 'cyan', duration: 1800 },
    { lines: ['Your party tiptoes past.', '"Checkmate!" one monster shouts. The other flips the board.'], color: 'yellow', duration: 1800 },
  ],
  [
    { lines: ['You discover a monster\'s diary.', '"Day 47: Still no adventurers. Getting lonely."'], color: 'brightBlack', duration: 1800 },
    { lines: ['"Day 48: Adventurers came! They killed me."', '"Wait, then who wrote—" "DON\'T THINK ABOUT IT."'], color: 'yellow', duration: 1800 },
  ],
  [
    { lines: ['A cat sits in the middle of the dungeon path.', 'It stares at you with an air of absolute authority.'], color: 'white', duration: 1500 },
    { lines: ['Your team tries to go around it. It moves to block.', '"The Dungeon Cat demands tribute."', 'Your healer gives it a cookie crumb. It purrs.'], color: 'yellow', duration: 2200 },
  ],
  [
    { lines: ['An imp runs past carrying a large bag of cookies.', '"You didn\'t see anything!" it shrieks.'], color: 'red', duration: 1500 },
    { lines: ['Moments later, a larger demon runs past.', '"DID YOU SEE AN IMP?!" "Which way did it go?"'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['The party finds an ancient puzzle door.', 'It requires solving a math problem to open.'], color: 'magenta', duration: 1500 },
    { lines: ['"2 + 2 = ?" reads the door.', '"It\'s a trick question," whispers your mage.', '"No it isn\'t." "You don\'t know that."'], color: 'yellow', duration: 2000 },
  ],
  [
    { lines: ['A sign on the wall reads: "TRAP AHEAD."', 'Below it in crayon: "No there isn\'t."'], color: 'red', duration: 1500 },
    { lines: ['Your scout checks. There IS a trap.', '"The crayon lied." "Crayons can\'t be trusted."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['You find a room where gravity is sideways.', 'Walking on the wall is disorienting but fun.'], color: 'magenta', duration: 1500 },
    { lines: ['"My lunch is going the wrong direction."', '"Everything is going the wrong direction."'], color: 'yellow', duration: 1500 },
  ],
  [
    { lines: ['A treasure chest opens itself.', '"Finally! Someone! I\'ve been trying to give away', 'this loot for YEARS!"'], color: 'cyan', duration: 2000 },
    { lines: ['"Is this a trap?" "NO! I\'m a GENEROUS chest!"', 'Your team backs away slowly.'], color: 'yellow', duration: 1800 },
  ],
];

// Merge extra encounters into the main pool
for (const enc of EXTRA_ENCOUNTERS) {
  RANDOM_ENCOUNTERS.push(enc);
}

// ── COMEDIC ENDINGS ──────────────────────────────────────────────
// Randomized comedic epilogues that play after dungeon completion or defeat.

const VICTORY_ENDINGS = {
  cave: [
    [
      { lines: ['Your team emerges blinking into the sunlight.', '"Did we just... survive?"'], color: 'yellow', duration: 1500 },
      { lines: ['"I call dibs on the shower!" "We don\'t have a shower."', '"Then I call dibs on the river."'], color: 'yellow', duration: 1500 },
      { lines: ['Your bard immediately starts composing a ballad.', 'It rhymes "cave" with "brave." And also "misbehave."'], color: 'cyan', duration: 1800 },
    ],
    [
      { lines: ['You count the loot. Then recount it.', '"Wait, that\'s it?" "Quality over quantity!"'], color: 'yellow', duration: 1500 },
      { lines: ['Your warrior is wearing a stalactite as a hat.', '"Battle trophy." "That\'s a rock." "BATTLE. TROPHY."'], color: 'yellow', duration: 1800 },
    ],
    [
      { lines: ['A bat follows you out. It won\'t leave.', '"I think it imprinted on you."'], color: 'cyan', duration: 1500 },
      { lines: ['"We are NOT keeping a dungeon bat."', 'The bat squeaks. Your healer melts. "We\'re keeping the bat."'], color: 'yellow', duration: 2000 },
    ],
  ],
  crypt: [
    [
      { lines: ['You seal the crypt doors behind you.', 'A ghost waves goodbye from a window. "Come back soon!"'], color: 'magenta', duration: 1500 },
      { lines: ['"That ghost seemed... nice?" "Don\'t. Don\'t humanize the ghosts."', '"But he waved!" "THEY ALL WAVE."'], color: 'yellow', duration: 2000 },
    ],
    [
      { lines: ['Your team checks for any lingering curses.', '"Am I cursed?" "You were like that before."'], color: 'magenta', duration: 1500 },
      { lines: ['"I want a receipt for this dungeon run."', '"Sir, this is the underworld." "I still want a receipt."'], color: 'yellow', duration: 1800 },
    ],
    [
      { lines: ['A skeleton\'s hand gives you a thumbs up from the ground.', '"Good job, adventurers!" "...Thanks?"'], color: 'brightBlack', duration: 1800 },
      { lines: ['Your mage picks up a bone. "Souvenir."', '"Put that back." "It\'s a COLLECTIBLE."'], color: 'yellow', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['The trees part to let you leave. How polite.', 'A squirrel throws an acorn at your head. Less polite.'], color: 'green', duration: 1800 },
      { lines: ['"The forest is judging us." "It\'s a FOREST."', '"A JUDGY forest."'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['You find your original trail markers.', 'Someone drew smiley faces on all of them.'], color: 'green', duration: 1500 },
      { lines: ['"Fairies." "Definitely fairies."', '"At least they\'re FRIENDLY fairies."'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['A deer watches you leave with visible relief.', '"The scary ones are leaving," it seems to say.'], color: 'green', duration: 1500 },
      { lines: ['Your berserker waves at the deer. It bolts.', '"I just wanted to say bye!" "You\'re still holding an axe."'], color: 'yellow', duration: 1800 },
    ],
  ],
  volcano: [
    [
      { lines: ['You stumble out of the caldera, everything singed.', '"My eyebrows will grow back. Probably."'], color: 'red', duration: 1500 },
      { lines: ['"On the bright side, my armor is now pre-heated."', '"That\'s not a bright side." "It\'s literally glowing."'], color: 'yellow', duration: 1800 },
    ],
    [
      { lines: ['Your boots have melted to your feet.', '"New fashion trend?" "No." "Volcanic chic?"'], color: 'red', duration: 1500 },
      { lines: ['Your bard\'s lute is on fire. They keep playing.', '"THE SHOW MUST GO ON!" "YOUR HANDS!" "THE SHOW!"'], color: 'yellow', duration: 2000 },
    ],
    [
      { lines: ['An imp runs after you waving a receipt.', '"You forgot your complimentary lava sample!"'], color: 'red', duration: 1500 },
      { lines: ['"NO THANK YOU." "But it comes with a gift basket!"', '"STILL NO." The imp looks genuinely hurt.'], color: 'yellow', duration: 1800 },
    ],
  ],
  abyss: [
    [
      { lines: ['You tumble back into normal reality.', 'Gravity works again. Colors make sense. Bliss.'], color: 'magenta', duration: 1500 },
      { lines: ['"How long were we in there?" "Three hours."', '"It felt like three YEARS." "Time is a suggestion down there."'], color: 'yellow', duration: 2000 },
    ],
    [
      { lines: ['Your shadow gives a relieved sigh upon returning.', '"Even my shadow had a bad time."'], color: 'magenta', duration: 1500 },
      { lines: ['Your mage\'s spell book is now written backwards.', '"Is this a feature?" "It\'s a CURSE." "Same thing in the abyss."'], color: 'yellow', duration: 1800 },
    ],
    [
      { lines: ['Everything looks normal. Suspiciously normal.', '"Is anyone else seeing the right number of fingers?"'], color: 'magenta', duration: 1500 },
      { lines: ['"I count ten." "I count eleven." "...Whose is the extra one?"', '*everyone slowly backs away from each other*'], color: 'yellow', duration: 2000 },
    ],
  ],
};

const DEFEAT_ENDINGS = {
  cave: [
    [
      { lines: ['Your team wakes up outside the cave.', '"How did we get here?" "The cave spat us out."'], color: 'brightBlack', duration: 1500 },
      { lines: ['"It literally just... ejected us?"', '"Even the cave didn\'t want us."'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['A sign appears at the cave entrance:', '"CLOSED DUE TO ADVENTURER INCOMPETENCE"'], color: 'red', duration: 1800 },
      { lines: ['"That\'s harsh." "But fair." "...Yeah, fair."'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['The monsters inside are celebrating.', 'You can hear them toasting with your lost crumbs.'], color: 'brightBlack', duration: 1500 },
      { lines: ['"They\'re having a PARTY with our stuff!"', '"Add insult to injury. And also theft."'], color: 'yellow', duration: 1800 },
    ],
  ],
  crypt: [
    [
      { lines: ['A ghost floats over with a clipboard.', '"Rate your death experience: 1 to 5 stars?"'], color: 'magenta', duration: 1800 },
      { lines: ['"We didn\'t die, we just... tactically retreated."', '"Through the floor. Unconscious." "TACTICALLY."'], color: 'yellow', duration: 2000 },
    ],
    [
      { lines: ['The undead are putting your portrait on the wall.', '"Hall of Shame, huh?" "They call it \'Wall of Visitors.\'"'], color: 'magenta', duration: 1800 },
      { lines: ['"At least we\'re famous somewhere."', '"Among the dead." "Famous is famous."'], color: 'yellow', duration: 1500 },
    ],
  ],
  forest: [
    [
      { lines: ['The forest gently places you at its edge.', 'Like a bouncer at a very green nightclub.'], color: 'green', duration: 1500 },
      { lines: ['"Come back when you\'ve leveled up," a tree seems to say.', '"Did that tree just trash-talk us?" "NATURE is trash-talking us."'], color: 'yellow', duration: 2000 },
    ],
    [
      { lines: ['Woodland creatures gather to stare at your defeat.', 'A fox shakes its head slowly. Judging.'], color: 'green', duration: 1500 },
      { lines: ['"Even the squirrels are disappointed."', '"The squirrels have no right. They eat ACORNS."'], color: 'yellow', duration: 1800 },
    ],
  ],
  volcano: [
    [
      { lines: ['The volcano cools slightly. Out of pity.', '"Did... did it just feel sorry for us?"'], color: 'red', duration: 1500 },
      { lines: ['"When a volcano pities you, you know it\'s bad."', '"Rock bottom. Literally." "Lava bottom, technically."'], color: 'yellow', duration: 1800 },
    ],
    [
      { lines: ['An imp drops off your singed belongings in a bag.', '"Lost and found. Emphasis on lost."'], color: 'red', duration: 1500 },
      { lines: ['"This bag says \'NOOB LOOT\' on it." "...I\'m going to pretend I can\'t read."'], color: 'yellow', duration: 1800 },
    ],
  ],
  abyss: [
    [
      { lines: ['Reality reassembles you. Mostly correctly.', '"Why is my left hand on my right arm?" "It\'ll sort itself out."'], color: 'magenta', duration: 1800 },
      { lines: ['"The abyss looked into us. And laughed."', '"To be fair, we ARE pretty funny."'], color: 'yellow', duration: 1500 },
    ],
    [
      { lines: ['You wake up with a note pinned to your chest:', '"Nice try. Better luck in another dimension."'], color: 'magenta', duration: 1800 },
      { lines: ['"Personal notes from eldritch horrors. Great."', '"At least the handwriting is neat."'], color: 'yellow', duration: 1500 },
    ],
  ],
};

// ── TROPHY CUTSCENES ──────────────────────────────────────────────

const TROPHY_CUTSCENES = {
  first_boss: [
    { art: ['  /!\\', ' / ! \\', '/  !  \\', '-------'], lines: ['TROPHY UNLOCKED: First Blood!', 'Your first boss lies defeated at your feet.'], color: 'yellow', duration: 2000 },
    { lines: ['This is just the beginning.', 'Greater challenges await in the deep.'], color: 'cyan', duration: 1500 },
  ],
  boss_10: [
    { art: ['  [!!]', ' /!!!!\\', '|!!!!!!|', ' \\!!!!/'], lines: ['TROPHY UNLOCKED: Boss Slayer!', '10 bosses have fallen to your might.'], color: 'yellow', duration: 2000 },
    { lines: ['Bosses are starting to warn each other about you.', '"Don\'t mess with that team. Seriously."'], color: 'cyan', duration: 1500 },
  ],
  boss_50: [
    { lines: ['TROPHY UNLOCKED: Boss Hunter!', '50 bosses defeated. You are a force of nature.'], color: 'yellow', duration: 2000 },
    { lines: ['Other adventurers tell stories about you.', 'Most of them are exaggerated. Not by much.'], color: 'green', duration: 1500 },
  ],
  boss_100: [
    { lines: ['TROPHY UNLOCKED: Boss Legend!', '100 bosses. ONE HUNDRED.'], color: 'yellow', duration: 2000 },
    { lines: ['Your name echoes through every dungeon.', 'Monsters check under their beds for you.'], color: 'magenta', duration: 1800 },
  ],
  boss_500: [
    { lines: ['TROPHY UNLOCKED: Boss God!', '500 bosses. The legends do not do you justice.'], color: 'yellow', duration: 2500 },
    { lines: ['You don\'t enter dungeons anymore.', 'Dungeons brace themselves when you arrive.'], color: 'red', duration: 2000 },
  ],
  flawless: [
    { art: ['  <*>', ' / * \\', '| *** |', ' \\   /', '  ---'], lines: ['TROPHY UNLOCKED: Flawless Victory!', 'A boss defeated without a single ally lost.'], color: 'yellow', duration: 2000 },
    { lines: ['Perfection. Absolute, beautiful perfection.', 'Your team high-fives. Even the stoic warrior smiles.'], color: 'green', duration: 1800 },
  ],
  dmg_100: [
    { lines: ['TROPHY UNLOCKED: Glass Cannon!', '100+ damage in a single devastating blow!'], color: 'yellow', duration: 2000 },
    { lines: ['The earth shook. The enemy... stopped existing.', '"Was that too much?" "There\'s no such thing."'], color: 'red', duration: 1500 },
  ],
  dmg_500: [
    { lines: ['TROPHY UNLOCKED: Devastating!', '500+ damage! Physics called. It\'s concerned.'], color: 'yellow', duration: 2000 },
    { lines: ['The shockwave was felt three dungeons over.', 'A goblin in the next cave dropped its lunch.'], color: 'cyan', duration: 1500 },
  ],
  dmg_9999: [
    { art: ['  !!!', ' /!!!\\', '|!!!!!|', ' \\!!!/'], lines: ['TROPHY UNLOCKED: Apocalyptic!', '9999+ DAMAGE. THE DAMAGE COUNTER WEPT.'], color: 'yellow', duration: 2500 },
    { lines: ['Reality filed a formal complaint.', 'The boss didn\'t just die. It was un-existed.'], color: 'red', duration: 2000 },
  ],
  first_death: [
    { art: ['  _____', ' |     |', ' | R.I.P|', ' |     |', ' |_____|'], lines: ['TROPHY UNLOCKED: First Fall.', 'Your first team wipe. It happens to everyone.'], color: 'red', duration: 2000 },
    { lines: ['Dust yourself off. Cookie crumbs out of your hair.', 'This is how heroes are forged.'], color: 'cyan', duration: 1800 },
  ],
  deaths_100: [
    { lines: ['TROPHY UNLOCKED: Undying Spirit!', '100 team wipes. And you\'re STILL here.'], color: 'yellow', duration: 2000 },
    { lines: ['Persistence isn\'t a strategy. It\'s YOUR strategy.', 'And honestly? It\'s working.'], color: 'green', duration: 1800 },
  ],
  legendary_find: [
    { art: ['  {L}', ' *   *', '  * *', '   *'], lines: ['TROPHY UNLOCKED: Legendary Find!', 'Your first Legendary item! It practically glows.'], color: 'yellow', duration: 2000 },
    { lines: ['The other items in your inventory are jealous.', 'Rightfully so.'], color: 'magenta', duration: 1500 },
  ],
  village_unlock: [
    { art: ['   /\\', '  /  \\', ' /    \\', '/______\\', '||    ||', '||____||| '], lines: ['TROPHY UNLOCKED: Village Founder!', 'Your village rises from the wilderness!'], color: 'yellow', duration: 2000 },
    { lines: ['A place to call home between adventures.', 'The first building is already a bakery. Obviously.'], color: 'green', duration: 1800 },
  ],
  dungeon_first: [
    { lines: ['TROPHY UNLOCKED: First Steps!', 'Your first dungeon cleared! Many more to come.'], color: 'yellow', duration: 2000 },
    { lines: ['You did it! You actually did it!', 'The cookies are safe. For now.'], color: 'green', duration: 1500 },
  ],
  level_100: [
    { lines: ['TROPHY UNLOCKED: Legend!', 'Level 100! You are the stuff of legend.'], color: 'yellow', duration: 2000 },
    { lines: ['Bards write songs about your exploits.', 'They\'re still bad songs, but the sentiment counts.'], color: 'cyan', duration: 1500 },
  ],
  level_200: [
    { lines: ['TROPHY UNLOCKED: Transcendent!', 'Level 200! You have surpassed mortal limits.'], color: 'yellow', duration: 2500 },
    { lines: ['The universe takes notice. It\'s impressed.', 'Also slightly nervous.'], color: 'magenta', duration: 1800 },
  ],
  level_500: [
    { art: ['  ***', ' *   *', '*  !  *', ' *   *', '  ***'], lines: ['TROPHY UNLOCKED: Ascended!', 'LEVEL 500! You have become something... more.'], color: 'yellow', duration: 3000 },
    { lines: ['Gods whisper your name. Legends pale beside you.', 'Cookie monsters bow in respect.'], color: 'magenta', duration: 2000 },
  ],
  crumbs_1m: [
    { lines: ['TROPHY UNLOCKED: Cookie Mogul!', '1,000,000 crumbs earned! You\'re crumb-rich!'], color: 'yellow', duration: 2000 },
    { lines: ['Your vault overflows with delicious currency.', 'Cookie economists study your portfolio.'], color: 'green', duration: 1500 },
  ],
  golden_cookie: [
    { art: ['     .--""""--. ', '   .\'  (::::)  \'.', '  / ::::  :::: \\', ' | (::::)(::::) |', '  \\ ::::  :::: /', '   \'. (::::)  .\'', '     \'--....--\' '], lines: ['TROPHY UNLOCKED: Golden Cookie!', 'Bought for 1,000,000 crumbs. Worth every one.'], color: 'yellow', duration: 2500 },
    { lines: ['It shines with golden light.', 'Other cookies look on in awe and jealousy.'], color: 'yellow', duration: 1800 },
  ],
  diamond_cookie: [
    { lines: ['TROPHY UNLOCKED: Diamond Cookie!', 'Bought for 5,000,000 crumbs. Absolutely dazzling.'], color: 'cyan', duration: 2500 },
    { lines: ['Light refracts through it in impossible colors.', 'You\'ll never eat a regular cookie the same way.'], color: 'magenta', duration: 1800 },
  ],
  cosmic_cookie: [
    { art: ['  . * . * .', ' * . * . * .', '. * {*} * .', ' * . * . * .', '  . * . * .'], lines: ['TROPHY UNLOCKED: Cosmic Cookie!', 'Bought for 25,000,000 crumbs. It contains galaxies.'], color: 'magenta', duration: 2500 },
    { lines: ['Stars orbit inside its chocolate chips.', 'It tastes like the birth of the universe.'], color: 'cyan', duration: 2000 },
  ],
  infinity_cookie: [
    { art: ['     _', '   _/ \\_', '  /  8  \\', ' |  / \\  |', '  \\_   _/', '    \\_/'], lines: ['TROPHY UNLOCKED: Infinity Cookie!', '100,000,000 crumbs! THE ULTIMATE COOKIE!'], color: 'yellow', duration: 3000 },
    { lines: ['It exists in all timelines simultaneously.', 'Every cookie that ever was or will be, is this cookie.'], color: 'magenta', duration: 2500 },
    { lines: ['You hold infinity in your hands.', 'It\'s warm. And has chocolate chips.'], color: 'cyan', duration: 2000 },
  ],
  time_999h: [
    { lines: ['TROPHY UNLOCKED: Eternal!', '999 hours of play. You are truly committed.'], color: 'yellow', duration: 2500 },
    { lines: ['Time itself bows to your dedication.', 'Cookies are not just a game. They\'re a lifestyle.'], color: 'magenta', duration: 2000 },
  ],
  talisman_max: [
    { lines: ['TROPHY UNLOCKED: Talisman Master!', 'Your talisman reaches its final form!'], color: 'yellow', duration: 2000 },
    { lines: ['It pulses with ancient power.', 'Even the darkness respects it.'], color: 'cyan', duration: 1500 },
  ],
};

// Generic fallback for trophies without specific cutscenes
const GENERIC_TROPHY_CUTSCENE = [
  { art: ['  ***', ' * T *', '  ***'], lines: ['TROPHY UNLOCKED!', ''], color: 'yellow', duration: 2000 },
  { lines: ['Another achievement added to your legend.', 'The cookie gods smile upon you.'], color: 'cyan', duration: 1500 },
];

// ── PROCEDURAL CUTSCENE GENERATOR ─────────────────────────────────
// Combinatorial system: characters × poses × scenes × dialogues × biomes
// Produces 1000+ unique cutscene sequences from templates.

/** Character race art (2-3 lines each, compact for cutscene frames) */
const CHAR_ART = {
  human:  [' O ', '/|\\', '/ \\'],
  elf:    ['@/ ', '/|\\', '/ \\'],
  dwarf:  [' # ', '/#\\', '| |'],
  goblin: ['.o.', '/|\\', ' | '],
  golem:  ['[#]', '[X]', '[_]'],
  sprite: [' * ', '.|.', ' v '],
};

/** Weapon overlays by class (applied to body line) */
const WEAPON_ART = {
  warrior:   ']==',
  scout:     '/--',
  healer:    '+--',
  mage:      '*~~',
  bard:      'd~~',
  berserker: 'X==',
};

/** Pose templates — different character stances for animation variety */
const POSES = {
  idle:    { mod: (art) => art },
  attack:  { mod: (art) => [art[0], art[1] + ' ]==>', art[2]] },
  defend:  { mod: (art) => ['(' + art[0] + ')', '|' + art[1] + '|', art[2]] },
  cast:    { mod: (art) => [' ~' + art[0] + '~ ', art[1], ' *' + art[2] + '* '] },
  cheer:   { mod: (art) => ['\\' + art[0] + '/', art[1], art[2]] },
  fallen:  { mod: () => ['  _  ', ' /_\\ ', '     '] },
  run:     { mod: (art) => [art[0] + '>>', '>>' + art[1], art[2] + '>>'] },
  sneak:   { mod: (art) => ['  ' + art[0], '  ' + art[1], '  ' + art[2]] },
  dance:   { mod: (art) => [' ~' + art[0] + '~ ', '~' + art[1] + '~', ' ~' + art[2] + '~ '] },
  laugh:   { mod: (art) => [art[0] + ' ha', art[1] + ' ha', art[2] + ' ha'] },
};

const POSE_NAMES = Object.keys(POSES);
const RACE_NAMES = Object.keys(CHAR_ART);
const CLASS_NAMES = Object.keys(WEAPON_ART);

/** Build a character art with race, class weapon, and pose */
function buildCharArt(raceIdx, classIdx, poseIdx) {
  const race = RACE_NAMES[raceIdx % RACE_NAMES.length];
  const cls = CLASS_NAMES[classIdx % CLASS_NAMES.length];
  const pose = POSE_NAMES[poseIdx % POSE_NAMES.length];
  let art = [...CHAR_ART[race]];
  // Add weapon to body line
  art[1] = art[1] + ' ' + WEAPON_ART[cls];
  // Apply pose
  art = POSES[pose].mod(art);
  // Pad all lines to consistent width for alignment
  const maxLen = Math.max(...art.map(l => l.length));
  return art.map(l => l.padEnd(maxLen));
}

/** Build a two-character interaction art (hero vs enemy/ally) */
function buildDualArt(seed) {
  const hero = buildCharArt(seed, seed >> 3, seed >> 6);
  const other = buildCharArt((seed >> 2) + 1, (seed >> 4) + 2, (seed >> 7) + 3);
  // Pad hero lines so the gap + other character aligns consistently
  const heroMax = Math.max(...hero.map(l => l.length));
  const paddedHero = hero.map(l => l.padEnd(heroMax));
  return paddedHero.map((line, i) => line + '    ' + (other[i] || ''));
}

// ── Scene template pools (dialogue lines, art compositions) ──────

/** Dramatic scene templates — tension, stakes, confrontation */
const DRAMATIC_SCENES = [
  { lines: ['{hero} locks eyes with the creature.', 'Neither blinks. Neither breathes.'], color: 'red' },
  { lines: ['The ground splits between {hero} and the enemy.', 'Lava wells up from below. No turning back.'], color: 'red' },
  { lines: ['{hero} raises their weapon, hands trembling.', '"This ends now," they whisper.'], color: 'yellow' },
  { lines: ['A shadow looms over the party.', '{hero} steps forward, shield raised.'], color: 'magenta' },
  { lines: ['The enemy\'s eyes glow with ancient fury.', '{hero} stands their ground.'], color: 'red' },
  { lines: ['Thunder cracks. The walls shake.', '{hero} and the beast circle each other.'], color: 'cyan' },
  { lines: ['{hero} sheathes their weapon. Then draws it again.', '"Just checking. Still sharp."'], color: 'white' },
  { lines: ['The torchlight catches {hero}\'s determined face.', 'There\'s no going back from here.'], color: 'yellow' },
  { lines: ['"I\'ve been waiting for this," {hero} says.', 'The enemy snarls in response.'], color: 'red' },
  { lines: ['Silence falls. Even the dungeon holds its breath.', '{hero} takes a slow, steady step forward.'], color: 'brightBlack' },
  { lines: ['{hero} feels the weight of every battle before this.', 'This one will be different. It has to be.'], color: 'magenta' },
  { lines: ['The enemy towers above the party.', '{hero} looks up and grins. "Big target."'], color: 'yellow' },
  { lines: ['A cold wind whistles through the chamber.', '{hero} adjusts their grip and waits.'], color: 'cyan' },
  { lines: ['The ground is littered with bones of past challengers.', '{hero} steps over them. "We\'re not them."'], color: 'red' },
  { lines: ['{hero} and the beast lock eyes across the chamber.', 'One of them won\'t leave this room.'], color: 'red' },
];

/** Action scene templates — combat moves, explosions, chaos */
const ACTION_SCENES = [
  { lines: ['{hero} charges with a battle cry!', 'Steel clashes against claw!'], color: 'red' },
  { lines: ['{hero} dodges left! Rolls right!', 'The enemy\'s attack misses by inches.'], color: 'cyan' },
  { lines: ['Sparks fly as weapons collide!', '{hero} pushes back with raw strength.'], color: 'yellow' },
  { lines: ['{hero} leaps over the enemy\'s sweep!', 'Lands behind it. Strikes. Gone.'], color: 'green' },
  { lines: ['The ceiling crumbles! Rocks rain down!', '{hero} shields the party from debris.'], color: 'red' },
  { lines: ['{hero} slides under the monster\'s legs!', '"Not very agile, are you?"'], color: 'cyan' },
  { lines: ['A massive explosion rocks the chamber!', '{hero} emerges from the dust, coughing.'], color: 'red' },
  { lines: ['{hero} throws their weapon — it spins end over end!', 'Direct hit. They catch it on the return.'], color: 'yellow' },
  { lines: ['The party scatters as the ground erupts!', '{hero} grabs an ally and dives for cover.'], color: 'red' },
  { lines: ['{hero} parries three attacks in rapid succession!', '"Is that all you\'ve got?"'], color: 'cyan' },
  { lines: ['The enemy charges! {hero} stands firm!', 'Impact! Dust everywhere! ...{hero} still stands.'], color: 'yellow' },
  { lines: ['{hero} vaults off a fallen column!', 'Brings their weapon down with devastating force.'], color: 'red' },
  { lines: ['Arrow after arrow after arrow!', '{hero} fires without stopping. Each one finds its mark.'], color: 'green' },
  { lines: ['{hero} and the monster clash!', 'Shockwaves ripple through the chamber.'], color: 'magenta' },
  { lines: ['The floor cracks beneath {hero}\'s feet!', 'They leap to safety as it collapses below.'], color: 'red' },
];

/** Comedic scene templates — humor, banter, absurdity */
const COMEDIC_SCENES = [
  { lines: ['{hero} trips over a rock.', '"I meant to do that. Tactical stumble."'], color: 'yellow' },
  { lines: ['"Did anyone bring snacks?" asks {hero}.', 'Everyone stares. "What? Dungeon snacks."'], color: 'yellow' },
  { lines: ['{hero} high-fives a skeleton on the wall.', '"He seemed friendly."'], color: 'cyan' },
  { lines: ['{hero} tries to look intimidating.', 'The enemy yawns. Literally yawns.'], color: 'yellow' },
  { lines: ['"I have a plan!" declares {hero}.', '"Oh no," says everyone simultaneously.'], color: 'yellow' },
  { lines: ['{hero} accidentally steps on the bard\'s lute.', '"That was my best one!" "You only had one."'], color: 'yellow' },
  { lines: ['A cookie rolls out of {hero}\'s pocket.', 'Both sides pause to watch it roll away.'], color: 'cyan' },
  { lines: ['{hero} reads the room. The room is illiterate.', '"What?" "Nothing. Let\'s keep going."'], color: 'yellow' },
  { lines: ['"On a scale of 1 to doomed—" starts {hero}.', '"Doomed," everyone agrees.'], color: 'yellow' },
  { lines: ['{hero} tries to diplomatize with the enemy.', '"Do you accept cookies as currency?" It does not.'], color: 'yellow' },
  { lines: ['{hero} finds a treasure chest. It\'s empty.', 'There\'s a note: "Better luck next time! :)"'], color: 'cyan' },
  { lines: ['The enemy sneezes. {hero} says "bless you."', 'An awkward pause. Combat resumes.'], color: 'yellow' },
  { lines: ['"Left or right?" asks {hero}.', '"Left." They go right. Classic {hero}.'], color: 'yellow' },
  { lines: ['{hero} tries to pet the monster.', '"Bad idea! BAD IDEA!" "IT\'S SO FLUFFY THOUGH!"'], color: 'yellow' },
  { lines: ['{hero} slips on a puddle of slime.', 'Slides 30 feet. Into a wall. "...Ow."'], color: 'cyan' },
  { lines: ['{hero} challenges the boss to a staring contest.', 'The boss has seventeen eyes. Unfair advantage.'], color: 'yellow' },
  { lines: ['"We should retreat and—" starts {hero}.', 'The exit sealed behind them. "Never mind."'], color: 'yellow' },
  { lines: ['{hero} offers the enemy a cookie.', 'It takes it. Eats it. Attacks anyway. Rude.'], color: 'yellow' },
  { lines: ['{hero}\'s weapon gets stuck in a crack.', '"It\'s a feature, not a bug."'], color: 'cyan' },
  { lines: ['An echo repeats everything {hero} says.', '"Stop that!" "Stop that!" "...Very mature."'], color: 'yellow' },
];

/** Exploration/atmosphere scene templates */
const ATMOSPHERE_SCENES = [
  { lines: ['Footsteps echo endlessly ahead.', '{hero} counts them. Loses count. Starts over.'], color: 'brightBlack' },
  { lines: ['Water drips from the ceiling in a steady rhythm.', 'It sounds almost like a heartbeat.'], color: 'cyan' },
  { lines: ['Ancient murals cover the walls.', '{hero} traces the carvings with a finger.'], color: 'magenta' },
  { lines: ['The air grows thick with the scent of old stone.', 'Something about this place feels... alive.'], color: 'brightBlack' },
  { lines: ['{hero} finds markings from a previous expedition.', '"They made it this far. Let\'s go further."'], color: 'white' },
  { lines: ['Crystals in the walls pulse with faint light.', 'They respond to {hero}\'s heartbeat.'], color: 'cyan' },
  { lines: ['A distant rumble. Then silence.', '{hero} and the party exchange glances.'], color: 'brightBlack' },
  { lines: ['The corridor narrows until they must walk single file.', '{hero} takes point. Naturally.'], color: 'white' },
  { lines: ['Strange symbols glow on the floor ahead.', '{hero} steps over them. Carefully.'], color: 'magenta' },
  { lines: ['The torch flickers. Almost goes out.', '{hero} shields it with their hand. "Not yet."'], color: 'yellow' },
  { lines: ['Something skitters in the darkness beyond the light.', '{hero} pretends not to notice. The party knows.'], color: 'brightBlack' },
  { lines: ['An underground river rushes past, cold and deep.', '{hero} finds stepping stones. Most of them hold.'], color: 'cyan' },
  { lines: ['The walls here are warm to the touch.', '{hero} presses on. The warmth follows them.'], color: 'red' },
  { lines: ['Old adventurer graffiti: "FLOOR 42 — HALFWAY THERE"', '{hero} adds a tally mark to the collection.'], color: 'white' },
  { lines: ['The ceiling stretches impossibly high above.', 'Stars? Underground? This dungeon is strange.'], color: 'magenta' },
];

/** Victory/celebration scene templates */
const VICTORY_SCENES = [
  { lines: ['{hero} raises their weapon to the sky!', 'The party erupts in cheers!'], color: 'green' },
  { lines: ['The dust settles. {hero} still stands.', '"Is it over?" "...Yeah. Yeah, it\'s over."'], color: 'cyan' },
  { lines: ['{hero} collapses to one knee, breathing hard.', 'Then looks up and grins. "We did it."'], color: 'green' },
  { lines: ['Cookie crumbs rain from the defeated monster.', '{hero} catches them. "Jackpot."'], color: 'yellow' },
  { lines: ['{hero} sheathes their weapon with a satisfying click.', '"Another one for the history books."'], color: 'green' },
  { lines: ['The party gathers around {hero}.', '"That was terrifying." "Let\'s do it again!"'], color: 'yellow' },
  { lines: ['{hero} does a victory dance.', 'The bard joins in. It\'s terrible. It\'s perfect.'], color: 'green' },
  { lines: ['Loot spills from the defeated creature.', '{hero} starts sorting. "Dibs on the shiny one."'], color: 'yellow' },
  { lines: ['{hero} takes a deep breath of stale dungeon air.', '"Smells like victory. And mildew."'], color: 'cyan' },
  { lines: ['The room brightens as the enemy falls.', '{hero} can finally see how big the chamber is. "Wow."'], color: 'green' },
];

/** Biome flavor inserts — added to generated scenes for variety */
const BIOME_FLAVOR = {
  cave: [
    'Stalactites shimmer overhead.',
    'The rock walls weep moisture.',
    'A bat colony stirs at the disturbance.',
    'Fungal growths glow softly in the corners.',
    'The echo here takes forever to fade.',
    'Crystal veins pulse with inner light.',
    'The air smells of mineral and rust.',
  ],
  crypt: [
    'Bones rattle in their alcoves.',
    'The candles flicker without wind.',
    'A ghost drifts past, barely noticing.',
    'Cobwebs thick as curtains part around them.',
    'The stone coffins seem to hum.',
    'Ancient dust swirls in the lantern light.',
    'The dead watch. The dead always watch.',
  ],
  forest: [
    'Roots crack through the dungeon floor.',
    'Fireflies circle in impossible patterns.',
    'The trees outside seem to lean closer.',
    'Moss covers everything in soft green.',
    'A bird sings somewhere far above.',
    'Mushroom rings glow with fairy light.',
    'The scent of pine cuts through the dust.',
  ],
  volcano: [
    'Lava veins pulse in the walls.',
    'The heat makes the air shimmer.',
    'Obsidian shards crunch underfoot.',
    'Smoke curls from cracks in the floor.',
    'Everything has a reddish tint here.',
    'The ground vibrates with a deep pulse.',
    'Sweat drips before they even start fighting.',
  ],
  abyss: [
    'Reality flickers at the edges of vision.',
    'Shadows move independently of their owners.',
    'The geometry here hurts to look at.',
    'Whispers come from everywhere and nowhere.',
    'Gravity changes direction for a moment.',
    'The darkness has texture. It\'s unsettling.',
    'Distance means nothing in this place.',
  ],
};

/** Hero name templates — combined with class for {hero} substitution */
const HERO_NAMES = [
  'your warrior', 'the scout', 'your healer', 'the mage',
  'your bard', 'the berserker', 'your leader', 'the rogue',
  'your champion', 'the veteran', 'the rookie', 'your captain',
];

/**
 * Generate a procedural cutscene from combinatorial templates.
 * Uses the seed to deterministically select: scene style, dialogue lines,
 * character art, biome flavor, and arrangement.
 *
 * Total combinations: 15 scenes × 5 styles × 12 heroes × 7 flavors × 10 poses = 63,000+
 *
 * @param {string} type - 'intro'|'pre_miniboss'|'post_miniboss'|'pre_boss'|'post_boss'|'complete'|'encounter'
 * @param {string} biome - Biome id
 * @param {number} seed - Deterministic seed
 * @returns {object[]} Array of cutscene frames
 */
function generateProceduralCutscene(type, biome, seed) {
  const s = Math.abs(seed);

  // Select scene style based on type
  let scenePool;
  let colorOverride;
  switch (type) {
    case 'intro':
    case 'encounter':
      // Mix of atmosphere and comedic for exploration
      scenePool = s % 3 === 0 ? COMEDIC_SCENES : (s % 3 === 1 ? ATMOSPHERE_SCENES : DRAMATIC_SCENES);
      break;
    case 'pre_miniboss':
    case 'pre_boss':
      // Dramatic and action for pre-combat
      scenePool = s % 2 === 0 ? DRAMATIC_SCENES : ACTION_SCENES;
      colorOverride = 'red';
      break;
    case 'post_miniboss':
    case 'post_boss':
    case 'complete':
      // Victory and comedic for post-combat
      scenePool = s % 3 === 0 ? COMEDIC_SCENES : (s % 3 === 1 ? VICTORY_SCENES : ATMOSPHERE_SCENES);
      break;
    default:
      scenePool = ATMOSPHERE_SCENES;
  }

  // Pick scenes using different seed offsets for variety
  const scene1 = scenePool[(s) % scenePool.length];
  const scene2Pools = [DRAMATIC_SCENES, ACTION_SCENES, COMEDIC_SCENES, ATMOSPHERE_SCENES, VICTORY_SCENES];
  const scene2Pool = scene2Pools[(s >> 4) % scene2Pools.length];
  const scene2 = scene2Pool[(s >> 2) % scene2Pool.length];

  // Pick hero name
  const hero = HERO_NAMES[s % HERO_NAMES.length];

  // Pick biome flavor
  const flavors = BIOME_FLAVOR[biome] || BIOME_FLAVOR.cave;
  const flavor = flavors[(s >> 3) % flavors.length];

  // Generate character art
  const charArt = buildDualArt(s);

  // Substitute {hero} in lines
  const sub = (lines) => lines.map(l => l.replace(/\{hero\}/g, hero));

  // Build frames
  const frames = [];

  // Frame 1: Scene opener with art
  frames.push({
    art: charArt,
    lines: sub(scene1.lines),
    color: colorOverride || scene1.color,
    duration: 1800,
  });

  // Frame 2: Biome flavor
  frames.push({
    lines: [flavor, ''],
    color: 'brightBlack',
    duration: 1200,
  });

  // Frame 3: Second scene with different art pose
  const charArt2 = buildCharArt((s >> 1) + 2, (s >> 3) + 1, (s >> 5) + 4);
  frames.push({
    art: charArt2,
    lines: sub(scene2.lines),
    color: scene2.color,
    duration: 1500,
  });

  return frames;
}

// ── CUTSCENE SELECTION API ─────────────────────────────────────────

/** Duration multiplier — applied to all cutscene frame durations at the API boundary. */
const DURATION_MULTIPLIER = 2.0;

/**
 * Apply duration multiplier to an array of cutscene frames.
 * Returns a new array with scaled durations (does not mutate originals).
 */
function applyDuration(frames) {
  if (!frames || frames.length === 0) return frames;
  return frames.map(f => ({ ...f, duration: Math.round((f.duration ?? 1200) * DURATION_MULTIPLIER) }));
}

/**
 * Pick a cutscene from a pool using seed-based selection.
 * @param {object[]} pool - Array of cutscene arrays
 * @param {number} seed - For deterministic but varied selection
 * @returns {object[]} Array of frames
 */
function pickFromPool(pool, seed) {
  if (!pool || pool.length === 0) return [];
  return applyDuration(pool[Math.abs(seed) % pool.length]);
}

/**
 * Pick from hand-crafted pool or fall through to procedural generation.
 * Hand-crafted scenes are used when seed lands on them; otherwise procedural.
 * This gives ~40% hand-crafted, ~60% procedural for massive variety.
 */
function pickOrGenerate(pool, type, biome, seed) {
  const s = Math.abs(seed);
  // Use hand-crafted pool roughly 40% of the time
  if (pool && pool.length > 0 && (s % 5) < 2) {
    return pickFromPool(pool, seed);
  }
  return applyDuration(generateProceduralCutscene(type, biome, seed));
}

/**
 * Get a dungeon intro cutscene.
 * @param {string} biome
 * @param {number} seed
 * @returns {object[]} frames
 */
export function getDungeonIntroCutscene(biome, seed) {
  const pool = DUNGEON_INTROS[biome] || DUNGEON_INTROS.cave;
  return pickOrGenerate(pool, 'intro', biome, seed);
}

/**
 * Get a pre-miniboss cutscene.
 */
export function getPreMinibossCutscene(biome, seed) {
  const pool = PRE_MINIBOSS[biome] || PRE_MINIBOSS.cave;
  return pickOrGenerate(pool, 'pre_miniboss', biome, seed);
}

/**
 * Get a post-miniboss cutscene.
 */
export function getPostMinibossCutscene(biome, seed) {
  const pool = POST_MINIBOSS[biome] || POST_MINIBOSS.cave;
  return pickOrGenerate(pool, 'post_miniboss', biome, seed);
}

/**
 * Get a pre-boss cutscene.
 */
export function getPreBossCutscene(biome, seed) {
  const pool = PRE_BOSS[biome] || PRE_BOSS.cave;
  return pickOrGenerate(pool, 'pre_boss', biome, seed);
}

/**
 * Get a post-boss cutscene.
 */
export function getPostBossCutscene(biome, seed) {
  const pool = POST_BOSS[biome] || POST_BOSS.cave;
  return pickOrGenerate(pool, 'post_boss', biome, seed);
}

/**
 * Get a dungeon complete cutscene.
 */
export function getDungeonCompleteCutscene(biome, seed) {
  const pool = DUNGEON_COMPLETE[biome] || DUNGEON_COMPLETE.cave;
  return pickOrGenerate(pool, 'complete', biome, seed);
}

/**
 * Get a random encounter cutscene (not biome-specific).
 */
export function getRandomEncounterCutscene(seed) {
  const s = Math.abs(seed);
  if (RANDOM_ENCOUNTERS.length > 0 && (s % 5) < 2) {
    return pickFromPool(RANDOM_ENCOUNTERS, seed);
  }
  return applyDuration(generateProceduralCutscene('encounter', 'cave', seed));
}

/**
 * Get a trophy unlock cutscene. Consistent per trophy ID.
 */
export function getTrophyCutscene(trophyId, trophyName) {
  const specific = TROPHY_CUTSCENES[trophyId];
  if (specific) return applyDuration(specific);
  // Generic with trophy name filled in
  const generic = GENERIC_TROPHY_CUTSCENE.map(f => ({ ...f, lines: [...f.lines] }));
  generic[0].lines[1] = trophyName || trophyId;
  return applyDuration(generic);
}

/**
 * Get a comedic victory ending cutscene (plays after dungeon completion).
 */
export function getVictoryEndingCutscene(biome, seed) {
  const pool = VICTORY_ENDINGS[biome] || VICTORY_ENDINGS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a comedic defeat ending cutscene (plays after team wipe).
 */
export function getDefeatEndingCutscene(biome, seed) {
  const pool = DEFEAT_ENDINGS[biome] || DEFEAT_ENDINGS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Determine if a random encounter cutscene should trigger (15% chance per room).
 * @param {number} seed
 * @returns {boolean}
 */
export function shouldTriggerRandomEncounter(seed) {
  return (Math.abs(seed) % 100) < 15;
}
