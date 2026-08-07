import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { LoginSelectorMap, SelectorMap } from './selector-types.js';

/**
 * Extracts a stable, filesystem-safe domain from a URL.
 * "https://www.Teskerti.Tn/user/login" -> "teskerti.tn"
 */
export function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    const cleaned = url
      .replace(/^https?:\/\//, '')
      .split(/[/?#]/)[0]
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase();
    return cleaned || 'unknown';
  }
}

export function selectorsDirectory(): string {
  return path.resolve('selectors');
}

export function selectorsFilePath(domain: string): string {
  return path.join(selectorsDirectory(), `${domain}.json`);
}

/**
 * Loads an existing knowledge base for a domain, or null when none exists.
 */
export function loadSelectorMap(domain: string): SelectorMap | null {
  const filePath = selectorsFilePath(domain);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as SelectorMap;
  } catch {
    return null;
  }
}

/**
 * Persists a SelectorMap as ./selectors/<domain>.json (pretty-printed).
 * Returns the absolute path of the written file.
 */
export function saveSelectorMap(map: SelectorMap): string {
  const directory = selectorsDirectory();
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
  const filePath = selectorsFilePath(map.domain);
  writeFileSync(filePath, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * Merges an existing knowledge base with a freshly analyzed map.
 * Newer values win for the same field, and existing forms are preserved.
 */
export function mergeSelectorMap(existing: SelectorMap | null, updated: SelectorMap): SelectorMap {
  if (!existing) {
    return updated;
  }

  const login: LoginSelectorMap = { ...existing.login, ...updated.login };

  return {
    ...existing,
    ...updated,
    login,
    forms: { ...existing.forms, ...updated.forms }
  };
}
