import { useState, type FormEvent } from "react";
import { CapgeminiEngineeringLogo } from "./CapgeminiEngineeringLogo";

export interface JiraSettings {
  domain: string;
  email: string;
  apiToken: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  settings: JiraSettings;
  onSave: (settings: JiraSettings) => void;
}

const STORAGE_KEY = "qa-agent-jira-settings";

export function loadJiraSettings(): JiraSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { domain: "", email: "", apiToken: "" };
}

export function saveJiraSettings(settings: JiraSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function JiraSettingsModal({ open, onClose, settings, onSave }: Props) {
  const [domain, setDomain] = useState(settings.domain);
  const [email, setEmail] = useState(settings.email);
  const [apiToken, setApiToken] = useState(settings.apiToken);
  const [saved, setSaved] = useState(false);

  if (!open) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const next = { domain: domain.trim(), email: email.trim(), apiToken: apiToken.trim() };
    onSave(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setDomain("");
    setEmail("");
    setApiToken("");
    onSave({ domain: "", email: "", apiToken: "" });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-surface p-8 shadow-2xl ring-1 ring-brand/15"
      >
        <div className="mb-6 flex justify-center">
          <CapgeminiEngineeringLogo compact />
        </div>

        <div className="mb-6">
          <h2 className="mb-1 text-center text-lg font-semibold text-foreground">
            Jira Connection Settings
          </h2>
          <p className="text-center text-pretty text-sm text-muted-foreground">
            Configure your Atlassian Jira credentials. Leave empty to use the server defaults.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="jira-domain" className="text-xs font-medium tracking-wider text-foreground uppercase">
              Jira Domain
            </label>
            <input
              id="jira-domain"
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="e.g. mycompany (for mycompany.atlassian.net)"
              className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Your Atlassian subdomain</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-email" className="text-xs font-medium tracking-wider text-foreground uppercase">
              Jira Email
            </label>
            <input
              id="jira-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">Email for Jira Basic Auth</p>
          </div>

          <div className="space-y-2">
            <label htmlFor="jira-token" className="text-xs font-medium tracking-wider text-foreground uppercase">
              Jira API Token
            </label>
            <input
              id="jira-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Your Jira API token"
              className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
            />
            <p className="text-xs text-muted-foreground">API token from id.atlassian.com</p>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5"
          >
            Reset
          </button>
          <button
            type="submit"
            className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-muted"
          >
            {saved ? "Saved!" : "Save Settings"}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </form>
    </div>
  );
}
