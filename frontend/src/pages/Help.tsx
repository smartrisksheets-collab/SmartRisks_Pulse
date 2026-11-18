// src/pages/Help.tsx
// The Help page reads the same registry as Ask Pulse and the "?" explainers,
// so an answer is written once and cannot disagree with itself.

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useHelpEntries } from "../hooks/useHelp";
import { logHelpEvent } from "../services/help";
import { ADMIN_PERMS } from "../utils/permissions";
import type { HelpEntry, HelpGroup } from "../types/help";
import { HELP_SUPPORT_EMAIL, canAct, lockedNote, searchHelp } from "../utils/helpSearch";
import { withBold } from "../utils/richText";

const ChevronDown = () => (
  <svg className="cv" width="17" height="17" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/** Order of sections on the page. */
const GROUP_ORDER: HelpGroup[] = [
  "Getting started", "Risk register", "Incidents", "Dashboard", "Reports",
  "Users & access", "Settings", "Methodology",
];

/** How-tos first within a section, then concepts, pages and settings. */
const KIND_ORDER = { "how-to": 0, concept: 1, page: 2, setting: 3 } as const;

function Answer({ entry, onGo }: { entry: HelpEntry; onGo: (route: string) => void }) {
  const perms   = useAuthStore((s) => s.claims?.permissions ?? null);
  const allowed = canAct(entry, perms);
  const note    = lockedNote(entry);
  return (
    <div className="hlp-a-in">
      <p className="hlp-a-what">{entry.what}</p>
      {(entry.steps ?? []).length > 0 && (
        <ol>{(entry.steps ?? []).map((s, k) => <li key={k}>{withBold(s)}</li>)}</ol>
      )}
      {entry.how && <p className="hlp-a-how">{withBold(entry.how)}</p>}
      {entry.where && <p className="hlp-where">{entry.where}</p>}
      {entry.route && allowed && (
        <button type="button" className="hlp-go" onClick={() => onGo(entry.route as string)}>
          Take me there →
        </button>
      )}
      {entry.route && !allowed && note && <p className="hlp-where">{note}</p>}
    </div>
  );
}

export default function Help() {
  const navigate = useNavigate();
  const { data: entries, isLoading, isError } = useHelpEntries();
  const [open, setOpen]     = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const term = search.trim();

  const sections = useMemo(() => {
    if (!entries) return [];
    if (term) return [{ group: null as HelpGroup | null, items: searchHelp(entries, term, 20) }];
    return GROUP_ORDER
      .map((group) => ({
        group,
        items: entries
          .filter((e) => e.group === group)
          .sort((a, b) => (KIND_ORDER[a.kind] ?? 1) - (KIND_ORDER[b.kind] ?? 1)),
      }))
      .filter((s) => s.items.length > 0);
  }, [entries, term]);

  const count = sections.reduce((n, s) => n + s.items.length, 0);

  function toggle(id: string) {
    setOpen((prev) => {
      if (prev !== id) logHelpEvent({ event: "open", entry_id: id });
      return prev === id ? null : id;
    });
  }

  return (
    <div className="page">
      <div className="hlp">

        <div className="hlp-head">
          <h1 className="hlp-h1">Help</h1>
          <p className="hlp-sub">Quick answers, guides, and support. Start here. Press Ctrl K anywhere to ask Pulse.</p>
        </div>

        {/* Quickstart */}
        <div className="hlp-start">
          <div className="hlp-start-t">New here? Start with these</div>
          <div className="hlp-start-grid">
            <button type="button" className="hlp-step" onClick={() => navigate("/risks")}>
              <span className="hlp-step-n">1</span>
              <span>
                <span className="hlp-step-t">Import your register</span>
                <span className="hlp-step-d">Bring the risk register you already keep. No re-keying.</span>
              </span>
            </button>
            <button type="button" className="hlp-step" onClick={() => navigate("/")}>
              <span className="hlp-step-n">2</span>
              <span>
                <span className="hlp-step-t">Read your health score</span>
                <span className="hlp-step-d">See your 0–100 health score and what is driving it.</span>
              </span>
            </button>
            <button type="button" className="hlp-step" onClick={() => navigate("/users")}>
              <span className="hlp-step-n">3</span>
              <span>
                <span className="hlp-step-t">Invite your risk owners</span>
                <span className="hlp-step-d">A register only stays live if the owners keep it updated.</span>
              </span>
            </button>
          </div>
        </div>

        {/* Answers, from the help registry */}
        <div className="hlp-card">
          <h2 className="hlp-card-h">Answers</h2>
          <p className="hlp-card-s">
            {entries ? `${entries.length} topics. Search, or browse by section.` : "Search, or browse by section."}
          </p>

          <div className="hlp-search-wrap">
            <span className="hlp-search-ic">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              className="hlp-search"
              type="text"
              placeholder="Try: how do I add a risk, import, appetite, invite my team…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setOpen(null); }}
              autoComplete="off"
              aria-label="Search help"
            />
          </div>

          {isLoading && <p className="hlp-card-s hlp-status">Loading answers…</p>}
          {isError && <p className="hlp-card-s hlp-status">Answers could not be loaded. Refresh the page.</p>}

          <div className="hlp-faqs">
            {sections.map((s) => (
              <div key={s.group ?? "results"}>
                {s.group && <h3 className="hlp-group">{s.group}</h3>}
                {s.items.map((e) => {
                  const isOpen = open === e.id;
                  return (
                    <div key={e.id} className={`hlp-faq${isOpen ? " open" : ""}`}>
                      <button className="hlp-q" type="button" aria-expanded={isOpen} onClick={() => toggle(e.id)}>
                        {e.title}
                        {e.requires && ADMIN_PERMS.has(e.requires) && <span className="hlp-badge">Admin only</span>}
                        <ChevronDown />
                      </button>
                      {isOpen && (
                        <div className="hlp-a">
                          <Answer entry={e} onGo={(r) => navigate(r)} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {entries && term && count === 0 && (
              <div className="hlp-empty show">
                No answers match that search. Try fewer words, or{" "}
                <a
                  className="lnk"
                  href={`mailto:${HELP_SUPPORT_EMAIL}?subject=${encodeURIComponent(`Pulse question: ${term}`)}`}
                  onClick={() => logHelpEvent({ event: "contact", query: term })}
                >
                  email us the question
                </a>.
              </div>
            )}
          </div>
        </div>

        {/* Escape hatches */}
        <div className="hlp-out">
          <a className="hlp-out-c" href="https://smartrisksheets.com/docs" target="_blank" rel="noopener noreferrer">
            <span className="hlp-out-ic">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </span>
            <span>
              <span className="hlp-out-t">Read the documentation</span>
              <span className="hlp-out-d">Full guides for the register, scoring methodology, reports and settings.</span>
            </span>
          </a>
          <a className="hlp-out-c solid" href="https://smartrisksheets.com/contact" target="_blank" rel="noopener noreferrer">
            <span className="hlp-out-ic">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </span>
            <span>
              <span className="hlp-out-t">Still stuck? Contact support</span>
              <span className="hlp-out-d">We reply to every message. Usually within one business day.</span>
            </span>
          </a>
        </div>

      </div>
    </div>
  );
}
