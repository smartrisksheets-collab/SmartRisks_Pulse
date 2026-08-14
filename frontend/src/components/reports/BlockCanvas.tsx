// src/components/reports/BlockCanvas.tsx

import { useRef, useState } from 'react';
import type { BlockKey, BlockDataMap } from '../../types/report';
import { BLOCK_LABELS } from '../../types/report';
import ReportPreview from './ReportPreview';

interface Props {
  activeBlocks:  BlockKey[];
  blockData:     BlockDataMap;
  aiData:        Record<string, string>;
  previewing:    boolean;
  onRemove:      (key: BlockKey) => void;
  onReorder:     (ordered: BlockKey[]) => void;
  onEditNarrative: (key: string, value: string) => void;
  signoff?: {
    include:        boolean;
    prepared_by:    string;
    prepared_title: string;
    approved_by:    string;
    approved_title: string;
  };
}

export default function BlockCanvas({
  activeBlocks,
  blockData,
  aiData,
  previewing,
  onRemove,
  onReorder,
  onEditNarrative,
  signoff,
}: Props) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const dragKey = useRef<BlockKey | null>(null);

  function handleDragStart(key: BlockKey) {
    dragKey.current = key;
  }

  function handleDragOver(e: React.DragEvent, key: BlockKey) {
    e.preventDefault();
    setDragOver(key);
  }

  function handleDrop(e: React.DragEvent, targetKey: BlockKey) {
    e.preventDefault();
    const src = dragKey.current;
    if (!src || src === targetKey) { setDragOver(null); return; }
    const next = [...activeBlocks];
    const fromIdx = next.indexOf(src);
    const toIdx   = next.indexOf(targetKey);
    if (fromIdx === -1 || toIdx === -1) { setDragOver(null); return; }
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, src);
    onReorder(next);
    setDragOver(null);
    dragKey.current = null;
  }

  function handleDragEnd() {
    setDragOver(null);
    dragKey.current = null;
  }

  return (
    <div className="rb-canvas-wrap">
      {previewing && (
        <div className="rb-preview-overlay">
          <div className="spinner-ring" />
          <div className="rb-overlay-text">Building preview…</div>
        </div>
      )}

      <div className="rb-page">
        {activeBlocks.length === 0 && (
          <div className="rb-empty-canvas">
            Add sections from the left panel, then click Preview &amp; Edit to load live data.
          </div>
        )}

        {activeBlocks.map((key) => (
          <div
            key={key}
            className={`rb-block${dragOver === key ? ' drag-over' : ''}`}
            draggable
            onDragStart={() => handleDragStart(key)}
            onDragOver={(e) => handleDragOver(e, key)}
            onDrop={(e) => handleDrop(e, key)}
            onDragEnd={handleDragEnd}
          >
            <div className="rb-block-head">
              <span>{BLOCK_LABELS[key] ?? key}</span>
              <div className="rb-block-actions">
                <span
                  className="rb-remove"
                  onClick={() => onRemove(key)}
                  title="Remove block"
                >×</span>
                <span className="rb-drag" title="Drag to reorder">⋮⋮</span>
              </div>
            </div>
            <div className="rb-block-body">
              <ReportPreview
                blockKey={key}
                blockData={blockData}
                aiData={aiData}
                onEdit={onEditNarrative}
              />
            </div>
          </div>
        ))}

        {(signoff?.include && (signoff.prepared_by || signoff.approved_by)) && (
          <div className="rb-signoff">
            {signoff.prepared_by && (
              <div className="rb-signoff-line">
                <strong>Prepared by:</strong> {[signoff.prepared_by, signoff.prepared_title].filter(Boolean).join(', ')}
              </div>
            )}
            {signoff.approved_by && (
              <div className="rb-signoff-line">
                <strong>Approved by:</strong> {[signoff.approved_by, signoff.approved_title].filter(Boolean).join(', ')}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}