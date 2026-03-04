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

**That's it -- you're playing the terminal version!**

> **Tip:** To quit the game at any time, press `Q` on the main menu or `Ctrl+C` anywhere.

### Step 5: Connect to Claude (optional but recommended)

Terminal Cookie can also be played through Claude AI. Claude clicks cookies, recruits heroes, and explores dungeons for you -- with unique reactions every time.

Run this command to register the game as a Claude tool (paste your actual path from Step 2):

```bash
claude mcp add terminal-cookie -- node /YOUR/PATH/HERE/bin/cookie.js --mcp
```

Then open Claude Code and say `"Click the cookie"` to start playing through AI.

> **Want the full setup guide?** See [Playing with Claude AI](#playing-with-claude-ai) below for detailed instructions, Claude Desktop setup, troubleshooting, and the multi-terminal mining bonus.

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

### Playing Through Claude

Once connected, talk to Claude naturally. Claude calls the game tools behind the scenes.

**Every interaction earns crumbs automatically.** You don't need to tell Claude to "click the cookie" -- every tool call, every accepted choice, every response already mines crumbs in the background. Each interaction gives you a cookie reaction and crumb reward. Just use Claude normally and watch your crumbs grow.

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
| `cookie_scores` | View high scores |
| `cookie_roll` | Roll a d20 |
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
