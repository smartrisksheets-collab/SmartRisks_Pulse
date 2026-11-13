// src/components/home/SkyHero.tsx
// Greeting card with the sky for the time of day (the agreed gradient exception).
// The art comes from the partner's design pack; colours are part of the illustration.

import type { ReactNode } from 'react';
import type { DayPart } from './links';

const SKY: Record<DayPart, ReactNode> = {
  morning: (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 720 260" preserveAspectRatio="xMaxYMax slice" className="pl-sky-svg"><rect width="720" height="260" fill="#DDEEFB"/><g className="pl-sky-drift" fill="#ffffff"><ellipse cx="380" cy="62" rx="36" ry="12"/><ellipse cx="406" cy="53" rx="22" ry="14"/><ellipse cx="660" cy="44" rx="28" ry="9"/></g><g className="pl-sky-sunrise"><circle className="pl-sky-halo" cx="570" cy="108" r="44" fill="#FDEBB0"/><circle cx="570" cy="108" r="29" fill="#F8C04A"/></g><path d="M0 260 C 180 252 300 150 460 158 S 640 118 720 128 V260 H0Z" fill="#A7DCCB"/><path d="M120 260 C 300 252 420 190 560 188 S 680 172 720 168 V260 H120Z" fill="#01b88e"/><path d="M300 260 C 440 256 540 224 640 220 S 700 214 720 210 V260 H300Z" fill="#1F2854"/></svg>
  ),
  afternoon: (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 720 260" preserveAspectRatio="xMaxYMax slice" className="pl-sky-svg"><rect width="720" height="260" fill="#FFE6CC"/><g className="pl-sky-drift" fill="#ffffff" opacity="0.85"><rect x="340" y="56" width="74" height="8" rx="4"/><rect x="372" y="44" width="46" height="8" rx="4"/><rect x="630" y="122" width="58" height="8" rx="4"/></g><g transform="translate(300 16)"><g className="pl-sky-sunpath"><g className="pl-sky-rays" stroke="#F6A94B" strokeWidth="4" strokeLinecap="round"><path d="M270 70H282"/><path d="M258.3 98.3L266.8 106.8"/><path d="M230 110V122"/><path d="M201.7 98.3L193.2 106.8"/><path d="M190 70H178"/><path d="M201.7 41.7L193.2 33.2"/><path d="M230 30V18"/><path d="M258.3 41.7L266.8 33.2"/></g><circle className="pl-sky-halo" cx="230" cy="70" r="34" fill="#FBD38D"/><circle cx="230" cy="70" r="26" fill="#F6A94B"/></g></g><path d="M0 260 C 180 252 300 150 460 158 S 640 118 720 128 V260 H0Z" fill="#A7DCCB"/><path d="M120 260 C 300 252 420 190 560 188 S 680 172 720 168 V260 H120Z" fill="#01b88e"/><path d="M300 260 C 440 256 540 224 640 220 S 700 214 720 210 V260 H300Z" fill="#1F2854"/></svg>
  ),
  evening: (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 720 260" preserveAspectRatio="xMaxYMax slice" className="pl-sky-svg"><rect width="720" height="260" fill="#28336A"/><g fill="#ffffff"><g className="pl-sky-tw"><circle cx="330" cy="40" r="1.6"/><circle cx="500" cy="110" r="1.2"/><circle cx="690" cy="120" r="1.5"/><circle cx="420" cy="18" r="1.1"/></g><g className="pl-sky-tw2"><circle cx="400" cy="84" r="1.3"/><circle cx="640" cy="30" r="1.4"/><circle cx="460" cy="54" r="1.1"/></g><g className="pl-sky-tw3"><circle cx="540" cy="28" r="1.8"/><circle cx="360" cy="100" r="1.1"/><circle cx="700" cy="64" r="1.2"/></g></g><g transform="translate(300 18)"><g className="pl-sky-float"><circle className="pl-sky-glow" cx="270" cy="72" r="40" fill="#F5E6B8"/><circle cx="270" cy="72" r="27" fill="#F5E6B8"/><circle cx="283" cy="63" r="25" fill="#28336A"/></g></g><path d="M0 260 C 180 252 300 150 460 158 S 640 118 720 128 V260 H0Z" fill="#33407F"/><path d="M120 260 C 300 252 420 190 560 188 S 680 172 720 168 V260 H120Z" fill="#0B6B57"/><path d="M300 260 C 440 256 540 224 640 220 S 700 214 720 210 V260 H300Z" fill="#141c3a"/></svg>
  ),
};

interface Props {
  part: DayPart;
  initials: string;
  dateLine: string;
  greeting: string;
  children: ReactNode;
  tourOn?: boolean;
}

export default function SkyHero({ part, initials, dateLine, greeting, children, tourOn }: Props) {
  return (
    <section id="sec-verdict" className={`pl-hero pl-hero-${part}${tourOn ? ' pl-tour-on' : ''}`} aria-label="Greeting and overall verdict">
      <div className="pl-hero-body">
        <div className="pl-hero-who">
          <span className="pl-avatar pl-lg pl-hero-avatar">{initials}</span>
          <div className="pl-stack-0">
            <p className="pl-hero-date">{dateLine}</p>
            <h1 className="pl-hero-title">{greeting}</h1>
          </div>
        </div>
        {children}
      </div>
      <div className="pl-hero-scene" aria-hidden="true">
        {SKY[part]}
        <div className="pl-hero-fade" />
      </div>
    </section>
  );
}
