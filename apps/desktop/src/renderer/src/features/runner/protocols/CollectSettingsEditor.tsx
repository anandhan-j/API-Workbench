import { useState } from 'react';
import type { CollectSettings } from '@shared/protocol';
import { Labeled, INPUT_CLASS, parseIntField } from './fields';

/**
 * Shared editor for a stream's one-shot collect limits (max events / duration).
 * The inputs keep their raw text locally so the field can be cleared while
 * typing, but the payload only ever receives a valid positive integer (a
 * cleared/invalid field keeps the last good value), so a transient empty field
 * can't store 0 and fail the positive-int schema on send.
 */
export function CollectSettingsEditor({
  value,
  onChange,
}: {
  value: CollectSettings;
  onChange: (value: CollectSettings) => void;
}): JSX.Element {
  const collect: CollectSettings = {
    maxEvents: value.maxEvents ?? 50,
    durationMs: value.durationMs ?? 10_000,
  };
  const [maxText, setMaxText] = useState(String(collect.maxEvents));
  const [durText, setDurText] = useState(String(collect.durationMs));

  return (
    <div className="grid grid-cols-2 gap-3">
      <Labeled label="Max events">
        <input
          type="number"
          value={maxText}
          onChange={(e) => {
            setMaxText(e.target.value);
            onChange({ ...collect, maxEvents: parseIntField(e.target.value, collect.maxEvents) });
          }}
          aria-label="Max events"
          className={INPUT_CLASS}
        />
      </Labeled>
      <Labeled label="Duration" hint="ms">
        <input
          type="number"
          value={durText}
          onChange={(e) => {
            setDurText(e.target.value);
            onChange({ ...collect, durationMs: parseIntField(e.target.value, collect.durationMs) });
          }}
          aria-label="Collect duration"
          className={INPUT_CLASS}
        />
      </Labeled>
    </div>
  );
}
