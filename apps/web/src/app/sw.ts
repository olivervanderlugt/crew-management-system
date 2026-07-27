import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// This file is the Serwist service-worker source. @serwist/next compiles it
// (via InjectManifest) into public/sw.js at build time; it is never part of the
// app's client bundle. It replaces next-pwa's auto-generated sw.js + register.js:
// registration happens automatically (withSerwistInit's register: true default),
// and skipWaiting/clientsClaim — previously next-pwa config flags — live here.

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Precache manifest injected by @serwist/next at build time
    // (the InjectManifest injectionPoint).
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // @serwist/next's recommended runtime caching: static assets, Next.js data,
  // images, fonts, and pages get sensible stale-while-revalidate / cache-first
  // strategies out of the box.
  runtimeCaching: defaultCache,
  // When a page navigation fails offline, show the precached /offline page
  // instead of the browser's default error.
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
