import { getDomainFromUrl, loadSelectorMap, mergeSelectorMap } from './storage.js';
import { analyzeWebsite } from './agents/website-understanding.js';
import type { SelectorMap } from './selector-types.js';

/**
 * Returns a verified SelectorMap for a website, building it on first use.
 *
 * This is the "bring any website" onboarding step: given only a Website URL, it
 * either loads an existing per-domain knowledge base (selectors/<domain>.json)
 * or, when none exists, automatically runs the Website Understanding Agent to
 * discover and persist verified selectors before the pipeline proceeds.
 *
 * Returns null when the site URL is missing or analysis could not produce a map
 * (so callers keep their existing graceful fallback behavior).
 */
export async function ensureSelectorMap(baseUrl?: string): Promise<SelectorMap | null> {
  if (!baseUrl) {
    return null;
  }

  const domain = getDomainFromUrl(baseUrl);
  const existing = loadSelectorMap(domain);

  // A KB is "usable" only if at least one page has discovered elements. Existing
  // populated KBs (e.g. teskerti) short-circuit immediately so they are never
  // re-analyzed or overwritten; an empty crawl result stays eligible for a later retry.
  const hasUsableKb = !!existing && Object.values(existing.pages ?? {}).some(
    (pageMap) => Object.keys(pageMap ?? {}).length > 0
  );

  if (hasUsableKb) {
    return existing;
  }

  // No usable knowledge base yet -> auto-analyze the site.
  const candidates = [baseUrl, (() => {
    try {
      const u = new URL(baseUrl);
      u.pathname = '/';
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch {
      return null;
    }
  })()].filter((url): url is string => !!url);

  console.log(`[selector-onboard] No verified selectors for "${domain}"; analyzing ${baseUrl} ...`);

  for (const url of candidates) {
    try {
      const result = await analyzeWebsite({ url, headless: true, waitMs: 4000 });
      const fresh = loadSelectorMap(domain);
      const map: SelectorMap | null =
        fresh && Object.keys(fresh.pages ?? {}).length > 0
          ? mergeSelectorMap(existing, fresh)
          : (fresh ?? null);

      if (map) {
        console.log(
          `[selector-onboard] Captured ${result.elementCount} element(s) / ${Object.keys(result.map).length} on ${result.pagePath}`
        );
        return map;
      }
    } catch (err) {
      console.warn(`[selector-onboard] Analysis failed for ${url}:`, err instanceof Error ? err.message : err);
    }
  }

  return existing;
}
