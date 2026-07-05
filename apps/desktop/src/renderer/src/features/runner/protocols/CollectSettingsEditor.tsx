import type { CollectSettings } from '@shared/protocol';
import { Labeled, INPUT_CLASS } from './fields';

/** Shared editor for a stream's one-shot collect limits (max events / duration). */
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
  return (
    <div className="grid grid-cols-2 gap-3">
      <Labeled label="Max events">
        <input
          type="number"
          value={collect.maxEvents}
          onChange={(e) => onChange({ ...collect, maxEvents: Number(e.target.value) })}
          aria-label="Max events"
          className={INPUT_CLASS}
        />
      </Labeled>
      <Labeled label="Duration" hint="ms">
        <input
          type="number"
          value={collect.durationMs}
          onChange={(e) => onChange({ ...collect, durationMs: Number(e.target.value) })}
          aria-label="Collect duration"
          className={INPUT_CLASS}
        />
      </Labeled>
    </div>
  );
}
