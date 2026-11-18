// Ask Pulse search: short, partial and question-style queries.
// Run: npm run test:search (Node 23.6 or later runs .ts files directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchHelp } from '../src/utils/helpSearch.ts';
import type { HelpEntry } from '../src/types/help.ts';

function entry(id: string, title: string, what: string, keywords: string[]): HelpEntry {
  return {
    id, title, what, keywords, how: null, where: null, route: null, requires: null,
    group: 'Getting started', kind: 'how-to', steps: [], module: null, related: [],
  };
}

// Titles, descriptions and keywords copied from backend/app/services/help_registry.py.
const ENTRIES: HelpEntry[] = [
  entry("add-risk", "Add a risk", "Log a new risk on the register and have Pulse score it.", ["add risk", "new risk", "create risk", "log risk", "first risk", "enter risk", "record risk"]),
  entry("edit-risk", "Edit or update a risk", "Change a risk's details or re-score it.", ["edit risk", "update risk", "change risk", "rescore", "re-score", "modify"]),
  entry("export-register", "Export or print the register", "Download the register as a spreadsheet or print it.", ["export", "download", "csv", "print register", "spreadsheet", "extract"]),
  entry("export-report", "Export a board report", "Produce a PDF or PowerPoint report for management or the board.", ["print report", "export report", "board pack", "management report", "download report"]),
  entry("invite-users", "Invite your team", "Give colleagues access to the workspace.", ["invite", "add user", "team", "colleague", "users", "access", "onboard staff"]),
  entry("risk-appetite", "Risk appetite", "The level of residual risk your organisation has agreed to accept, set per risk category.", ["appetite", "tolerance", "threshold", "limit", "breach", "exceeds", "within", "near"]),
  entry("recycle-bin", "Recycle bin", "Where deleted risks go, so a mistake can be undone.", ["recycle", "bin", "deleted", "restore", "undo", "trash", "recover", "delete risk"]),
  entry("severity", "Severity (inherent risk)", "How bad a risk could be before any controls are taken into account.", ["severity", "inherent", "gross risk", "likelihood", "impact", "before controls", "difference", "severity vs residual"]),
];

const top = (q: string): string | undefined => searchHelp(ENTRIES, q)[0]?.id;

test('a single action word finds its entry', () => {
  assert.equal(top('add'), 'add-risk');
  assert.equal(top('export'), 'export-register');
  assert.equal(top('edit'), 'edit-risk');
  assert.equal(top('change'), 'edit-risk');
  assert.equal(top('invite'), 'invite-users');
});

test('short subject phrases rank the action entry first', () => {
  assert.equal(top('add a risk'), 'add-risk');
  assert.equal(top('add risk'), 'add-risk');
  assert.equal(top('new risk'), 'add-risk');
  assert.equal(top('create risk'), 'add-risk');
  assert.equal(top('update risk'), 'edit-risk');
  assert.equal(top('change a risk'), 'edit-risk');
  assert.equal(top('add a user'), 'invite-users');
  assert.equal(top('delete a risk'), 'recycle-bin');
});

test('full questions give the same answer as the short form', () => {
  assert.equal(top('how do I add a risk'), 'add-risk');
  assert.equal(top('How do I add a risk?'), 'add-risk');
  assert.equal(top('how do i export'), 'export-register');
  assert.equal(top('how can I edit a risk'), 'edit-risk');
});

test('partial words while typing still return results', () => {
  assert.ok(searchHelp(ENTRIES, 'ad').length > 0);
  assert.equal(top('add a'), 'add-risk');
  assert.equal(top('how do i add'), 'add-risk');
  assert.equal(top('add a ris'), 'add-risk');
  assert.equal(top('expo'), 'export-register');
  assert.equal(top('inv'), 'invite-users');
});

test('filler-only and empty queries return nothing', () => {
  assert.deepEqual(searchHelp(ENTRIES, ''), []);
  assert.deepEqual(searchHelp(ENTRIES, '   '), []);
  assert.deepEqual(searchHelp(ENTRIES, 'how do i'), []);
});
