/**
 * @file Customer Service MCP App — React UI.
 *
 * Renders a branded support form that submits tickets via the
 * `customer_support` MCP tool and displays confirmation / errors.
 */
import type { App, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import styles from "./mcp-app.module.css";

// ── Types ────────────────────────────────────────────────────────────────

interface TicketResult {
  status: "ok" | "error";
  message: string;
  ticket?: {
    name: string;
    issue: string;
    priority: string;
    category: string;
    timestamp: string;
  };
}

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select";
  placeholder: string;
  required: boolean;
  options?: string[];
}

/**
 * Default configuration embedded in the client.
 * Teams can customise this block or inject it from the server at build time.
 */
const DEFAULT_BRAND = {
  name: "Customer Support",
  primaryColor: "#2563eb",
  secondaryColor: "#1e40af",
  logoUrl: undefined as string | undefined,
  tagline: "We're here to help",
};

const DEFAULT_PRIORITIES = ["Low", "Medium", "High", "Urgent"];
const DEFAULT_CATEGORIES = [
  "General Inquiry",
  "Technical Support",
  "Billing",
  "Feature Request",
  "Bug Report",
];

const DEFAULT_CUSTOM_FIELDS: FieldDef[] = [
  {
    key: "email",
    label: "Email Address",
    type: "email",
    placeholder: "you@example.com",
    required: false,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function parseToolResult(result: CallToolResult): TicketResult {
  const text = result.content?.find((c) => c.type === "text");
  if (!text) return { status: "error", message: "No response from server." };
  try {
    return JSON.parse((text as { type: "text"; text: string }).text);
  } catch {
    return { status: "error", message: "Invalid server response." };
  }
}

// ── Root component ───────────────────────────────────────────────────────

function CustomerServiceApp() {
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "Customer Service App", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onteardown = async () => {
        console.info("App is being torn down");
        return {};
      };
      app.ontoolinput = async (input) => {
        console.info("Received tool call input:", input);
      };
      app.ontoolresult = async (result) => {
        console.info("Received tool call result:", result);
        setToolResult(result);
      };
      app.ontoolcancelled = (params) => {
        console.info("Tool call cancelled:", params.reason);
      };
      app.onerror = console.error;
      app.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
    },
  });

  useEffect(() => {
    if (app) setHostContext(app.getHostContext());
  }, [app]);

  if (error) return <div><strong>ERROR:</strong> {error.message}</div>;
  if (!app) return <div className={styles.container}>Connecting...</div>;

  return (
    <SupportForm
      app={app}
      toolResult={toolResult}
      hostContext={hostContext}
    />
  );
}

// ── Server Tools panel ────────────────────────────────────────────────────

function ServerToolsPanel({ app }: { app: App }) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    app
      .request(
        { method: "tools/list" as const, params: {} },
        ListToolsResultSchema,
      )
      .then((res) => {
        if (!cancelled) {
          setTools(res.tools);
          setLoaded(true);
        }
      })
      .catch(() => {
        // Host doesn't support tools/list proxy — silently skip
        if (!cancelled) setLoaded(true);
      });

    return () => { cancelled = true; };
  }, [app]);

  if (!loaded || tools.length === 0) return null;

  return (
    <section className={styles.toolsPanel}>
      <button
        type="button"
        className={styles.toolsToggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span>Server Tools ({tools.length})</span>
        <span className={styles.toolsChevron} data-expanded={expanded}>
          {"\u25B6"}
        </span>
      </button>

      {expanded && (
        <ul className={styles.toolsList}>
          {tools.map((t) => (
            <li key={t.name} className={styles.toolItem}>
              <p className={styles.toolName}>{t.name}</p>
              {t.description && (
                <p className={styles.toolDesc}>{t.description}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Form component ───────────────────────────────────────────────────────

interface SupportFormProps {
  app: App;
  toolResult: CallToolResult | null;
  hostContext?: McpUiHostContext;
}

function SupportForm({ app, toolResult, hostContext }: SupportFormProps) {
  // Form state
  const [name, setName] = useState("");
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [category, setCategory] = useState("General Inquiry");
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<TicketResult | null>(null);

  // Process server-pushed results
  useEffect(() => {
    if (toolResult) setResult(parseToolResult(toolResult));
  }, [toolResult]);

  const brand = DEFAULT_BRAND;
  const priorities = DEFAULT_PRIORITIES;
  const categories = DEFAULT_CATEGORIES;
  const customFields = DEFAULT_CUSTOM_FIELDS;

  // Apply brand colours as CSS custom properties
  const brandStyles = useMemo(
    () =>
      ({
        "--color-accent": brand.primaryColor,
        "--color-accent-hover": brand.secondaryColor,
      }) as React.CSSProperties,
    [brand],
  );

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setSubmitting(true);
      setResult(null);

      try {
        const args: Record<string, string> = {
          name,
          issue,
          priority,
          category,
          ...customValues,
        };

        const callResult = await app.callServerTool({
          name: "customer_support",
          arguments: args,
        });

        setResult(parseToolResult(callResult));
      } catch (err) {
        console.error(err);
        setResult({
          status: "error",
          message: err instanceof Error ? err.message : "Submission failed.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [app, name, issue, priority, category, customValues],
  );

  const handleReset = useCallback(() => {
    setName("");
    setIssue("");
    setPriority("Medium");
    setCategory("General Inquiry");
    setCustomValues({});
    setResult(null);
  }, []);

  return (
    <main
      className={styles.container}
      style={{
        ...brandStyles,
        paddingTop: hostContext?.safeAreaInsets?.top,
        paddingRight: hostContext?.safeAreaInsets?.right,
        paddingBottom: hostContext?.safeAreaInsets?.bottom,
        paddingLeft: hostContext?.safeAreaInsets?.left,
      }}
    >
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className={styles.header}>
        {brand.logoUrl && (
          <img src={brand.logoUrl} alt={brand.name} className={styles.logo} />
        )}
        <h2 className={styles.brandName}>{brand.name}</h2>
        <p className={styles.tagline}>{brand.tagline}</p>
      </header>

      {/* ── Success / confirmation ─────────────────────────────────── */}
      {result?.status === "ok" && result.ticket ? (
        <>
          <div className={styles.statusSuccess}>{result.message}</div>

          <div className={styles.ticket}>
            <p className={styles.ticketTitle}>Ticket Summary</p>
            <div className={styles.ticketDetail}>
              <p><strong>Name:</strong> {result.ticket.name}</p>
              <p><strong>Issue:</strong> {result.ticket.issue}</p>
              <p><strong>Priority:</strong> {result.ticket.priority}</p>
              <p><strong>Category:</strong> {result.ticket.category}</p>
              <p><strong>Submitted:</strong> {new Date(result.ticket.timestamp).toLocaleString()}</p>
            </div>
          </div>

          <button className={styles.submitButton} onClick={handleReset}>
            Submit Another Ticket
          </button>
        </>
      ) : (
        /* ── Form ────────────────────────────────────────────────── */
        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="cs-name">
              Name <span className={styles.required}>*</span>
            </label>
            <input
              id="cs-name"
              className={styles.input}
              type="text"
              placeholder="Your full name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Issue */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="cs-issue">
              Issue <span className={styles.required}>*</span>
            </label>
            <textarea
              id="cs-issue"
              className={styles.textarea}
              placeholder="Describe your issue in detail..."
              required
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
            />
          </div>

          {/* Priority + Category row */}
          <div className={styles.row}>
            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="cs-priority">
                Priority
              </label>
              <select
                id="cs-priority"
                className={styles.select}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {priorities.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="cs-category">
                Category
              </label>
              <select
                id="cs-category"
                className={styles.select}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Custom fields */}
          {customFields.map((field) => (
            <div key={field.key} className={styles.fieldGroup}>
              <label className={styles.label} htmlFor={`cs-${field.key}`}>
                {field.label}
                {field.required && <span className={styles.required}>*</span>}
              </label>

              {field.type === "textarea" ? (
                <textarea
                  id={`cs-${field.key}`}
                  className={styles.textarea}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={customValues[field.key] ?? ""}
                  onChange={(e) =>
                    setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              ) : field.type === "select" ? (
                <select
                  id={`cs-${field.key}`}
                  className={styles.select}
                  required={field.required}
                  value={customValues[field.key] ?? ""}
                  onChange={(e) =>
                    setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                >
                  <option value="">{field.placeholder}</option>
                  {field.options?.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <input
                  id={`cs-${field.key}`}
                  className={styles.input}
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={customValues[field.key] ?? ""}
                  onChange={(e) =>
                    setCustomValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}

          {/* Error message */}
          {result?.status === "error" && (
            <div className={styles.statusError}>{result.message}</div>
          )}

          {/* Submit */}
          <button
            type="submit"
            className={styles.submitButton}
            disabled={submitting}
          >
            {submitting ? "Submitting..." : "Submit Ticket"}
          </button>
        </form>
      )}

      {/* ── Available server tools ─────────────────────────────────── */}
      <ServerToolsPanel app={app} />

      <footer className={styles.footer}>
        Powered by {brand.name}
      </footer>
    </main>
  );
}

// ── Mount ─────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CustomerServiceApp />
  </StrictMode>,
);
