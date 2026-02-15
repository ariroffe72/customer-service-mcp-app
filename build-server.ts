/**
 * Build script that uses esbuild to bundle the server-side TypeScript.
 * Replaces the `bun build` commands from the reference example so
 * the project works with plain Node.js / npm.
 */
import { build } from "esbuild";

async function main() {
  // Build server.js
  await build({
    entryPoints: ["server.ts"],
    outdir: "dist",
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    external: ["nodemailer"],
    banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });

  // Build main entry (index.js)
  await build({
    entryPoints: ["main.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    external: ["./server.js", "nodemailer"],
    banner: { js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
  });

  console.log("Server build complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
