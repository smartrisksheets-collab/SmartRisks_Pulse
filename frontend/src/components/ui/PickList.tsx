// src/components/ui/PickList.tsx
// Searchable single-choice list drawn by the app, so the open list uses the
// app font. A native <select> popup is drawn by the browser and cannot load
// the web font. Only values from `options` can be chosen.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

export interface PickOption {
  value: string;
  label: string;
}

interface Props {
  id: string;
  value: string;
  options: PickOption[];
  placeholder: string;
  /** Label for an empty choice at the top of the list. Leave out to hide it. */
  emptyLabel?: string;
  invalid?: boolean;
  dataField?: string;
  onChange: (value: string) => void;
  /** Called when the list closes without a choice. */
  onClose?: () => void;
}

export default function PickList({ id, value, options, placeholder, emptyLabel, invalid, dataField, onChange, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const q = query.trim().toLowerCase();
  const all: PickOption[] = emptyLabel !== undefined ? [{ value: '', label: emptyLabel }, ...options] : options;
  const shown = q ? all.filter(o => o.value !== '' && o.label.toLowerCase().includes(q)) : all;
  const selected = options.find(o => o.value === value);

  function hide(refocus: boolean) {
    setOpen(false);
    setQuery('');
    if (refocus) btnRef.current?.focus();
  }

  // Closed without a choice: let the caller validate the current value.
  function close(refocus: boolean) {
    hide(refocus);
    onClose?.();
  }

  function choose(o: PickOption) {
    onChange(o.value);
    hide(true);
  }

  function openList() {
    const at = all.findIndex(o => o.value === value);
    setActive(at < 0 ? 0 : at);
    setOpen(true);
  }

  // Close on a click outside the control.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  // Keep the active option in view while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    else if (e.key === 'Tab') close(false);
  }

  function onButtonKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openList(); }
  }

  return (
    <div className="pl-pick" ref={wrapRef}>
      <button
        id={id}
        ref={btnRef}
        type="button"
        data-field={dataField}
        className={`pl-input pl-pick-btn${invalid ? ' invalid' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={onButtonKey}
      >
        <span className={selected ? 'pl-pick-val' : 'pl-pick-val pl-pick-ph'}>
          {selected ? selected.label : value || placeholder}
        </span>
        <span className="pl-pick-caret" aria-hidden="true" />
      </button>
      {open && (
        <div className="pl-menu pl-pick-menu">
          <input
            className="pl-input"
            type="search"
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            aria-label="Search the list"
            placeholder="Type to search"
            value={query}
            onChange={e => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={onSearchKey}
          />
          <ul id={listId} ref={listRef} className="pl-pick-list" role="listbox" aria-label={placeholder}>
            {shown.length === 0 && <li className="pl-caption pl-pick-none">No matches.</li>}
            {shown.map((o, i) => (
              <li
                key={o.value || '__empty'}
                id={`${listId}-${i}`}
                data-i={i}
                role="option"
                aria-selected={o.value === value}
                className={`pl-menu-item pl-pick-opt${i === active ? ' pl-on' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => { e.preventDefault(); choose(o); }}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
