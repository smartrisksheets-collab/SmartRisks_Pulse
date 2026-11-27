// Words and links for each Setup status step. Which steps apply and which are
// done come from GET /api/v1/home (setup.steps); this file only holds the copy.
import type { Permissions } from '../types/auth';
import type { SetupStepKey } from '../types/home';

export const SETUP_STATUS_LABEL = 'Setup status';
export const SETUP_ADMIN_NOTE = 'Your workspace admin does this step.';

export interface SetupLink { label: string; to: string }

export interface SetupStepCopy {
  title: string;
  text: string;
  doneNote: string;
  // What finishing the step switches on, shown in the What's left panel.
  unlocks: string;
  // Short button label in the What's left panel.
  go: string;
  // Permission needed for the buttons. null means anyone in the workspace.
  perm: keyof Permissions | null;
  cta?: SetupLink;
  alt?: SetupLink;
  // The second button opens the external incident link modal instead of a page.
  incidentLinkAlt?: boolean;
}

export const SETUP_STEP_COPY: Record<SetupStepKey, SetupStepCopy> = {
  workspace: {
    title: 'Create your workspace',
    text: 'Name, organisation and logo. Change them any time in Settings.',
    doneNote: 'Done',
    unlocks: '',
    go: '',
    perm: null,
  },
  matrix: {
    title: 'Choose your matrix and categories',
    text: 'Keep the SmartRisk default 5 × 5 matrix or set your own, then save the categories your risks fall into.',
    doneNote: 'Categories saved',
    unlocks: 'Switches on the Health score',
    go: 'Set',
    perm: 'manage_settings',
    cta: { label: 'Open categories', to: '/settings?tab=tax' },
    alt: { label: 'Open risk matrix', to: '/settings?tab=matrix' },
  },
  appetite: {
    title: 'Set your appetite',
    text: 'How much risk each category can carry before Home flags it.',
    doneNote: 'Appetite saved',
    unlocks: 'Switches on Outside appetite',
    go: 'Set',
    perm: 'manage_settings',
    cta: { label: 'Set appetite', to: '/settings?tab=appetite' },
  },
  risks: {
    title: 'Add your first risks',
    text: 'Type them in, import a spreadsheet, or share a submission link so departments can send risks without logging in.',
    doneNote: 'Risks added to the register',
    unlocks: 'Switches on Health score and Open actions',
    go: 'Add',
    perm: 'manage_risks',
    cta: { label: 'Add a risk', to: '/risks?new=1' },
    alt: { label: 'Share submission link', to: '/risks/submission-links' },
  },
  incidents: {
    title: 'Record incidents',
    text: 'Log an incident, or share the external link so staff can report one as it happens.',
    doneNote: 'Incident log started',
    unlocks: 'Switches on Open incidents',
    go: 'Log',
    perm: null,
    cta: { label: 'Log an incident', to: '/incidents' },
    alt: { label: 'Share incident link', to: '' },
    incidentLinkAlt: true,
  },
  team: {
    title: 'Invite your risk owners',
    text: 'Actions on Home go to named owners, so add the people who own each risk.',
    doneNote: 'Team members added',
    unlocks: 'Sends actions to named owners',
    go: 'Invite',
    perm: 'manage_users',
    cta: { label: 'Invite people', to: '/users' },
  },
};
