import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { TicketForm } from "@/components/qa/TicketForm";
import { CapgeminiEngineeringLogo } from "@/components/qa/CapgeminiEngineeringLogo";
import { JiraSettingsModal, loadJiraSettings, saveJiraSettings, type JiraSettings } from "@/components/qa/JiraSettingsModal";
import { qaApi } from "@/services/qaApi";
import { messageOf } from "@/hooks/useTestRun";
import type { RequiredInputField } from "@/types/qa";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QA Testing Agent — Generate & Run Playwright Tests from Jira" },
      {
        name: "description",
        content:
          "Give the agent a Jira ticket and a website URL. It generates Gherkin scenarios, writes Playwright tests, executes them, analyzes failures and proposes repairs.",
      },
      { property: "og:title", content: "QA Testing Agent" },
      {
        property: "og:description",
        content:
          "Automatically generate, execute, and analyze Playwright tests from your Jira requirements.",
      },
    ],
  }),
  component: StartPage,
});

function StartPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [jiraSettings, setJiraSettings] = useState<JiraSettings>(loadJiraSettings);
  const [showJiraSettings, setShowJiraSettings] = useState(false);

  useEffect(() => {
    setJiraSettings(loadJiraSettings());
  }, []);

  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [credentialFields, setCredentialFields] = useState<RequiredInputField[]>([]);
  const [credentialMessage, setCredentialMessage] = useState<string | undefined>(undefined);
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [collectingCredentials, setCollectingCredentials] = useState(false);

  const start = async (payload: { ticket: string; websiteUrl: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      const hasJiraConfig = jiraSettings.domain || jiraSettings.email || jiraSettings.apiToken;
      const res = await qaApi.startTest({
        ...payload,
        jiraCredentials: hasJiraConfig ? jiraSettings : undefined,
      });
      if (res.requiresInput && res.fields && res.fields.length > 0) {
        setPendingRunId(res.runId);
        setCredentialFields(res.fields);
        setCredentialMessage(res.message);
        setCredentialValues({});
        setCollectingCredentials(false);
      } else {
        await navigate({ to: "/run/$runId", params: { runId: res.runId } });
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  const submitCredentials = async () => {
    if (!pendingRunId) return;
    setSubmitting(true);
    setCredentialError(null);
    try {
      if (collectingCredentials) {
        await qaApi.submitInput(pendingRunId, credentialValues);
      }
      await navigate({ to: "/run/$runId", params: { runId: pendingRunId } });
    } catch (err) {
      setCredentialError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  const setCredentialField = (name: string, value: string) =>
    setCredentialValues((prev) => ({ ...prev, [name]: value }));

  const showCredentialModal = pendingRunId !== null;
  const hasJiraConfig = jiraSettings.domain || jiraSettings.email || jiraSettings.apiToken;

  return (
    <main className="min-h-screen bg-background px-6 py-10 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 flex flex-col gap-8">
          <div className="flex items-start justify-between">
            <CapgeminiEngineeringLogo />
            <button
              type="button"
              onClick={() => setShowJiraSettings(true)}
              title="Jira connection settings"
              className="mt-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div>
            <h1 className="mb-4 text-2xl leading-tight font-semibold tracking-tight text-balance text-cap-ink sm:text-3xl">
              QA Testing Agent
            </h1>
            <p className="max-w-[56ch] text-pretty text-base text-muted-foreground sm:text-sm">
              Automatically generate, execute, and analyze Playwright tests from your Jira
              requirements with autonomous browser interaction.
            </p>
            {hasJiraConfig ? (
              <p className="mt-2 text-xs text-brand">
                Connected to Jira: {jiraSettings.domain ? `${jiraSettings.domain}.atlassian.net` : "server default"}
              </p>
            ) : null}
          </div>
        </div>

        <TicketForm submitting={submitting} onStart={start} />

        {error ? (
          <p className="mt-6 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20">
            {error}
          </p>
        ) : null}
      </div>

      <JiraSettingsModal
        open={showJiraSettings}
        onClose={() => setShowJiraSettings(false)}
        settings={jiraSettings}
        onSave={(s) => {
          setJiraSettings(s);
          saveJiraSettings(s);
        }}
      />

      {showCredentialModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl bg-surface p-8 shadow-2xl ring-1 ring-brand/15">
            <div className="mb-6 flex justify-center">
              <CapgeminiEngineeringLogo compact />
            </div>
            <div className="mb-6">
              <h2 className="mb-1 text-center text-lg font-semibold text-foreground">
                Additional information required
              </h2>
              <p className="text-center text-pretty text-sm text-muted-foreground">
                {credentialMessage ??
                  "Does the application need credentials or other private values for these tests?"}
              </p>
            </div>

            {!collectingCredentials ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={submitCredentials}
                  className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 disabled:opacity-60"
                >
                  No, continue
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setCollectingCredentials(true)}
                  className="rounded-lg bg-brand px-4 py-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-muted disabled:opacity-60"
                >
                  Yes, add values
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {credentialFields.map((field) => (
                    <div key={field.name} className="space-y-2">
                      <label
                        htmlFor={`field-${field.name}`}
                        className="text-xs font-medium tracking-wider text-foreground uppercase"
                      >
                        {field.label}
                        {field.required ? <span className="text-danger"> *</span> : null}
                      </label>

                      {field.type === "textarea" ? (
                        <textarea
                          id={`field-${field.name}`}
                          rows={3}
                          placeholder={field.placeholder}
                          value={credentialValues[field.name] ?? ""}
                          onChange={(e) => setCredentialField(field.name, e.target.value)}
                          className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                        />
                      ) : field.type === "select" || field.type === "combobox" ? (
                        <select
                          id={`field-${field.name}`}
                          value={credentialValues[field.name] ?? ""}
                          onChange={(e) => setCredentialField(field.name, e.target.value)}
                          className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                        >
                          <option value="">Select...</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === "checkbox" ? (
                        <div className="flex items-center gap-3">
                          <input
                            id={`field-${field.name}`}
                            type="checkbox"
                            checked={Boolean(credentialValues[field.name])}
                            onChange={(e) => setCredentialField(field.name, e.target.checked ? "true" : "")}
                            className="size-4 rounded border-border bg-secondary accent-brand"
                          />
                          <span className="text-sm text-muted-foreground">
                            {field.label === "Checkbox" ? "Check this option" : "Yes / No"}
                          </span>
                        </div>
                      ) : field.type === "radio" ? (
                        <div className="flex flex-wrap items-center gap-4">
                          {(field.options ?? [{ label: "Yes", value: "true" }, { label: "No", value: "false" }]).map(
                            (option) => (
                              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                                <input
                                  type="radio"
                                  name={field.name}
                                  value={option.value}
                                  checked={credentialValues[field.name] === option.value}
                                  onChange={() => setCredentialField(field.name, option.value)}
                                  className="size-4 accent-brand"
                                />
                                {option.label}
                              </label>
                            ),
                          )}
                        </div>
                      ) : (
                        <input
                          id={`field-${field.name}`}
                          type={field.type}
                          autoComplete={field.type === "password" ? "new-password" : "off"}
                          placeholder={field.placeholder}
                          value={credentialValues[field.name] ?? ""}
                          onChange={(e) => setCredentialField(field.name, e.target.value)}
                          className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                        />
                      )}

                      {field.description ? (
                        <p className="text-xs text-muted-foreground">{field.description}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                {credentialError ? (
                  <p className="mt-4 text-sm text-danger">{credentialError}</p>
                ) : null}

                <div className="mt-8">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={submitCredentials}
                    className="w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-muted disabled:opacity-60"
                  >
                    {submitting ? "Sending..." : "Continue Testing"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
