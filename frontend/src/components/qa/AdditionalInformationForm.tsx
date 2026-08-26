import { useState, type FormEvent } from "react";
import type { RequiredInputField } from "@/types/qa";
import { CapgeminiEngineeringLogo } from "./CapgeminiEngineeringLogo";

interface Props {
  message?: string | undefined;
  fields: RequiredInputField[];
  submitting?: boolean;
  onSubmit: (values: Record<string, string>) => void;
}

/**
 * Renders whatever fields the backend asks for. Values are held in local
 * component state only and sent straight to the API; never persisted.
 */
export function AdditionalInformationForm({ message, fields, submitting, onSubmit }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [collecting, setCollecting] = useState(false);

  const set = (name: string, value: string) => setValues((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const missing = fields.filter((f) => f.required && !values[f.name]?.trim());
    if (missing.length > 0) {
      setError(`Please fill in: ${missing.map((f) => f.label).join(", ")}.`);
      return;
    }
    setError(null);
    onSubmit(values);
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
            Additional information required
          </h2>
          <p className="text-center text-pretty text-sm text-muted-foreground">
            {message ??
              "Does the application need credentials or other private values for these tests?"}
          </p>
        </div>

        {!collecting ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => onSubmit({})}
              className="rounded-lg border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-brand/40 hover:bg-brand/5 disabled:opacity-60"
            >
              No, continue
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setCollecting(true)}
              className="rounded-lg bg-brand px-4 py-3 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-muted disabled:opacity-60"
            >
              Yes, add values
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {fields.map((field) => (
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
                      value={values[field.name] ?? ""}
                      onChange={(e) => set(field.name, e.target.value)}
                      className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                    />
                  ) : field.type === "select" ? (
                    <select
                      id={`field-${field.name}`}
                      value={values[field.name] ?? ""}
                      onChange={(e) => set(field.name, e.target.value)}
                      className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                    >
                      <option value="">Select...</option>
                      {(field.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`field-${field.name}`}
                      type={field.type}
                      autoComplete={field.type === "password" ? "new-password" : "off"}
                      placeholder={field.placeholder}
                      value={values[field.name] ?? ""}
                      onChange={(e) => set(field.name, e.target.value)}
                      className="w-full rounded-lg bg-secondary px-4 py-2 text-sm ring-1 ring-foreground/5 focus:ring-2 focus:ring-brand/30 focus:outline-none"
                    />
                  )}

                  {field.description ? (
                    <p className="text-xs text-muted-foreground">{field.description}</p>
                  ) : null}
                </div>
              ))}
            </div>

            {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

            <div className="mt-8">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-muted disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Continue Testing"}
              </button>
            </div>
          </>
        )}


      </form>
    </div>
  );
}
