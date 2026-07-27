import type { NextConfig } from "next";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join, relative } from "path";
import { createHash } from "crypto";
import withSerwistInit from "@serwist/next";

// ─── Single source of truth: monorepo-root .env.local ─────────
// Next.js only auto-loads .env files from this app's own folder. In this
// Turborepo the credentials live in ONE file at the repo root, so we load
// it here and fill in any vars not already set in the environment.
// - BOM-safe (strips a leading UTF-8 BOM if an editor added one)
// - Never overwrites vars already provided by the real environment
//   (e.g. Vercel / CI), so production deploys are unaffected
// - Missing file is a silent no-op
function loadRootEnv() {
  const candidates = [
    resolve(process.cwd(), ".env.local"),
    resolve(process.cwd(), "../../.env.local"),
  ];
  if (typeof __dirname !== "undefined") {
    candidates.push(resolve(__dirname, "../../.env.local"));
  }
  for (const path of candidates) {
    let content: string;
    try {
      content = readFileSync(path, "utf8");
    } catch {
      continue; // file not at this candidate path
    }
    content = content.replace(/^﻿/, ""); // strip UTF-8 BOM
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!match) continue;
      const key = match[1] as string;
      const value = (match[2] ?? "").trim();
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}
loadRootEnv();

// ─── public/ precache list (forward-slash URLs on every OS) ───
// @serwist/next's built-in public scan uses glob, which returns OS-native path
// separators. On Windows that produces broken precache URLs such as
// "/icons\icon-192.png". Building the list here keeps the URLs correct on any
// build OS. We mirror Serwist's defaults: every file under public/, except the
// generated service worker itself. Providing `additionalPrecacheEntries` makes
// @serwist/next skip its own scan and use this list verbatim.
function buildPublicPrecacheEntries(): { url: string; revision: string }[] {
  const publicDir = resolve(process.cwd(), "public");
  // Don't precache the SW itself (sw.js / sw.js.map) or the optional nav worker.
  const skipRootFile = /^(sw\.js(\.map)?|swe-worker-[^/]*\.js)$/;
  const entries: { url: string; revision: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      const rel = relative(publicDir, abs).split(/[\\/]/).join("/");
      if (skipRootFile.test(rel)) continue;
      const revision = createHash("md5").update(readFileSync(abs)).digest("hex");
      entries.push({ url: `/${rel}`, revision });
    }
  };
  try {
    walk(publicDir);
  } catch {
    // No public/ directory — nothing to precache.
  }
  return entries;
}

// @serwist/next compiles src/app/sw.ts into public/sw.js and (with register:true,
// the default) auto-registers it — the same behaviour next-pwa's register.js gave us.
// skipWaiting + clientsClaim now live in the service-worker source (src/app/sw.ts).
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Equivalent to next-pwa's buildExcludes. This is merged with Serwist's own
  // built-in excludes (which already drop the SW asset, server/*, and root-level
  // JSON files), so it only adds to — never replaces — the safe defaults.
  exclude: [/middleware-manifest\.json$/],
  // Precache manifest.json + icons with cross-platform-correct URLs.
  additionalPrecacheEntries: buildPublicPrecacheEntries(),
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@crewops/core"],
  serverExternalPackages: [],
  // Monorepo: trace from the repo root so the standalone output is correct and
  // Next stops warning about multiple lockfiles.
  outputFileTracingRoot: resolve(__dirname, "../../"),
  // Tree-shake big barrel packages so each page ships only the icons/components
  // it actually uses — smaller client bundles + faster compiles.
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Hide the Next.js dev-mode indicator (the floating round button in dev).
  // It never appears in production builds anyway.
  devIndicators: false,
  // @crewops/core is consumed straight from TS source and uses NodeNext-style
  // ".js" extensions in its relative imports. tsc resolves those to ".ts",
  // but webpack needs to be told to do the same.
  webpack: (config: { resolve: { extensionAlias?: Record<string, string[]> } }) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default withSerwist(nextConfig);
