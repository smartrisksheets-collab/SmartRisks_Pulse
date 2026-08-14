// src/components/reports/BlockSelector.tsx

import type { BlockKey } from '../../types/report';
import { useAuthStore } from '../../store/authStore';

interface Group {
  head: string;
  items: { label: string; key: BlockKey }[];
}

const INCIDENT_BLOCK_KEYS = new Set<BlockKey>([
  'incident-stability',
  'incident-trend',
  'major-incidents',
  'incident-analytics',
]);

const GROUPS: Group[] = [
  {
    head: 'Executive',
    items: [
      { label: 'Executive Dashboard',  key: 'executive-dashboard'  },
      { label: 'Risk Health',          key: 'exposure-index'       },
      { label: 'Risk Snapshot',        key: 'risk-snapshot'        },
      { label: 'Key Risk Changes',     key: 'key-risk-changes'     },
      { label: 'Key Risk Movements',   key: 'key-risk-movements'   },
      { label: 'Risk Ownership',       key: 'risk-ownership'       },
      { label: 'Incident Stability',   key: 'incident-stability'   },
      { label: 'Executive Summary',    key: 'ai-exec-summary'      },
      { label: 'Executive Commentary', key: 'executive-commentary'  },
    ],
  },
  {
    head: 'Visuals',
    items: [
      { label: 'Exposure Trend',       key: 'exposure-trend'       },
      { label: 'Residual Risk Trend',  key: 'residual-risk-trend'  },
      { label: 'Risk Distribution',    key: 'risk-distribution'    },
      { label: 'Incident Trend',       key: 'incident-trend'       },
    ],
  },
  {
    head: 'Tables',
    items: [
      { label: 'Top Risks',            key: 'top-risks'            },
      { label: 'Top Emerging Risks',   key: 'top-emerging-risks'   },
      { label: 'Major Incidents',      key: 'major-incidents'      },
      { label: 'Incident Analytics',   key: 'incident-analytics'   },
    ],
  },
  {
    head: 'Final Layer',
    items: [
      { label: 'Findings',             key: 'findings'             },
      { label: 'Recommendations',      key: 'recommendations'      },
      { label: 'Conclusion',           key: 'conclusion'           },
    ],
  },
];

interface Props {
  activeBlocks: BlockKey[];
  onAdd:        (key: BlockKey) => void;
}

export default function BlockSelector({ activeBlocks, onAdd }: Props) {
  const modules     = useAuthStore(s => s.claims?.modules ?? []);
  const hasIncident = modules.includes('incident');

  return (
    <div className="rb-lib">
      <div className="rb-lib-title">Sections</div>
      {GROUPS.map((g) => {
        const items = g.items.filter(
          item => hasIncident || !INCIDENT_BLOCK_KEYS.has(item.key)
        );
        if (!items.length) return null;
        return (
          <div key={g.head} className="rb-lib-group">
            <div className="rb-lib-head">{g.head}</div>
            {items.map((item) => (
              <div
                key={item.key}
                className={`rb-lib-item${activeBlocks.includes(item.key) ? ' on-canvas' : ''}`}
                onClick={() => onAdd(item.key)}
                title={activeBlocks.includes(item.key) ? 'Already on canvas' : `Add ${item.label}`}
              >
                {item.label}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}