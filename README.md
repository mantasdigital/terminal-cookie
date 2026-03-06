# Terminal Cookie

```
        ___
       /   \
      | o o |
      |  _  |      Terminal Cookie
       \___/       Cookie Dungeon RPG + AI Security Monitor + MCP Server
      /|   |\
     / |   | \
    /  |___|  \
   /___|   |___\
       |   |
      _|   |_
     |_______|
```

A terminal-based cookie dungeon crawler that doubles as an AI security monitor and Model Context Protocol (MCP) server. Recruit adventurers, explore procedurally generated dungeons with animated combat visuals, build villages, upgrade talismans, collect 50 trophies, and scan code for security vulnerabilities -- all from your terminal. Features auto-equip, auto-shop, auto-talisman upgrade, loot rain animations, 2000+ dungeon art pieces, and full automation settings. Crumbs are earned through AI interactions.

---

## Getting Started (Step by Step)

You need two things installed on your computer before you begin:

1. **Node.js** (version 18 or newer) -- download it from https://nodejs.org
2. **A terminal** -- Terminal.app (macOS), Windows Terminal, or any Linux terminal

### Step 1: Download the game

Open your terminal and run these commands **one at a time**:

```bash
git clone https://github.com/mantasdigital/terminal-cookie.git
```

This downloads the game to a folder called `terminal-cookie`.

### Step 2: Go into the game folder

```bash
cd terminal-cookie
```

### Step 3: Install dependencies

```bash
npm install
```

This downloads the libraries the game needs. Wait until it finishes.

### Step 4: Start the game

```bash
npm start
```

The game will take over your terminal screen. You should see the main menu.

**That's it -- you're playing the terminal version!**

> **Tip:** To quit the game at any time, press `Q` on the main menu or `Ctrl+C` anywhere.

### Step 5: Connect to Claude (optional but recommended)

Terminal Cookie can also be played through Claude AI. Claude clicks cookies, recruits heroes, and explores dungeons for you -- with unique reactions every time.

Run this command to register the game as a Claude tool (paste your actual path from Step 2):

```bash
claude mcp add terminal-cookie -- node /YOUR/PATH/HERE/bin/cookie.js --mcp
```

Then open Claude Code and say `"Click the cookie"` to start playing through AI.

### Step 6: Auto-mine cookies on every interaction (automatic)

Cookie mining hooks are **installed automatically** the first time you start the game (`npm start`) or connect via MCP. Every Claude interaction mines cookies -- sending messages, getting responses, clicking "yes"/"no", accepting suggestions, everything. No extra setup needed.

If you ever need to reinstall them manually:

```bash
node bin/cookie.js --setup-hooks
```

> **Want the full setup guide?** See [Playing with Claude AI](#playing-with-claude-ai) below for detailed instructions, Claude Desktop setup, troubleshooting, and the multi-terminal mining bonus.

### Step 7: Submit to the leaderboard (optional)

Once you've played some games, submit your score to the community leaderboard:

```bash
node bin/cookie.js --submit-score
```

Enter your name (and optionally your org/team), then push the branch and open a PR. See [Community Leaderboard](#community-leaderboard) for full details.

---

## How to Play

### Main Menu

When the game starts, you see the main menu. Use these keys:

| Key         | What it does         |
|-------------|----------------------|
| `Up Arrow`  | Move selection up    |
| `Down Arrow`| Move selection down  |
| `Enter`     | Choose the selected option |
| `Q`         | Quit the game        |

### Step-by-Step Gameplay

1. **Select "New Game"** from the menu and press `Enter`
2. **Choose a mode** -- Default (manual tavern, auto dungeons) or Work (fully automatic)
3. **You arrive at the Tavern.** This is your home base.
4. **Earn crumbs** -- crumbs (in-game currency) are earned through AI interactions via MCP, not manual clicks
5. **Recruit a hero** -- press `R` to see available recruits, use `Up`/`Down` arrows to pick one, press `Enter` to hire them
6. **Dungeons auto-play** -- once you have a team, a timer starts and the dungeon auto-enters. Combat, loot, and room navigation are handled automatically (toggle in Settings)
7. **Manage your team** -- equip items to specific characters, unequip gear, sell or enchant items in the tavern
8. **Build a village** -- with 9+ alive team members, found a village and upgrade 7 buildings for permanent bonuses
9. **Upgrade your talisman** -- spend crumbs to level up a persistent artifact with bonuses that survive death
10. **Repeat!** -- recruit more heroes, go deeper into dungeons, get stronger. Fallen allies die permanently.

### All Controls

#### Tavern (Home Base)

| Key         | What it does                    |
|-------------|----------------------------------|
| `R`         | Switch to Recruit tab            |
| `I`         | Switch to Inventory tab          |
| `H`         | Switch to Shop tab               |
| `V`         | Switch to Village tab (9+ team)  |
| `T`         | Switch to Talisman tab           |
| `Y`         | Switch to Trophies tab             |
| `G`         | Switch to Adventure Log tab      |
| `Left`/`Right` | Switch between tabs          |
| `Up`/`Down` | Browse list / select member      |
| `Tab`       | Switch equip slot (Party tab)    |
| `U`         | Unequip slot (Party) / Upgrade (Talisman) |
| `Enter`/`E` | Equip to member (Inv) / Recruit / Buy |
| `X`         | Enchant selected item (Inventory)|
| `S`         | Sell item (Inventory) / Settings |
| `D`         | Drop item (Inventory)            |
| `E`         | Enter dungeon (need a team)      |
| `W`         | Save game                        |
| `Escape`    | Back to main menu                |
| `?`         | Show help overlay                |

#### Dungeon (Auto by default)

Dungeons auto-play by default — rooms, combat, loot, and death recovery are handled automatically. Toggle the **Auto-Dungeon** setting in Settings to switch to manual mode.

**Manual mode keys:**

| Key         | What it does                    |
|-------------|----------------------------------|
| `Up`/`Down` | Choose path at a fork            |
| `Enter`     | Interact with current room       |
| `W`         | Save game                        |
| `?`         | Show help overlay                |

#### Combat (Auto-Battle)

Combat auto-resolves on a 600ms tick with d20 dice rolls. You can speed it up or take manual control:

| Key         | What it does                    |
|-------------|----------------------------------|
| `Space`/`Enter` | Speed up (instant turn)     |
| `A`         | Auto-resolve entire battle       |
| `F`         | Flee from battle                 |
| `?`         | Show help overlay                |

#### Loot Screen

| Key         | What it does                    |
|-------------|----------------------------------|
| `Up`/`Down` | Select an item                   |
| `E`         | Equip the selected item          |
| `S`         | Sell the selected item           |
| `D`         | Discard the selected item        |
| `Enter`     | Continue to next room            |

#### Work Mode

Fully automatic mode — the game recruits, enters dungeons, fights, loots, and recovers from death without any input. Press `Q` to save and exit at any time.

---

## Playing with Claude AI

Terminal Cookie is built to be played through Claude. The game runs as an MCP (Model Context Protocol) server -- Claude connects to it and uses game tools directly in your conversation. You talk to Claude, Claude plays the game.

**The terminal game (`npm start`) and Claude mode are separate.** You can use one or both, but not in the same terminal window.

### What is MCP?

MCP (Model Context Protocol) lets Claude use external tools. Terminal Cookie registers itself as an MCP server, giving Claude access to game commands like `cookie_click`, `cookie_tavern`, `cookie_explore`, etc. When you ask Claude to "click the cookie", Claude literally calls the `cookie_click` tool and the game responds.

---

### Connecting to Claude Code (Recommended)

Claude Code is the terminal-based Claude CLI. This is the fastest way to play.

#### Step 1: Find your game path

Open a terminal, go to the game folder, and get the full path:

```bash
cd terminal-cookie
pwd
```

This prints something like `/Users/yourname/Downloads/terminal-cookie`. Copy it.

#### Step 2: Register the MCP server

Run this command in the same terminal (paste your actual path):

```bash
claude mcp add terminal-cookie -- node /YOUR/PATH/HERE/bin/cookie.js --mcp
```

**Real example** (macOS, game in Downloads):

```bash
claude mcp add terminal-cookie -- node /Users/yourname/Downloads/terminal-cookie/bin/cookie.js --mcp
```

**Real example** (Windows):

```bash
claude mcp add terminal-cookie -- node C:\Users\yourname\Downloads\terminal-cookie\bin\cookie.js --mcp
```

#### Step 3: Verify it works

Open Claude Code and type:

```
/mcp
```

You should see `terminal-cookie` in the list with a green status. Then ask Claude:

```
"Click the cookie"
```

If you see crumbs and a cookie, you're connected!

#### Troubleshooting connection

If `terminal-cookie` doesn't appear in `/mcp`:

1. **Check Node.js version:** Run `node --version` -- you need v18 or newer
2. **Check the path:** Make sure the path in your `claude mcp add` command points to the actual `bin/cookie.js` file
3. **Reinstall dependencies:** Run `npm install` in the game folder
4. **Restart Claude Code:** Close and reopen your terminal, then start Claude Code again
5. **Check logs:** Run `claude mcp add terminal-cookie -- node /path/to/bin/cookie.js --mcp` again -- it will overwrite the old entry

---

### Connecting to Claude Desktop App

Claude Desktop is the GUI app for macOS/Windows. You edit a config file to add MCP servers.

#### Step 1: Find the config file

| OS | Config file location |
|----|---------------------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

If the file doesn't exist, create it.

#### Step 2: Add Terminal Cookie to the config

Open the config file in any text editor and add (or merge) this:

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/FULL/PATH/TO/terminal-cookie/bin/cookie.js", "--mcp"]
    }
  }
}
```

Replace `/FULL/PATH/TO/terminal-cookie` with your actual path.

**macOS example:**

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/Users/yourname/Downloads/terminal-cookie/bin/cookie.js", "--mcp"]
    }
  }
}
```

**Windows example:**

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["C:\\Users\\yourname\\Downloads\\terminal-cookie\\bin\\cookie.js", "--mcp"]
    }
  }
}
```

#### Step 3: Restart Claude Desktop

Quit the app completely and reopen it. You should see a hammer icon in the chat input -- that means MCP tools are loaded. Click it to confirm `terminal-cookie` tools are listed.

#### Step 4: Start playing

Type in the chat:

```
"Click the cookie"
```

Claude will call the `cookie_click` tool and respond with crumbs, ASCII art, and a cookie-themed reaction.

---

### Make It Permanent (All Projects)

By default, `claude mcp add` registers the server for the current project only. To make Terminal Cookie available in every Claude Code project:

Edit `~/.claude/settings.json` (create it if it doesn't exist):

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/FULL/PATH/TO/terminal-cookie/bin/cookie.js", "--mcp"]
    }
  }
}
```

---

### Auto-Mine Cookies on Every Interaction

Cookie mining hooks are **installed automatically** the first time you start the game or connect via MCP. Every single Claude interaction mines cookies:

- You type a message → **+1 crumb**
- Claude responds → **+1 crumb**
- You click "yes", "no", "remember", or any choice → **+1 crumb**
- You approve a tool call → **+1 crumb**

You don't need to mention the game at all. Just use Claude for your normal work — writing code, asking questions, reviewing PRs — and cookies mine in the background. The crumbs sync to the terminal game via the live state file.

If hooks are ever removed, they will be reinstalled on the next game start or MCP connection. To manually reinstall: `node bin/cookie.js --setup-hooks`

To remove the hooks, edit `~/.claude/settings.json` and delete the `UserPromptSubmit` and `Stop` entries.

---

### Playing Through Claude

Once connected, talk to Claude naturally. Claude calls the game tools behind the scenes.

**Every interaction earns crumbs automatically.** Tool calls auto-click the cookie. Cookie mining hooks (auto-installed on first run) ensure even plain conversation mines crumbs. Just use Claude normally and watch your crumbs grow.

**Things you can say:**

- "Show me the tavern" -- browse available recruits (and earn crumbs)
- "Recruit the first hero" -- hire a team member (and earn crumbs)
- "Explore dungeon level 1" -- send your team into a dungeon (and earn crumbs)
- "What's my status?" -- see team, crumbs, progress (and earn crumbs)
- "Check for pending actions" -- handle boss fights and loot (and earn crumbs)
- "Roll a d20" -- roll the dice (and earn crumbs)
- "Scan this code for security issues: ..." -- use the security scanner (and earn crumbs)
- "Click the cookie" -- deliberate power-click for 3x crumbs

#### All Available Tools

| Tool | What it does |
|------|-------------|
| `cookie_click` | **Power-click** the cookie for 3x bonus crumbs (on top of the auto-click you get from every interaction) |
| `cookie_status` | See your team, crumbs, and dungeon progress |
| `cookie_explore` | Enter a dungeon (auto-advances every 15 seconds) |
| `cookie_tavern` | View and recruit team members |
| `cookie_equip` | Equip items to your team |
| `cookie_pending` | Handle boss fights and loot decisions |
| `cookie_dungeon_config` | Change auto-advance speed |
| `cookie_inventory` | View your items |
| `cookie_save` / `cookie_load` | Save and load your game (3 slots) |
| `cookie_talisman` | View, upgrade, or salvage talisman |
| `cookie_scores` | View high scores |
| `cookie_roll` | Roll a d20 |
| `cookie_leaderboard` | View the community leaderboard |
| `cookie_submit_score` | Submit your score to the leaderboard |
| `cookie_help` | List all available commands |
| `security_scan` | Scan code for vulnerabilities |
| `vault_store` / `vault_retrieve` | Store and retrieve secrets |

#### Example: Your First Game via Claude

Just tell Claude:

```
"Start a Terminal Cookie game for me -- recruit a hero and explore a dungeon"
```

Or do it step by step:

```
1. Use cookie_tavern to show me the recruits
2. Recruit the first hero
3. Explore dungeon level 1
4. Check my status
5. Handle any pending boss fights
```

---

### Multi-Terminal Mining

Connect Terminal Cookie from **multiple Claude sessions at the same time** to mine crumbs faster. Each additional terminal connection boosts your cookie click output:

| Terminals connected | Mining multiplier |
|--------------------|-------------------|
| 1 | x1.0 (normal) |
| 2 | x1.5 |
| 3 | x2.0 |
| 4 | x2.5 |
| 5+ | x3.0 (max) |

**How it works:**

- Each MCP server instance registers itself as an active session
- Sessions are shared via a local file -- no network required
- Inactive sessions expire after 60 seconds automatically
- The bonus applies to `cookie_click` crumb rewards
- You can see your active terminal count in the status line

**Example:** Open 3 Claude Code windows, each with Terminal Cookie connected. Clicking the cookie in any of them earns double crumbs (x2.0). The more terminals you have open and actively making tool calls, the faster you mine.

This works across Claude Code sessions, Claude Desktop, or any mix of both.

---

### Playing Both at Once (Same Terminal Game + Claude)

You can run the terminal game (`npm start`) and have Claude connected via MCP **at the same time**. They share a live state file and sync automatically:

- **Crumbs earned through Claude** show up in your terminal game within 1 second
- **Heroes recruited in-game** are available to Claude immediately
- **Dungeon progress** syncs both ways -- start a dungeon in-game, check it via Claude, or vice versa

**How to do it:**

1. Open a terminal and run `npm start` to play the game
2. In a separate terminal (or Claude Desktop), connect Claude to the MCP server as usual
3. Play in both places -- state syncs automatically via `saves/live.json`

No extra setup needed. The live sync starts automatically when either the game or MCP server runs.

---

### How Passive Mode Works (MCP / Claude)

- Every **15 seconds**, your dungeon auto-advances one room
- Regular monsters are **fought automatically** by your team
- **Boss fights pause** the dungeon and wait for your decision
- **Every MCP tool call** earns crumbs automatically (auto cookie click)
- Crumbs are only earned through AI interactions — no passive crumb generation
- Use `cookie_dungeon_config tick_interval=5` to speed it up (5 seconds per room)
- Use `cookie_dungeon_config tick_interval=60` to slow it down (60 seconds per room)

---

## Settings

Open settings in-game by pressing `S` from the Tavern. Use `Up`/`Down` to navigate, `Enter` to toggle.

### Focus Settings

| Setting      | What it does              | Game Bonus          |
|--------------|---------------------------|---------------------|
| Auto-Focus   | Auto-focus terminal       | +15% crumbs         |
| Terminal Bell | Bell sound on events     | +5% loot find       |
| Always On Top | Keep window on top       | +10% XP             |
| *All three*  | --                        | "Cookie Guardian" title |

### Security Settings

| Setting             | What it does                  | Game Bonus          |
|---------------------|-------------------------------|---------------------|
| Enable Vault        | Encrypted secret storage      | +10% crumbs         |
| Auto-Redact         | Hide secrets in output        | +5% loot find       |
| Encrypted Clipboard | Encrypt clipboard             | +5% XP              |
| *All three*         | --                            | "Security Master" title |

### Game Settings

| Setting          | Default | What it does                                    |
|------------------|---------|------------------------------------------------|
| Auto-Dungeon     | ON      | Auto-play dungeons, combat, loot, death recovery |
| Auto-Recruit     | ON      | Buy all affordable recruits automatically        |
| Recruit Sort     | totalStats | Sort recruits by: totalStats, atk, def, hp, spd, lck, primary, efficiency |
| Auto-Equip       | ON      | Equip best gear from inventory to team every 3s  |
| Equip Strategy   | power   | How to rank gear: power, rarity, primaryStat, teamNeed, value |
| Auto-Shop        | ON      | Buy heal potions, combat buffs, enchant scrolls  |
| Shop Budget %    | 10%     | Max % of crumbs to spend on shop per tick (5-50%) |
| Auto-Talisman    | ON      | Auto-upgrade talisman when affordable            |
| Talisman Budget %| 10%     | Max % of crumbs for talisman upgrade per tick (5-50%) |
| Color-Blind Mode | OFF     | Accessible colors (+2% loot find)                |
| Compact Mode     | OFF     | Smaller UI for small terminal windows            |
| Show AI Status   | ON      | Show AI connection badge                         |
| Show Token Usage | OFF     | Show token usage counter (total/daily/monthly)   |
| Debug Logging    | OFF     | Save debug info to a file                        |

---

## Dungeon Biomes

| Biome               | Enemies                                           |
|----------------------|---------------------------------------------------|
| Darkstone Caverns    | Bat, Spider, Slime, Troll, Dragon                 |
| Forgotten Catacombs  | Skeleton, Ghost, Zombie, Lich, Wraith             |
| Whispering Wilds     | Wolf, Bear, Treant, Bandit, Fairy                 |
| Cinderforge Caldera  | Imp, Magma Golem, Fire Serpent, Demon, Phoenix    |
| The Crumbling Abyss  | Shadow, Tentacle, Void Walker, Eldritch, Cookie Monster |

---

## Village System

Once you have **9 or more alive team members**, you can found a village from the Village tab (`V`). The village persists even if your team drops below 9, but building and upgrading requires 9+ alive members.

### Buildings

| Building        | Bonus per Level                                    |
|-----------------|----------------------------------------------------|
| Bakery          | +1/2/3 crumbs per dungeon room                    |
| Forge           | 10%/20%/30% enchant cost discount                 |
| Watchtower      | +1/2/3 team DEF, scout intel                       |
| Herbalist       | +1/2/3 HP healed per room, poison resistance       |
| Training Ground | +10%/20%/30% XP, +1/2/3 recruit stat bonus         |
| Merchant Guild  | +10%/20%/30% sell price, +1/2/3 shop items          |
| Archive         | +1/2/3 team ATK, loot quality, intel bonus         |

Each building has 3 upgrade levels with escalating crumb costs.

---

## Talisman

A persistent artifact that grows stronger over 10 upgrade levels. Talisman bonuses **survive death** — even if your entire team wipes, your talisman keeps its level.

Bonuses include crumb multiplier, combat stats, regen, loot quality, and death consolation rewards. Upgrade via the Talisman tab (`T`) in the tavern.

---

## Trophies

50 trophies across 9 categories (Boss, Combat, Death, Level, Loot, Progression, Crumbs, Time, Shop). View them in the Trophies tab (`Y`) in the tavern. The left panel shows all trophies with scroll support, the right panel shows only your unlocked trophies. Some trophies are earned through gameplay milestones, others can be bought with crumbs (1M/5M/25M/100M).

---

## Combat Visuals

Combat features animated visuals including:
- Enemy ASCII art with idle, attack, and hurt animation frames
- Attack effect particles (slash, magic, crit, fumble, arrow, heal)
- Floating damage numbers that rise and fade
- Hit flash effects on impact
- Live color-coded battle feed with HP changes

---

## Dungeon Exploration Visuals

Dungeon rooms feature:
- 2000+ unique ASCII environment art pieces across 5 biomes x 11 room types
- Room reveal animations when entering new rooms
- Weather overlays that change every 5 seconds per biome
- Atmospheric decorations below the dungeon map
- Story event animations triggered by new log entries

---

## Loot & Victory Animations

- **Loot rain**: Items fall from the top of the screen with staggered reveals
- **Source labels**: Items tagged with origin -- [BOSS DROP], [MINIBOSS], [TREASURE]
- **Best item showcase**: Highest-rarity item highlighted with pulsing effect
- **Victory confetti**: 30 animated particles on dungeon clear
- **Stat counting**: Crumbs/rooms/monsters count up with ease-out animation
- **Boss slain banner**: Animated banner when boss is defeated
- **Defeat effects**: R.I.P. tombstone fade-in, death penalty shake, fallen ally names

Press Enter/Space/Escape to skip any animation.

---

## Permanent Death

Fallen team members are **permanently removed** after combat victory. Their equipped gear is returned to your inventory. Track permanent losses in the death screen stats. This makes team composition and equipment management critical.

---

## Community Leaderboard

Compare your scores with other players through a git-native leaderboard system. No accounts, no servers — just git.

<!-- LEADERBOARD:START -->
| # | Player | Org | Dungeons | Level | Clicks | Crumbs |
|---|--------|-----|----------|-------|--------|--------|
| | *No scores yet — be the first!* | | | | | |
<!-- LEADERBOARD:END -->

> Leaderboard auto-updates when the repo owner runs `node bin/cookie.js --update-readme` after merging submissions.

### View the Leaderboard

Three ways to see the leaderboard:

1. **Start screen** — top 5 scores show automatically on the main menu
2. **Terminal:** `node bin/cookie.js --leaderboard`
3. **Via Claude:** call the `cookie_leaderboard` MCP tool

Press `L` on the main menu for a detailed leaderboard overlay.

### Submit as an Individual

```bash
node bin/cookie.js --submit-score
```

When prompted, enter your display name and press Enter to skip the organization field. Your entry appears on the leaderboard as just your name.

**Via Claude:** `cookie_submit_score` with `name: "YourName"`

### Submit as Part of an Organization

Same command:

```bash
node bin/cookie.js --submit-score
```

Enter your display name, then enter your org/team/company name when prompted. Your entry appears as `YourName [YourOrg]` on the leaderboard — great for team competitions and company leaderboards.

**Via Claude:** `cookie_submit_score` with `name: "YourName"` and `org: "YourOrg"`

### What Happens After Submitting

1. A submission file is created in `data/submissions/`
2. A git branch `leaderboard/submit-<id>` is created and committed
3. Push the branch and open a PR:
   ```bash
   git push -u origin leaderboard/submit-<id>
   gh pr create --title "Leaderboard submission" --body "Score submission"
   ```
4. The repo owner reviews and merges your PR
5. Your score appears on the leaderboard after the owner runs `--merge-leaderboard`

### Merge Submissions (Repo Owner)

After merging score PRs:

```bash
node bin/cookie.js --merge-leaderboard
```

This reads all files in `data/submissions/`, validates them (including anti-cheat plausibility checks and checksum verification), appends to `data/leaderboard.json`, deletes processed files, and commits.

### Privacy

**Shared in submissions:** display name you choose, optional org, game stats (clicks, crumbs, dungeons, etc.), timestamp, integrity checksum.

**Never shared:** save files, vault contents, settings, real identity (unless you choose it as display name). The `saves/` directory stays gitignored.

---

## CLI Options

```
terminal-cookie [options]

Options:
  --debug             Save debug logs to ~/.terminal-cookie/debug.log
  --mcp               Start as MCP server (for Claude AI integration)
  --setup-hooks       Install Claude Code hooks for auto cookie mining
  --mine              Mine crumbs silently (used by hooks internally)
  --reset             Delete all save data and start fresh
  --leaderboard       Show the community leaderboard
  --submit-score      Submit your score to the leaderboard via git
  --merge-leaderboard Merge approved submissions into the leaderboard (repo owner)
  --update-readme     Update README.md leaderboard table from data (repo owner)
  --version           Print version number
  --help              Show help message
```

---

## Troubleshooting

### "Terminal window is too small"

Make your terminal window bigger. The game needs at least **60 columns wide** and **20 rows tall**. Try maximizing your terminal window.

### The game looks broken or garbled

Your terminal might not support color. Try a different terminal app:
- **macOS:** Use Terminal.app or iTerm2
- **Windows:** Use Windows Terminal (not the old cmd.exe)
- **Linux:** Most modern terminals work fine

### How do I reset everything and start over?

```bash
node bin/cookie.js --reset
```

This deletes all save data. Press Enter to confirm.

### Can I play the terminal game and use Claude mode at the same time?

Yes! They share a live state file and sync automatically:

- **Window 1:** Run `npm start` to play the game
- **Window 2:** Use Claude (Code or Desktop) with the MCP server

Crumbs, team, inventory, and dungeon progress sync between both within 1 second. Recruit a hero in-game and Claude sees it. Claude clicks cookies and your terminal game crumb counter goes up.

### My team died. What do I do?

Go back to the Tavern and recruit new team members. After a team wipe you get a discount on new recruits! You can also re-enter the same dungeon within 3 runs to recover lost gear.

Note: allies who fall in combat are **permanently dead** — their equipped gear is returned to your inventory, but they're gone forever. Your talisman may salvage some items on a full wipe.

---

## FAQ

### Can I use Terminal Cookie in multiple projects?

Yes. Add it to your user-level settings (`~/.claude/settings.json`) instead of project-level, and it will be available everywhere.

### Does it slow down Claude?

No. The game status is only shown in `cookie_*` tool responses. Other tools like `security_scan` return clean output. The background auto-advance (every 15 seconds) is lightweight.

### Can I play in both terminal and Claude mode with the same save?

The save format is shared, but the MCP server uses its own autosave file (`saves/autosave.json`) to avoid overwriting your manual saves. Use `cookie_save slot=1` and `cookie_load slot=1` to manage saves explicitly.

---

## Requirements

- **Node.js 18 or newer** -- download from https://nodejs.org
- **Terminal** at least 60 columns wide and 20 rows tall
- **macOS, Windows, or Linux**

## License

MIT
