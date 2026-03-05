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

// ── CUTSCENE SELECTION API ─────────────────────────────────────────

/**
 * Pick a cutscene from a pool using seed-based selection.
 * @param {object[]} pool - Array of cutscene arrays
 * @param {number} seed - For deterministic but varied selection
 * @returns {object[]} Array of frames
 */
function pickFromPool(pool, seed) {
  if (!pool || pool.length === 0) return [];
  return pool[Math.abs(seed) % pool.length];
}

/**
 * Get a dungeon intro cutscene.
 * @param {string} biome
 * @param {number} seed
 * @returns {object[]} frames
 */
export function getDungeonIntroCutscene(biome, seed) {
  const pool = DUNGEON_INTROS[biome] || DUNGEON_INTROS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a pre-miniboss cutscene.
 */
export function getPreMinibossCutscene(biome, seed) {
  const pool = PRE_MINIBOSS[biome] || PRE_MINIBOSS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a post-miniboss cutscene.
 */
export function getPostMinibossCutscene(biome, seed) {
  const pool = POST_MINIBOSS[biome] || POST_MINIBOSS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a pre-boss cutscene.
 */
export function getPreBossCutscene(biome, seed) {
  const pool = PRE_BOSS[biome] || PRE_BOSS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a post-boss cutscene.
 */
export function getPostBossCutscene(biome, seed) {
  const pool = POST_BOSS[biome] || POST_BOSS.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a dungeon complete cutscene.
 */
export function getDungeonCompleteCutscene(biome, seed) {
  const pool = DUNGEON_COMPLETE[biome] || DUNGEON_COMPLETE.cave;
  return pickFromPool(pool, seed);
}

/**
 * Get a random encounter cutscene (not biome-specific).
 */
export function getRandomEncounterCutscene(seed) {
  return pickFromPool(RANDOM_ENCOUNTERS, seed);
}

/**
 * Get a trophy unlock cutscene. Consistent per trophy ID.
 */
export function getTrophyCutscene(trophyId, trophyName) {
  const specific = TROPHY_CUTSCENES[trophyId];
  if (specific) return specific;
  // Generic with trophy name filled in
  const generic = GENERIC_TROPHY_CUTSCENE.map(f => ({ ...f, lines: [...f.lines] }));
  generic[0].lines[1] = trophyName || trophyId;
  return generic;
}

/**
 * Determine if a random encounter cutscene should trigger (15% chance per room).
 * @param {number} seed
 * @returns {boolean}
 */
export function shouldTriggerRandomEncounter(seed) {
  return (Math.abs(seed) % 100) < 15;
}
