import { useState, type FormEvent } from "react";
import { WebsiteInput } from "./WebsiteInput";

interface Props {
  submitting?: boolean;
  onStart: (payload: { ticket: string; websiteUrl: string }) => void;
}

export function TicketForm({ submitting, onStart }: Props) {
  const [ticket, setTicket] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!ticket.trim()) {
      setError("Please enter a Jira ticket, for example SCRUM-3.");
      return;
    }
    if (!/^https?:\/\/.+\..+/.test(websiteUrl.trim())) {
      setError("Please enter a full website URL including https://.");
      return;
    }
    setError(null);
    onStart({ ticket: ticket.trim(), websiteUrl: websiteUrl.trim() });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 rounded-xl bg-surface p-6 shadow-sm ring-1 ring-brand/15 sm:p-8"
    >
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="ticket" className="text-sm font-medium text-foreground">
            Jira Ticket
          </label>
          <input
            id="ticket"
            value={ticket}
            onChange={(e) => setTicket(e.target.value)}
            placeholder="Enter Jira ticket (e.g., SCRUM-3)"
            className="w-full rounded-lg bg-secondary px-4 py-2.5 font-mono text-sm ring-1 ring-foreground/10 transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/30 focus:outline-none"
          />
        </div>
        <WebsiteInput value={websiteUrl} onChange={setWebsiteUrl} />
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="pt-4">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-brand-foreground shadow-sm transition-all hover:bg-brand-muted disabled:opacity-60 sm:w-auto"
        >
          {submitting ? "Starting\u2026" : "Start Testing"}
        </button>
      </div>
    </form>
  );
}
