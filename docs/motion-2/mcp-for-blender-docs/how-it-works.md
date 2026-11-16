Core Concepts

# How MCP for Blender Works: Architecture and Protocol

MCP for Blender uses two components — a Blender addon and a Python MCP server — communicating over a TCP socket with a JSON protocol.

MCP for Blender bridges your AI client and Blender through two cooperating components. Understanding the architecture helps you diagnose connection issues and reason about what is and is not possible.

## [Two Components](https://www.mcp-for-blender.com/docs/concepts/how-it-works#two-components)

MCP for Blender is made up of two parts that work together:

Blender Addon

Runs inside Blender as a socket server on `localhost:9876`. It receives JSON commands and executes them directly in Blender using the Blender Python API (`bpy`).

MCP Server

A Python process that implements the Model Context Protocol. It connects to the Blender addon and exposes Blender tools to your AI client.

## [Communication Flow](https://www.mcp-for-blender.com/docs/concepts/how-it-works#communication-flow)

When you send a prompt, the request flows through the system in this order:

1.  The AI client calls a tool on the MCP server.
2.  The MCP server sends a JSON command over TCP to the Blender addon.
3.  The addon executes Blender Python (`bpy`) inside the running Blender instance.
4.  The addon returns the result back to the MCP server.
5.  The MCP server forwards the result back to the AI client.

This happens transparently in real time while Blender is running with a GUI.

## [Communication Protocol](https://www.mcp-for-blender.com/docs/concepts/how-it-works#communication-protocol)

Commands and responses are exchanged as JSON objects over a TCP socket.

The default socket address is `localhost:9876`. You can change this with the `BLENDER_HOST` and `BLENDER_PORT` environment variables.

A command is a JSON object with a `type` and `params`:

```json
{
  "type": "get_scene_info",
  "params": {}
}
```

Copy

A response is a JSON object with a `status` and either a `result` or `message`:

```json
{
  "status": "success",
  "result": { ... }
}
```

Copy

All operations time out after 180 seconds. Long-running tasks may need to be split into smaller steps.

## [Tool Execution Flow](https://www.mcp-for-blender.com/docs/concepts/how-it-works#tool-execution-flow)

Most of the work happens through `execute_blender_code`, which sends Python written by the AI straight to Blender. This gives unlimited flexibility, but also full access to the Blender environment, including the file system.

The other tools cover what Python can't do on its own: `look` captures images of the scene, `get_scene_info` returns a compact summary, `generate_3d`, `search_assets` and `import_asset` bring in models and textures from outside services, and `get_guide` loads workflow know-how. See the [Tools overview](https://www.mcp-for-blender.com/docs/tools/overview).

## [Security Model](https://www.mcp-for-blender.com/docs/concepts/how-it-works#security-model)

`execute_blender_code` runs arbitrary Python inside Blender. Always save your work before using this tool.

MCP for Blender is designed for local use. The addon listens on `localhost` only, which means it is not reachable from other machines by default. The socket has no authentication or encryption, so anyone who can reach the port can run Python inside Blender. Do not expose port `9876` publicly or run MCP for Blender on an untrusted network; to reach a remote Blender, prefer an SSH tunnel over pointing `BLENDER_HOST` at it directly.

To restrict what `execute_blender_code` can do, enable [safe mode](https://www.mcp-for-blender.com/docs/reference/configuration#safe-mode) with `BLENDER_MCP_SAFE_MODE=1`. Every script is checked before it runs, and risky code (direct file access, running other programs, network access) is blocked.

Only one MCP server instance should connect to Blender at a time. Running multiple clients (for example, both Cursor and Claude Desktop) simultaneously against the same Blender session will cause conflicts.