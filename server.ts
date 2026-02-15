import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  CallToolResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import nodemailer from "nodemailer";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { type AppConfig, createConfig } from "./config.js";

// Works both from source (server.ts) and compiled (dist/server.js)
const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "dist")
  : import.meta.dirname;

/**
 * Build the email body from the support ticket fields.
 */
function buildEmailBody(fields: Record<string, string>, config: AppConfig): string {
  const lines = [
    `New support ticket received via ${config.brand.name}`,
    "",
    "--- Ticket Details ---",
    "",
    `Name: ${fields.name}`,
    `Issue: ${fields.issue}`,
  ];

  if (fields.priority) lines.push(`Priority: ${fields.priority}`);
  if (fields.category) lines.push(`Category: ${fields.category}`);

  // Append any custom field values
  for (const field of config.customFields) {
    if (fields[field.key]) {
      lines.push(`${field.label}: ${fields[field.key]}`);
    }
  }

  lines.push("", "--- End of Ticket ---");
  return lines.join("\n");
}

/**
 * Send the support email via SMTP.
 */
async function sendSupportEmail(
  fields: Record<string, string>,
  config: AppConfig,
): Promise<{ success: boolean; message: string }> {
  // If SMTP credentials aren't configured, log instead of sending
  if (!config.smtp.auth.user || !config.smtp.auth.pass) {
    const body = buildEmailBody(fields, config);
    console.log("=== EMAIL PREVIEW (SMTP not configured) ===");
    console.log(`To: ${config.supportEmail}`);
    console.log(
      `Subject: ${config.emailSubjectTemplate
        .replace("{{name}}", fields.name)
        .replace("{{issue}}", fields.issue)}`,
    );
    console.log(body);
    console.log("============================================");
    return {
      success: true,
      message:
        "Ticket recorded (email preview logged — configure SMTP credentials to enable delivery).",
    };
  }

  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: config.smtp.auth,
  });

  const subject = config.emailSubjectTemplate
    .replace("{{name}}", fields.name)
    .replace("{{issue}}", fields.issue);

  await transporter.sendMail({
    from: config.smtp.auth.user,
    to: config.supportEmail,
    subject,
    text: buildEmailBody(fields, config),
    replyTo: fields.email || undefined,
  });

  return { success: true, message: "Support ticket sent successfully." };
}

/**
 * Build a Zod input schema shape from the config.
 * Each field becomes a `z.string()` with an appropriate description.
 */
function buildInputSchema(config: AppConfig) {
  const shape: Record<string, z.ZodString | z.ZodOptional<z.ZodString>> = {
    name: z.string().describe("Full name of the customer"),
    issue: z.string().describe("Description of the customer's issue"),
    priority: z.string().optional().describe(`Ticket priority level (${config.priorities.join(", ")})`),
    category: z.string().optional().describe(`Issue category (${config.categories.join(", ")})`),
  };

  for (const field of config.customFields) {
    const base = z.string().describe(field.label);
    shape[field.key] = field.required ? base : base.optional();
  }

  return shape;
}

/**
 * Creates a new MCP server instance with the customer_support tool and
 * its companion UI resource registered.
 */
export function createServer(configOverrides?: Partial<AppConfig>): McpServer {
  const config = createConfig(configOverrides);

  const server = new McpServer({
    name: `${config.brand.name} MCP Server`,
    version: "1.0.0",
  });

  const resourceUri = "ui://customer-support/mcp-app.html";
  const inputSchema = buildInputSchema(config);

  // ── customer_support tool ─────────────────────────────────────────────
  registerAppTool(
    server,
    "customer_support",
    {
      title: `${config.brand.name}`,
      description:
        "Submit a customer support ticket. Collects the customer's name, " +
        "issue description, and optional metadata, then sends an email to " +
        "the support team.",
      inputSchema,
      _meta: { ui: { resourceUri } },
    },
    async (args): Promise<CallToolResult> => {
      const fields = args as unknown as Record<string, string>;
      try {
        const result = await sendSupportEmail(fields, config);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                status: result.success ? "ok" : "error",
                message: result.message,
                ticket: {
                  name: fields.name,
                  issue: fields.issue,
                  priority: fields.priority ?? "Medium",
                  category: fields.category ?? "General Inquiry",
                  timestamp: new Date().toISOString(),
                },
              }),
            },
          ],
        };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ status: "error", message: msg }) }],
          isError: true,
        };
      }
    },
  );

  // ── UI resource ───────────────────────────────────────────────────────
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(
        path.join(DIST_DIR, "mcp-app.html"),
        "utf-8",
      );
      return {
        contents: [{ uri: resourceUri, mimeType: RESOURCE_MIME_TYPE, text: html }],
      };
    },
  );

  return server;
}
