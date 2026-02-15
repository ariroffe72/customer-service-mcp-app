# Customer Service MCP App

An extensible [MCP App](https://modelcontextprotocol.io/) for customer service ticket submission with email notifications. Built with the MCP Apps SDK, React, and Nodemailer.

## Features

- **`customer_support` tool** — accepts customer name, issue description, priority, category, and custom fields, then sends an email to your support team
- **Branded React UI** — a polished form that renders inside any MCP host (Claude Desktop, etc.)
- **Extensible configuration** — swap brand colours, add custom fields, change categories/priorities, or point to a different SMTP provider — all from a single config file
- **Graceful fallback** — when SMTP isn't configured, tickets are logged to the console so you can develop without credentials

## Quick Start

```bash
# Install dependencies
npm install

# Start in development mode (auto-rebuilds on change)
npm run dev

# Or build + run once
npm start
```

The MCP server will be available at `http://localhost:3001/mcp`.

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_SECURE` | Use TLS (`true`/`false`) | `false` |
| `SMTP_USER` | SMTP username/email | — |
| `SMTP_PASS` | SMTP password or app password | — |
| `SUPPORT_EMAIL` | Recipient email for tickets | `support@example.com` |
| `PORT` | HTTP server port | `3001` |

### Customising for Your Team

Edit `config.ts` to change:

**Brand** — name, colours, logo, tagline:
```ts
brand: {
  name: "Acme Support",
  primaryColor: "#e11d48",
  secondaryColor: "#be123c",
  logoUrl: "https://acme.com/logo.png",
  tagline: "How can we help today?",
}
```

**Custom fields** — add phone, order number, or any other field:
```ts
customFields: [
  { key: "email", label: "Email", type: "email", placeholder: "you@example.com", required: true },
  { key: "phone", label: "Phone", type: "tel", placeholder: "+1 (555) 000-0000", required: false },
  { key: "orderId", label: "Order ID", type: "text", placeholder: "ORD-XXXX", required: false },
]
```

**Priorities & categories**:
```ts
priorities: ["Low", "Medium", "High", "Critical"],
categories: ["Sales", "Technical", "Returns", "Other"],
```

### Programmatic Configuration

When embedding this server in a larger application:

```ts
import { createServer } from "@customer-service/mcp-app";

const server = createServer({
  brand: { name: "My Company Support" },
  supportEmail: "help@mycompany.com",
});
```

## Architecture

```
├── config.ts            # Extensible configuration (brand, SMTP, fields)
├── server.ts            # MCP server — registers customer_support tool + UI resource
├── main.ts              # Entry point — HTTP or stdio transport
├── build-server.ts      # esbuild bundler for server-side code
├── mcp-app.html         # HTML shell for the React UI
├── src/
│   ├── mcp-app.tsx      # React UI component
│   ├── mcp-app.module.css  # Scoped styles
│   └── global.css       # Design tokens / CSS custom properties
├── vite.config.ts       # Vite bundles UI into a single HTML file
└── .env.example         # Environment variable template
```

## How It Works

1. The MCP host discovers the `customer_support` tool via the standard MCP tool listing
2. The tool's `_meta.ui.resourceUri` tells the host to fetch and render the companion React UI
3. The user fills out the branded form in the host's UI panel
4. On submit, the React app calls `app.callServerTool("customer_support", ...)` which routes back to the MCP server
5. The server composes an email from the ticket fields and sends it via SMTP (or logs it if SMTP isn't configured)
6. The UI displays a confirmation with the ticket summary

## License

MIT
