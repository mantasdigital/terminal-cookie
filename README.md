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

A terminal-based cookie dungeon crawler that doubles as an AI security monitor and Model Context Protocol (MCP) server. Click cookies, recruit adventurers, explore procedurally generated dungeons, and scan code for security vulnerabilities -- all from your terminal.

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

**That's it -- you're playing!**

> **Tip:** To quit the game at any time, press `Q` on the main menu or `Ctrl+C` anywhere.

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
2. **You arrive at the Tavern.** This is your home base.
3. **Click cookies** -- press `C` or `Space` to earn crumbs (the in-game currency)
4. **Recruit a hero** -- press `R` to see available recruits, use `Up`/`Down` arrows to pick one, press `Enter` to hire them
5. **Enter the dungeon** -- press `E` to send your team into a dungeon
6. **Fight enemies** -- when combat starts, press `Space` or `Enter` to stop the roll bar. Higher rolls = more damage!
7. **Collect loot** -- after defeating enemies, choose to `E`quip, `S`ell, or `D`iscard items
8. **Repeat!** -- recruit more heroes, go deeper into dungeons, get stronger

### All Controls

#### Tavern (Home Base)

| Key         | What it does                    |
|-------------|----------------------------------|
| `C` or `Space` | Click cookie to earn crumbs  |
| `R`         | Switch to Recruit tab            |
| `I`         | Switch to Inventory tab          |
| `Left`/`Right` | Switch between tabs          |
| `Up`/`Down` | Browse list items                |
| `Enter`     | Recruit the selected hero        |
| `E`         | Enter the dungeon                |
| `S`         | Open settings                    |
| `Escape`    | Back to main menu                |
| `?`         | Show help overlay                |

#### Dungeon

| Key         | What it does                    |
|-------------|----------------------------------|
| `Up`/`Down` | Choose path at a fork            |
| `Enter`     | Interact with current room       |
| `Escape`    | Retreat back to tavern           |
| `?`         | Show help overlay                |

#### Combat

| Key         | What it does                    |
|-------------|----------------------------------|
| `Space` or `Enter` | Stop the roll bar (attack!) |
| `A`         | Auto-attack                      |
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

---

## Using Terminal Cookie with Claude AI (MCP Server)

Terminal Cookie can also run as a background game inside Claude. While you chat with Claude, dungeons auto-progress, monsters get fought, and loot piles up -- all without interrupting your work.

**Important:** The terminal game (`npm start`) and the Claude AI mode are **separate**. They cannot run in the same terminal window at the same time. Use one or the other, or run them in different terminal windows.

### Option A: Add to Claude Code (Quickest Way)

If you already have Claude Code open, run this command **in a separate terminal window** (not inside Claude Code):

```bash
claude mcp add terminal-cookie -- node /FULL/PATH/TO/terminal-cookie/bin/cookie.js --mcp
```

**Replace `/FULL/PATH/TO/` with the actual path to where you downloaded the game.** For example, if you downloaded it to your Downloads folder on macOS:

```bash
claude mcp add terminal-cookie -- node /Users/yourname/Downloads/terminal-cookie/bin/cookie.js --mcp
```

To find your full path, go to the terminal-cookie folder and run:

```bash
pwd
```

Copy the output and use it in the command above.

### Option B: Add from Inside Claude Code

While in a Claude Code session, type:

```
/mcp add terminal-cookie -- node /FULL/PATH/TO/terminal-cookie/bin/cookie.js --mcp
```

### Option C: Make It Permanent (Always Available)

Add this to your Claude settings file so Terminal Cookie is available every time you open Claude Code.

**For one project only** -- create or edit `.claude/settings.json` in your project folder:

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

**For all projects** -- edit `~/.claude/settings.json` (in your home folder):

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

### Option D: Claude Desktop App

Edit your Claude Desktop config file (`claude_desktop_config.json`):

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

### Verify It Works

Inside Claude Code, type:

```
/mcp
```

You should see `terminal-cookie` listed with 19 tools. If it shows up, you're connected!

### Playing Through Claude

Once connected, just ask Claude to interact with the game. Claude has access to these tools:

| Tool | What it does |
|------|-------------|
| `cookie_click` | Click the cookie for crumbs |
| `cookie_status` | See your team, crumbs, and dungeon progress |
| `cookie_explore` | Enter a dungeon (auto-advances every 15 seconds) |
| `cookie_tavern` | View and recruit team members |
| `cookie_equip` | Equip items to your team |
| `cookie_pending` | Handle boss fights and loot decisions |
| `cookie_dungeon_config` | Change auto-advance speed |
| `cookie_inventory` | View your items |
| `cookie_save` / `cookie_load` | Save and load your game (3 slots) |
| `cookie_scores` | View high scores |
| `cookie_roll` | Roll a d20 |
| `cookie_help` | List all available commands |
| `security_scan` | Scan code for vulnerabilities |
| `vault_store` / `vault_retrieve` | Store and retrieve secrets |

#### Example: Your First Game via Claude

Just tell Claude something like:

```
"Start a Terminal Cookie game for me -- recruit a hero and explore a dungeon"
```

Or do it step by step:

```
1. Use cookie_tavern to show me the recruits
2. Use cookie_tavern with action=recruit and index=0 to hire the first one
3. Use cookie_explore to enter a dungeon
4. Use cookie_status to check progress
5. Use cookie_pending to handle any boss fights
```

### How Passive Mode Works

- Every **15 seconds**, your dungeon auto-advances one room
- Regular monsters are **fought automatically** by your team
- **Boss fights pause** the dungeon and wait for your decision
- **Every tool call** you make earns +1 bonus crumb
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

| Setting          | What it does                            |
|------------------|-----------------------------------------|
| Color-Blind Mode | Accessible colors (+2% loot find)      |
| Compact Mode     | Smaller UI for small terminal windows  |
| Debug Logging    | Save debug info to a file              |

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

## CLI Options

```
terminal-cookie [options]

Options:
  --debug       Save debug logs to ~/.terminal-cookie/debug.log
  --mcp         Start as MCP server (for Claude AI integration)
  --reset       Delete all save data and start fresh
  --version     Print version number
  --help        Show help message
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

Yes, but in **separate terminal windows**:

- **Window 1:** Run `npm start` to play the game
- **Window 2:** The MCP server runs as a separate process through Claude

They use separate save files so they don't interfere with each other.

### My team died. What do I do?

Go back to the Tavern and recruit new team members. After a team wipe you get a discount on new recruits! You can also re-enter the same dungeon within 3 runs to recover lost gear.

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
