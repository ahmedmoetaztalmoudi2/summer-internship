interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function WebsiteInput({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <label htmlFor="website-url" className="text-sm font-medium text-foreground">
        Website URL
      </label>
      <input
        id="website-url"
        type="text"
        inputMode="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com"
        className="w-full rounded-lg bg-surface px-4 py-2.5 font-mono text-sm ring-1 ring-foreground/10 transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-brand/30 focus:outline-none"
      />
    </div>
  );
}
