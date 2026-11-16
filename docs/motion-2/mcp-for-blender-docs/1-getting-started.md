Get Started

# Get Started with MCP for Blender in 3 Steps

Install MCP for Blender with one command and make your first AI-driven Blender request in minutes.

MCP for Blender lets you control Blender with natural language prompts via Claude or any MCP-compatible AI client. This guide gets you from zero to your first AI-generated 3D scene.

**Prerequisites:** Blender 3.0 or newer and an MCP client such as Claude Desktop, Claude Code, Codex, or Cursor.

## [Install with one command](https://www.mcp-for-blender.com/docs/quickstart#install-with-one-command)

Run this in a terminal. It sets up your AI apps and the Blender addon:

macOS/LinuxWindows

```bash
curl -LsSf https://www.mcp-for-blender.com/install.sh | sh
```

Copy

```powershell
irm https://www.mcp-for-blender.com/install.ps1 | iex
```

Copy

Prefer not to run a script, or Windows Defender blocked it? Install uv with winget, open a new terminal, then run setup:

```powershell
winget install --id=astral-sh.uv -e
uvx mcp-for-blender setup
```

Copy

It installs [uv](https://docs.astral.sh/uv/) if needed, finds the MCP clients on your machine (Claude Desktop, Claude Code, Codex, Cursor, VS Code, Devin Desktop/Windsurf, OpenCode, Antigravity), and lets you pick which to set up. Then it installs and enables the Blender addon. Existing config is kept: it only adds a `blender` entry and saves a `.bak` of each file it changes.

Already have uv? Run `uvx mcp-for-blender setup` instead.

## [Finish setup](https://www.mcp-for-blender.com/docs/quickstart#finish-setup)

1.  ### Restart your AI app
    
    Fully quit and reopen it so it loads the new server. On macOS use **Cmd+Q**; on Windows, quit from the system tray.
    
2.  ### Open Blender
    
    The addon starts its server when Blender opens. To check, press **N** in the 3D viewport and open the **MCP for Blender** tab.
    

Prefer to set things up by hand, or using a client the installer doesn't know? See [Manual Setup](https://www.mcp-for-blender.com/docs/installation#manual-setup), which has a video walkthrough, and [MCP Clients](https://www.mcp-for-blender.com/docs/mcp-clients). Using Codex? Add the [Codex plugin](https://www.mcp-for-blender.com/docs/codex-plugin) for an inline viewport and asset pickers.

Only run one instance of the MCP server at a time. Do not run it simultaneously in both Cursor and Claude Desktop, for example.

## [Your first prompt](https://www.mcp-for-blender.com/docs/quickstart#your-first-prompt)

Open your MCP client and try one of these prompts to see MCP for Blender in action:

-   "Create a low poly dungeon scene with a dragon guarding a pot of gold"
-   "Create a beach scene using HDRIs, textures, and vegetation from Poly Haven"
-   "Create a sphere and place it above the cube"

The AI translates your request into Blender commands and builds the scene in real time.

The `execute_blender_code` tool runs arbitrary Python inside Blender. Save your work before using AI-generated code, especially in complex scenes.

## [](https://www.mcp-for-blender.com/docs/quickstart#next-steps)