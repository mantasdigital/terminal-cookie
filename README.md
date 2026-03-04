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
git clone https://github.com/user/terminal-cookie && cd terminal-cookie && npm install && npm start
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

Start as an MCP server:

```bash
node bin/cookie.js --mcp
```

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "terminal-cookie": {
      "command": "node",
      "args": ["/path/to/terminal-cookie/bin/cookie.js", "--mcp"]
    }
  }
}
```

The MCP server exposes tools for:
- Game state queries and actions
- Security scanning and vault operations
- Cookie economy management

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

## Screenshots

*Coming soon.*

## Requirements

- Node.js >= 18.0.0
- Terminal with at least 60 columns x 20 rows
- macOS, Windows, or Linux

## License

MIT
