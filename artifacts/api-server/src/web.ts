import express, {type Express} from "express";
import {existsSync, readFileSync} from "node:fs";
import path from "node:path";
import {clerkEnabled, clerkProxyEnabled} from "./moons/lib/server/product-config";
import {CLERK_PROXY_PATH} from "./middlewares/clerkProxyMiddleware";

// One origin for page and API keeps the guest/auth cookies first-party.
// WEB_DIST_DIR points at the built web app (artifacts/moons/dist/public).
export function serveWeb(app: Express) {
  const dir = process.env.WEB_DIST_DIR;
  if (!dir) return;
  const indexPath = path.join(dir, "index.html");
  if (!existsSync(indexPath)) throw new Error(`WEB_DIST_DIR has no index.html: ${dir}`);
  const config = {
    ...(clerkEnabled() ? {clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY, clerkProxyUrl: clerkProxyEnabled() ? CLERK_PROXY_PATH : undefined} : {}),
    analysisReview: process.env.ANALYSIS_REVIEW !== 'off',
  };
  // JSON in a script tag: escape "<" so no value can close the tag.
  const script = `<script>window.__MOONS__=${JSON.stringify(config).replace(/</g, "\u003c")}</script>`;
  const html = readFileSync(indexPath, "utf8").replace("</head>", `${script}</head>`);
  app.use(express.static(dir, {index: false, maxAge: "1h", setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    // The worker and manifest must update with each deploy.
    else if (/(sw\.js|manifest\.webmanifest)$/.test(file)) res.setHeader("Cache-Control", "no-cache");
  }}));
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.set("Cache-Control", "no-store").type("html").send(html);
  });
}
