/**
 * @file Extensible configuration for the Customer Service MCP App.
 *
 * Teams can customize this file to adapt the app to their ecosystem:
 * - Brand identity (name, colors, logo)
 * - Email delivery settings (SMTP, recipient)
 * - Custom fields for the support form
 * - Priority levels and categories
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

export interface BrandConfig {
  /** Company or team name displayed in the UI */
  name: string;
  /** Primary brand color (hex) */
  primaryColor: string;
  /** Secondary/accent brand color (hex) */
  secondaryColor: string;
  /** Optional logo URL rendered in the header */
  logoUrl?: string;
  /** Tagline shown below the brand name */
  tagline: string;
}

export interface FieldConfig {
  /** Unique key for the field */
  key: string;
  /** Display label */
  label: string;
  /** HTML input type or "textarea" / "select" */
  type: "text" | "email" | "tel" | "textarea" | "select";
  /** Placeholder text */
  placeholder: string;
  /** Whether the field is required */
  required: boolean;
  /** Options for select fields */
  options?: string[];
}

export interface AppConfig {
  brand: BrandConfig;
  smtp: SmtpConfig;
  /** Email address that receives support tickets */
  supportEmail: string;
  /** Subject line template — use {{name}} and {{issue}} as placeholders */
  emailSubjectTemplate: string;
  /** Extra fields beyond the default name + issue */
  customFields: FieldConfig[];
  /** Available priority levels */
  priorities: string[];
  /** Available issue categories */
  categories: string[];
}

/**
 * Default configuration — override any section to match your team's needs.
 *
 * SMTP credentials should come from environment variables in production:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SUPPORT_EMAIL
 */
export const defaultConfig: AppConfig = {
  brand: {
    name: "Customer Support",
    primaryColor: "#2563eb",
    secondaryColor: "#1e40af",
    tagline: "We're here to help",
  },

  smtp: {
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER ?? "",
      pass: process.env.SMTP_PASS ?? "",
    },
  },

  supportEmail: process.env.SUPPORT_EMAIL ?? "support@example.com",

  emailSubjectTemplate: "Support Request from {{name}}: {{issue}}",

  customFields: [
    {
      key: "email",
      label: "Email Address",
      type: "email",
      placeholder: "you@example.com",
      required: false,
    },
  ],

  priorities: ["Low", "Medium", "High", "Urgent"],

  categories: [
    "General Inquiry",
    "Technical Support",
    "Billing",
    "Feature Request",
    "Bug Report",
  ],
};

/**
 * Merge a partial override into the default config.
 * Useful for teams that only need to change a few values.
 */
export function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ...defaultConfig,
    ...overrides,
    brand: { ...defaultConfig.brand, ...overrides.brand },
    smtp: {
      ...defaultConfig.smtp,
      ...overrides.smtp,
      auth: { ...defaultConfig.smtp.auth, ...overrides.smtp?.auth },
    },
    customFields: overrides.customFields ?? defaultConfig.customFields,
    priorities: overrides.priorities ?? defaultConfig.priorities,
    categories: overrides.categories ?? defaultConfig.categories,
  };
}
