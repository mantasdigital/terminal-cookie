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

## Quick Start

```bash
git clone https://github.com/mantasdigital/terminal-cookie && cd terminal-cookie && npm install && npm start
```

Or run directly:

```bash
npx terminal-cookie
```

Development mode (with debug logging):

```bash
npm run dev
```

## Features

- **Cookie Dungeon Game** -- Click-based RPG with procedurally generated dungeons, 5 biomes, combat, loot, and progression
- **AI Security Monitor** -- Real-time code scanning for secrets, injection vulnerabilities, and data exfiltration patterns
- **MCP Server** -- Expose game state, security tools, and cookie economy as Model Context Protocol tools for AI assistants
- **Focus System** -- Auto-focus, always-on-top, and notification support across macOS, Windows, and Linux
- **Cross-Platform** -- Works in any terminal that supports ANSI escape codes (truecolor, 256-color, 16-color, and monochrome fallback)

## How to Play

1. **Start the game** with `npm start`
2. **Click cookies** to earn crumbs (the in-game currency)
3. **Recruit adventurers** at the Tavern using your crumbs
4. **Explore dungeons** -- navigate procedurally generated rooms across 5 biomes
5. **Fight enemies** -- turn-based combat with dice rolls and special abilities
6. **Collect loot** -- equip gear, find rare items, unlock achievements
7. **Enable security features** -- scan code, manage a vault, earn game bonuses

## MCP Server Setup

Terminal Cookie runs as a passive game inside your AI chat. Dungeons progress in the background while you work -- every tool call earns crumbs.

### Claude Code (CLI) -- Add Mid-Session

You can add Terminal Cookie to a running Claude Code session without restarting:

```bash
claude mcp add terminal-cookie node /path/to/terminal-cookie/src/mcp/server.js
```

Or from inside Claude Code, use the `/mcp` command:

```
/mcp add terminal-cookie node /path/to/terminal-cookie/src/mcp/server.js
```

This takes effect immediately. Claude can start calling `cookie_*` tools right away.

### Claude Code -- Persistent Setup

To have Terminal Cookie available in every Claude Code session, add it to your settings:

**Project-level** (`.claude/settings.json` in your repo):

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/path/to/terminal-cookie/src/mcp/server.js"]
    }
  }
}
```

**User-level** (`~/.claude/settings.json` -- available in all projects):

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/path/to/terminal-cookie/src/mcp/server.js"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/path/to/terminal-cookie/src/mcp/server.js"]
    }
  }
}
```

### Alternative: Via CLI Entry Point

You can also use the main binary with `--mcp`:

```bash
node bin/cookie.js --mcp
```

### MCP Tools

The MCP server exposes 19 tools:

| Tool | Description |
|------|-------------|
| `cookie_click` | Click cookie for crumbs |
| `cookie_status` | View team, crumbs, dungeon state |
| `cookie_explore` | Enter a dungeon (auto-advances in background) |
| `cookie_tavern` | Recruit team members |
| `cookie_equip` | Equip items to team |
| `cookie_pending` | View/resolve pending actions (boss fights, loot) |
| `cookie_dungeon_config` | Configure tick speed, auto-loot, auto-sell |
| `cookie_intercept` | Filter prompt text for crumbs |
| `cookie_roll` | Roll a d20 |
| `cookie_inventory` | View loot and equipment |
| `cookie_save` / `cookie_load` | Save/load game (slots 1-3) |
| `cookie_scores` | View high scores |
| `cookie_respond` | Answer an AI prompt for crumbs |
| `cookie_trash` | Destroy a cookie |
| `cookie_help` | List all commands |
| `security_scan` | Scan code for vulnerabilities |
| `vault_store` / `vault_retrieve` | Encrypted secret vault |

## Passive Mode (How It Works)

When running as an MCP server, Terminal Cookie operates as a **passive game**:

1. **Background ticks** -- Every 15 seconds (configurable), the dungeon auto-advances one room
2. **Auto-combat** -- Regular monsters are fought automatically using your team's stats
3. **Boss fights pause** -- Boss encounters queue as pending actions for your decision
4. **Every tool call = progress** -- Each MCP tool interaction awards +1 passive crumb
5. **Status line** -- Every `cookie_*` tool response includes a status bar showing crumbs, team, and dungeon progress

### Quick Start Flow

```
1. cookie_tavern                    -- View recruits
2. cookie_tavern action=recruit index=1  -- Hire someone
3. cookie_explore dungeon_level=1   -- Enter dungeon (auto-runs in background)
4. ... keep chatting with Claude ...
5. cookie_status                    -- Check what happened
6. cookie_pending                   -- Resolve any boss fights or loot choices
```

## Controls

### Menu / Navigation

| Key       | Action              |
|-----------|---------------------|
| `Arrow keys` | Navigate menus   |
| `Enter`   | Select / Confirm    |
| `Escape`  | Back / Cancel       |
| `q`       | Quit (from menu)    |
| `?`       | Help screen         |

### Game

| Key       | Action              |
|-----------|---------------------|
| `Space`   | Click cookie        |
| `1-5`     | Select party member  |
| `e`       | Explore / Enter     |
| `f`       | Fight               |
| `r`       | Run / Flee          |
| `i`       | Inventory           |
| `s`       | Settings            |

## Settings

Settings are stored at `~/.terminal-cookie/settings.json`.

### Focus Settings

| Setting      | Effect                    | Game Bonus         |
|--------------|---------------------------|--------------------|
| `autoFocus`  | Auto-focus terminal       | +15% crumbs        |
| `bell`       | Terminal bell on events   | +5% loot find      |
| `stickyTop`  | Always-on-top window      | +10% XP            |
| All three    | --                        | "Cookie Guardian" title |

### Security Settings

| Setting             | Effect                     | Game Bonus         |
|---------------------|----------------------------|--------------------|
| `vaultEnabled`      | Encrypted secret vault     | +10% crumbs        |
| `autoRedact`        | Auto-redact secrets in output | +5% loot find   |
| `encryptedClipboard`| Encrypt clipboard contents | +5% XP             |
| All three           | --                         | "Security Master" title |

### Game Settings

| Setting          | Effect                           |
|------------------|----------------------------------|
| `colorBlindMode` | Accessible color palette (+2% loot) |
| `compactMode`    | Reduced UI for small terminals   |
| `debugLogging`   | Write debug logs to file         |

## CLI Options

```
terminal-cookie [options]

Options:
  --debug       Enable debug logging to ~/.terminal-cookie/debug.log
  --mcp         Start as MCP server on stdio
  --reset       Delete all save data
  --version     Print version and exit
  --help        Show help message
```

## Biomes

| Biome               | Enemies                                    | Curses              |
|----------------------|--------------------------------------------|---------------------|
| Darkstone Caverns    | Bat, Spider, Slime, Troll, Dragon          | Darkness, Poison Air|
| Forgotten Catacombs  | Skeleton, Ghost, Zombie, Lich, Wraith      | Silence, Darkness   |
| Whispering Wilds     | Wolf, Bear, Treant, Bandit, Fairy          | Thorns, Fog         |
| Cinderforge Caldera  | Imp, Magma Golem, Fire Serpent, Demon, Phoenix | Heat, Tremors   |
| The Crumbling Abyss  | Shadow, Tentacle, Void Walker, Eldritch, Cookie Monster | Gravity, Madness |

## FAQ

### How do I add Terminal Cookie to Claude Code after it's already running?

Run this in your terminal (not inside Claude Code):

```bash
claude mcp add terminal-cookie node /absolute/path/to/terminal-cookie/src/mcp/server.js
```

Or from inside a Claude Code session, type:

```
/mcp add terminal-cookie node /absolute/path/to/terminal-cookie/src/mcp/server.js
```

The MCP server starts immediately. No restart needed. Claude can call `cookie_click` right away.

### How do I check if Terminal Cookie is connected?

Inside Claude Code:

```
/mcp
```

This lists all connected MCP servers and their status. You should see `terminal-cookie` with 19 tools.

### How do I remove it mid-session?

```
/mcp remove terminal-cookie
```

### Does it affect Claude's performance?

No. The game status line is only appended to `cookie_*` tool responses. Non-game tools (`security_scan`, `vault_*`) return clean responses with no game noise. The background tick (every 15s) is lightweight and doesn't block tool calls.

### Can I use it in multiple projects?

Yes. Add it to your user-level settings (`~/.claude/settings.json`) instead of project-level, and it'll be available everywhere.

### My team died. What do I do?

Visit the tavern to recruit new members:

```
cookie_tavern                          -- View available recruits
cookie_click                           -- Click for crumbs if you're broke
cookie_tavern action=recruit index=1   -- Hire a recruit
```

### How do I speed up or slow down dungeon progression?

```
cookie_dungeon_config tick_interval=5    -- 5 seconds between rooms (fast)
cookie_dungeon_config tick_interval=60   -- 60 seconds between rooms (slow)
```

### What are pending actions?

When the passive runner encounters a boss fight or loot that needs a decision, it queues a **pending action**. The dungeon pauses until you resolve it:

```
cookie_pending                                    -- List pending actions
cookie_pending action_id=pa_3 choice=fight        -- Fight the boss
cookie_pending action_id=pa_3 choice=retreat       -- Run away
cookie_pending action_id=pa_5 choice=take_all      -- Take all loot
cookie_pending action_id=pa_5 choice=sell_all      -- Sell loot for crumbs
```

### Does the terminal game (`npm start`) still work?

Yes. Terminal mode is completely unchanged. The new passive fields in save files are simply ignored by the terminal renderer. Both modes share the same save format.

### Can I play in both modes with the same save?

The save format is shared, but the MCP server uses its own autosave file (`saves/autosave.json`) to avoid overwriting your manual saves. Use `cookie_save slot=1` and `cookie_load slot=1` to manage saves explicitly.

## Screenshots

*Coming soon.*

## Requirements

- Node.js >= 18.0.0
- Terminal with at least 60 columns x 20 rows
- macOS, Windows, or Linux

## License

MIT
