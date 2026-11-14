// src/components/reports/BlockSelector.tsx
// Section library (UI step 7): grouped sections, each with an Add button that
// turns into "Added" once the section is in the report.

import type { BlockKey } from '../../types/report';
import { BLOCK_LABELS } from '../../types/report';
import { INCIDENT_BLOCK_KEYS, SECTION_GROUPS } from '../../utils/reportPresets';

interface Props {
  activeBlocks: BlockKey[];
  hasIncident:  boolean;
  onAdd:        (key: BlockKey) => void;
}

export default function BlockSelector({ activeBlocks, hasIncident, onAdd }: Props) {
  return (
    <aside className="pl-card pl-rb-lib" aria-label="Section library">
      <h2 className="pl-label">Add sections</h2>
      {SECTION_GROUPS.map((g) => {
        const keys = g.keys.filter(k => hasIncident || !INCIDENT_BLOCK_KEYS.has(k));
        if (!keys.length) return null;
        return (
          <div key={g.name} className="pl-rb-lib-g">
            <span className="pl-rb-lib-h">{g.name}</span>
            {keys.map((k) => {
              const added = activeBlocks.includes(k);
              const name = BLOCK_LABELS[k];
              return (
                <div key={k} className="pl-rb-lib-i">
                  <span className="pl-grow">{name}</span>
                  <button type="button" className="pl-rb-add" disabled={added}
                    aria-label={added ? `${name} is in the report` : `Add ${name}`}
                    onClick={() => onAdd(k)}>
                    {added ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
