# Customer Service MCP App

## Project Overview

This is an MCP (Model Context Protocol) server with a companion React UI ("MCP App"). The server exposes a `customer_support` tool that submits support tickets via email, and a UI resource that renders a branded form inside the MCP host (e.g. Claude Desktop).

## Architecture

```
main.ts          → Entry point: stdio or HTTP transport
server.ts        → MCP server: registers tools + UI resources
config.ts        → Extensible configuration (brand, SMTP, fields)
src/mcp-app.tsx  → React UI rendered inside the MCP host
src/mcp-app.module.css → CSS modules for the UI
src/global.css   → CSS variable defaults / reset
mcp-app.html     → Vite entry point for the UI build
build-server.ts  → esbuild script for server bundle
vite.config.ts   → Vite config for single-file HTML build
```

### Key Patterns

- **Server side**: Use `registerAppTool()` and `registerAppResource()` from `@modelcontextprotocol/ext-apps/server` to link tools to UI resources.
- **Client side**: Use `useApp()` from `@modelcontextprotocol/ext-apps/react` to connect to the host. Use `app.callServerTool()` to invoke any tool on the server.
- **Build**: Vite + `vite-plugin-singlefile` bundles the React app into a self-contained HTML file. esbuild bundles the server TypeScript.
- **Transport**: Supports both `--stdio` (for Claude Desktop) and HTTP (for web clients). When using stdio, **never use `console.log()` in server code** — it corrupts the JSON-RPC stream. Use `console.error()` instead.

## Commands

- `npm run build` — Type-check, build UI HTML, build server JS
- `npm run dev` — Watch mode with concurrent UI + server
- `npm run serve` — Run the HTTP server
- `node dist/index.js --stdio` — Run with stdio transport

## Porting This MCP App to Another MCP Server

The following instructions are for an AI agent that needs to add an MCP App UI to an existing MCP server. Execute these steps in order.

### Prerequisites

The destination repo must already have an MCP server using `@modelcontextprotocol/sdk`. If not, set one up first.

### Step 1: Install dependencies

Add to the destination repo's `package.json`:

```
# Runtime
npm install @modelcontextprotocol/ext-apps react react-dom zod

# Dev
npm install -D @vitejs/plugin-react vite vite-plugin-singlefile @types/react @types/react-dom
```

If the destination server doesn't already have `@modelcontextprotocol/sdk`, install it too.

### Step 2: Create the Vite config for single-file HTML builds

Create `vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

const INPUT = process.env.INPUT;
if (!INPUT) throw new Error("INPUT environment variable is not set");

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: { input: INPUT },
    outDir: "dist",
    emptyOutDir: false,
  },
});
```

### Step 3: Create the HTML entry point

Create `mcp-app.html` (or name it after your tool):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Your Tool Name</title>
  <link rel="stylesheet" href="/src/global.css">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/mcp-app.tsx"></script>
</body>
</html>
```

### Step 4: Copy the CSS foundation

Copy `src/global.css` from this repo as-is. It provides CSS variable fallbacks that the MCP host overrides at runtime. Create `src/css.d.ts` so TypeScript understands CSS module imports:

```ts
declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
```

### Step 5: Create the React UI

Create `src/mcp-app.tsx`. Use this skeleton as a starting point:

```tsx
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function MyApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "My MCP App", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => ({ });
      app.ontoolinput = async (input) => { /* pre-fill form from input.arguments */ };
      app.ontoolresult = async (result) => { setToolResult(result); };
      app.ontoolcancelled = () => {};
      app.onerror = console.error;
      app.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div>ERROR: {error.message}</div>;
  if (!app) return <div>Connecting...</div>;

  // --- YOUR UI HERE ---
  // Call tools via: app.callServerTool({ name: "your_tool", arguments: {...} })
  // Send messages via: app.sendMessage({ role: "user", content: [...] })

  return <div>Your UI</div>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><MyApp /></StrictMode>
);
```

Key APIs available on the `app` object:
- `app.callServerTool({ name, arguments })` — Invoke any tool on the MCP server
- `app.sendMessage({ role: "user", content: [...] })` — Send a message into the chat
- `app.updateModelContext({ content: [...] })` — Update the model's context silently
- `app.openLink({ url })` — Ask the host to open a URL
- `app.request({ method: "tools/list", params: {} }, ListToolsResultSchema)` — List all server tools
- `app.getHostContext()` — Get theme, locale, toolInfo, safeAreaInsets, etc.

### Step 6: Register the tool with a UI resource on the server

In the server file where tools are registered, switch from `server.tool()` to `registerAppTool()`:

```ts
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import fs from "node:fs/promises";
import path from "node:path";

// Pick a unique resource URI for your UI
const resourceUri = "ui://your-server/mcp-app.html";

// Register the tool WITH a UI link
registerAppTool(
  server,           // your McpServer instance
  "your_tool_name",
  {
    title: "Human-Readable Title",
    description: "What this tool does",
    inputSchema: { /* zod shape */ },
    _meta: { ui: { resourceUri } },  // <-- this links the tool to the UI
  },
  async (args) => {
    // Tool handler — return CallToolResult
    return { content: [{ type: "text", text: JSON.stringify({ status: "ok", ...result }) }] };
  },
);

// Serve the built HTML as a UI resource
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

registerAppResource(
  server,
  resourceUri,
  resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
    return { contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }] };
  },
);
```

### Step 7: Add the build script to package.json

Add to `scripts`:

```json
{
  "build:ui": "cross-env INPUT=mcp-app.html vite build",
  "build": "tsc --noEmit && npm run build:ui && <your existing server build>"
}
```

### Step 8: Verify

1. Run `npm run build` — should produce `dist/mcp-app.html` (single-file, ~500KB+)
2. Configure Claude Desktop to use `node dist/index.js --stdio`
3. Ask Claude to use your tool — the UI should appear inline

### Common Pitfalls

- **NEVER use `console.log()` in server-side code** when running with stdio transport. It writes to stdout and corrupts JSON-RPC. Use `console.error()` instead.
- The HTML must be a single self-contained file (no external scripts/styles). `vite-plugin-singlefile` handles this.
- The `_meta.ui.resourceUri` on the tool definition is what tells the host to render a UI. Without it, the tool works but has no UI.
- Existing tools registered with `server.tool()` will continue to work normally alongside `registerAppTool()` tools. You don't need to migrate everything.
- The `ServerToolsPanel` component (in this repo's `src/mcp-app.tsx`) uses `app.request("tools/list", ...)` to discover all tools on the server. Copy it for automatic tool discovery in any MCP App UI.
