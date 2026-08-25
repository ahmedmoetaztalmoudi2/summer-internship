import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { TicketForm } from "@/components/qa/TicketForm";
import { qaApi } from "@/services/qaApi";
import { messageOf } from "@/hooks/useTestRun";

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

  const start = async (payload: { ticket: string; websiteUrl: string }) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await qaApi.startTest(payload);
      await navigate({ to: "/run/$runId", params: { runId: res.runId } });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-6 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12">
          <h1 className="mb-4 text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">
            QA Testing Agent
          </h1>
          <p className="max-w-[56ch] text-pretty text-base text-muted-foreground sm:text-sm">
            Automatically generate, execute, and analyze Playwright tests from your Jira
            requirements with autonomous browser interaction.
          </p>
        </div>

        <TicketForm submitting={submitting} onStart={start} />

        {error ? (
          <p className="mt-6 rounded-lg bg-danger/10 px-4 py-3 text-sm text-danger ring-1 ring-danger/20">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
