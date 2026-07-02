import type React from 'react';
import { color } from '../theme';
import type { CategoryType } from '../types';

// Type-aware inline editor shared by the review and live-exam screens: a List
// field shows its defined options as tappable pills, a Number field opens the
// numeric keyboard, and Free text is a plain text box. `options`/`optionsHe`
// are passed in (rather than read off a category) so the caller can supply a
// fallback list for older data that didn't store its own options.
// Allows the interim states typing a decimal passes through ("-", "3.", ".5")
// while still rejecting any non-numeric keystroke outright.
const NUMERIC_INPUT_PATTERN = /^-?\d*\.?\d*$/;

const inputStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 8,
  padding: '10px 12px',
  border: `1.5px solid ${color.teal}`,
  borderRadius: 12,
  background: '#fff',
  fontSize: 16,
  fontWeight: 600,
  color: color.ink,
  outline: 'none',
  boxSizing: 'border-box',
};

interface FieldEditorProps {
  type: CategoryType;
  value: string;
  options: string[] | null;
  optionsHe: string[] | null;
  rtl: boolean;
  onChange: (val: string) => void;
  close: () => void;
  cancelLabel: string;
}

export function FieldEditor({ type, value, options, optionsHe, rtl, onChange, close, cancelLabel }: FieldEditorProps) {
  const displayOptions = (rtl && optionsHe?.length ? optionsHe : options) ?? [];

  if (type === 'List' && displayOptions.length > 0) {
    return (
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayOptions.map((opt) => {
          const selected = opt === value;
          return (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                close();
              }}
              style={{
                padding: '11px 14px',
                border: `1.5px solid ${selected ? color.teal : color.borderCream2}`,
                borderRadius: 12,
                background: selected ? color.teal + '1a' : '#fff',
                fontSize: 15,
                fontWeight: 600,
                color: selected ? color.teal : color.ink,
                textAlign: 'start',
                cursor: 'pointer',
              }}
            >
              {opt}
            </button>
          );
        })}
        <button
          onClick={close}
          style={{
            marginTop: 2,
            padding: '9px 14px',
            border: 'none',
            borderRadius: 12,
            background: 'transparent',
            fontSize: 14,
            fontWeight: 600,
            color: color.muted,
            cursor: 'pointer',
            textAlign: 'start',
          }}
        >
          {cancelLabel}
        </button>
      </div>
    );
  }

  return (
    <input
      type="text"
      inputMode={type === 'Number' ? 'decimal' : 'text'}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        // A Number field only ever accepts digits (plus an in-progress "-"/".").
        // Any other keystroke is dropped — since this is a controlled input, not
        // calling onChange leaves the field showing its last valid value.
        if (type === 'Number' && !NUMERIC_INPUT_PATTERN.test(next)) return;
        onChange(next);
      }}
      onBlur={close}
      autoFocus
      style={inputStyle}
    />
  );
}
