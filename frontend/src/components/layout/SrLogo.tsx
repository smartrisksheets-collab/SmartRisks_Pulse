import { useState } from 'react';

interface Props {
  size?: number;
  borderRadius?: number;
  alt?: string;
}

export function SrLogo({ size = 36, borderRadius = 8, alt = 'SmartRisk Pulse' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        xmlns="http://www.w3.org/2000/svg"
        aria-label={alt}
        style={{ borderRadius, flexShrink: 0 }}
      >
        <rect width="36" height="36" rx={borderRadius} fill="#1F2854" />
        <text
          x="18" y="24"
          textAnchor="middle"
          fill="#01b88e"
          fontSize="14"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
          letterSpacing="-0.5"
        >SR</text>
      </svg>
    );
  }

  return (
    <img
      src="https://smartrisksheets.com/wp-content/uploads/2025/09/cropped-Smartrisksheets-favicon-v2.png"
      width={size}
      height={size}
      alt={alt}
      style={{ borderRadius, flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}