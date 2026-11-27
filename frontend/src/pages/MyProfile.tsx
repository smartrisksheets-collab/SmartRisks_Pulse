// src/pages/MyProfile.tsx
// My profile: your own first and last name and photo. The email is shown
// read-only. Account level, so every signed-in member can open it.

import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { PROFILE_KEY, removePhoto, updateProfile, uploadPhoto, useProfile } from '../services/profile';
import { initialsOf } from '../components/home/links';
import { validateFirstName, validateLastName } from '../utils/validation';
import type { Profile } from '../types/profile';

const errorText = (err: unknown, fallback: string): string =>
  err instanceof Error && err.message ? err.message : fallback;

export default function MyProfile() {
  const queryClient = useQueryClient();
  const { data: profile, isLoading, isError } = useProfile();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // The top bar and Home greeting read the same account, so refresh them too.
  const done = (next: Profile, text: string) => {
    queryClient.setQueryData(PROFILE_KEY, next);
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'home'] });
    setMessage({ ok: true, text });
  };

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    setMessage(null);
    try {
      done(await uploadPhoto(file), 'Your photo is saved.');
    } catch (err: unknown) {
      setMessage({ ok: false, text: errorText(err, 'Your photo could not be uploaded.') });
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemove() {
    setPhotoBusy(true);
    setMessage(null);
    try {
      done(await removePhoto(), 'Your photo is removed.');
    } catch (err: unknown) {
      setMessage({ ok: false, text: errorText(err, 'Your photo could not be removed.') });
    } finally {
      setPhotoBusy(false);
    }
  }

  if (isLoading) return <div className="pl-app pl-profile-page"><p className="pl-note">Loading your profile…</p></div>;
  if (isError || !profile) {
    return <div className="pl-app pl-profile-page"><p className="pl-note pl-alert" role="alert">Your profile could not be loaded. Refresh the page to try again.</p></div>;
  }

  const initials = initialsOf(`${profile.first_name} ${profile.last_name}`.trim() || profile.email);

  return (
    <div className="pl-app pl-profile-page">
      <p className="pl-intro">How you appear to your team in every workspace you belong to.</p>

      {message && (
        <p className={message.ok ? 'pl-note' : 'pl-note pl-alert'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>
      )}

      <section className="pl-card pl-stack" aria-label="Photo">
        <h2 className="pl-label">Photo</h2>
        <div className="pl-profile-photo">
          {profile.avatar_url
            ? <img className="pl-avatar pl-xl" src={profile.avatar_url} alt="Your profile photo" />
            : <span className="pl-avatar pl-xl" aria-hidden="true">{initials}</span>}
          <div className="pl-stack-xs">
            <div className="pl-inline">
              <button type="button" className="pl-btn pl-btn-secondary pl-btn-sm" disabled={photoBusy}
                onClick={() => fileRef.current?.click()}>
                {photoBusy ? 'Working…' : profile.avatar_url ? 'Change photo' : 'Upload photo'}
              </button>
              {profile.avatar_url && (
                <button type="button" className="pl-btn pl-btn-ghost pl-btn-sm" disabled={photoBusy} onClick={onRemove}>
                  Remove
                </button>
              )}
            </div>
            <p className="pl-body-s pl-profile-help">PNG, JPEG or WebP, up to 2 MB. Shown in the top bar. Never used in reports.</p>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPick} />
        </div>
      </section>

      <DetailsForm
        key={`${profile.first_name}|${profile.last_name}`}
        profile={profile}
        onSaved={next => done(next, 'Your name is saved.')}
        onFailed={text => setMessage({ ok: false, text })}
        onStart={() => setMessage(null)}
      />
    </div>
  );
}

// Starts from the saved names; the key above resets it after each save.
function DetailsForm({ profile, onSaved, onFailed, onStart }: {
  profile: Profile;
  onSaved: (next: Profile) => void;
  onFailed: (text: string) => void;
  onStart: () => void;
}) {
  const [first, setFirst] = useState(profile.first_name);
  const [last, setLast] = useState(profile.last_name);
  const [errors, setErrors] = useState({ first: '', last: '' });
  const [saving, setSaving] = useState(false);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    const next = { first: validateFirstName(first), last: validateLastName(last) };
    setErrors(next);
    if (next.first || next.last) return;
    setSaving(true);
    onStart();
    try {
      onSaved(await updateProfile(first, last));
    } catch (err: unknown) {
      onFailed(errorText(err, 'Your name could not be saved.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="pl-card pl-stack" aria-label="Your details" onSubmit={onSave} noValidate>
      <h2 className="pl-label">Your details</h2>
      <div className="pl-profile-names">
        <label className="pl-field">
          <span className="pl-field-label">First name</span>
          <input className={`pl-input${errors.first ? ' invalid' : ''}`} value={first} maxLength={80}
            autoComplete="given-name" onChange={e => setFirst(e.target.value)} />
          {errors.first && <p className="pl-field-error">{errors.first}</p>}
        </label>
        <label className="pl-field">
          <span className="pl-field-label">Last name</span>
          <input className={`pl-input${errors.last ? ' invalid' : ''}`} value={last} maxLength={80}
            autoComplete="family-name" onChange={e => setLast(e.target.value)} />
          {errors.last && <p className="pl-field-error">{errors.last}</p>}
        </label>
      </div>
      <label className="pl-field">
        <span className="pl-field-label">Email</span>
        <input className="pl-input" value={profile.email} readOnly aria-readonly="true" />
        <span className="pl-body-s pl-profile-help">Your sign-in email can't be changed here.</span>
      </label>
      <button type="submit" className="pl-btn pl-btn-primary pl-self-start" disabled={saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}
