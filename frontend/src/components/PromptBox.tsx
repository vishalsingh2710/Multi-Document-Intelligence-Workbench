interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const EXAMPLES = [
  "Compare the information across all uploaded documents.",
  "Identify inconsistencies between the application form and supporting documents.",
  "Extract key dates, obligations, financial values, and missing information.",
  "Compare the financial position of the companies represented in the documents.",
  "Highlight discrepancies in names, addresses, licence details, or revenue figures.",
];

export function PromptBox({ value, onChange, disabled }: Props) {
  return (
    <div className="prompt-box">
      <label htmlFor="prompt">Analysis instruction</label>
      <textarea
        id="prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={3}
        maxLength={2000}
        placeholder="e.g. Compare the application form and supporting documents and flag any inconsistencies."
      />
      <details className="examples">
        <summary>Example instructions</summary>
        <ul>
          {EXAMPLES.map((ex) => (
            <li key={ex}>
              <button type="button" onClick={() => onChange(ex)} disabled={disabled}>
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
