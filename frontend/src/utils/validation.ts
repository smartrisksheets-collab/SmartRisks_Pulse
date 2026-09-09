// src/utils/validation.ts

export type PasswordStrength = 'weak' | 'fair' | 'strong';

export function validateEmail(value: string): string {
  const v = value.trim();
  if (!v) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  return '';
}

export function validatePassword(value: string): string {
  if (!value) return 'Password is required';
  if (value.length < 8) return 'At least 8 characters required';
  if (!/[A-Z]/.test(value)) return 'Must include at least one uppercase letter';
  if (!/[a-z]/.test(value)) return 'Must include at least one lowercase letter';
  if (!/\d/.test(value)) return 'Must include at least one number';
  if (!/[^a-zA-Z0-9]/.test(value)) return 'Must include at least one special character';
  return '';
}

export interface PasswordRuleState {
  length: boolean;
  upper: boolean;
  lower: boolean;
  digit: boolean;
  special: boolean;
}

export function getPasswordRules(value: string): PasswordRuleState {
  return {
    length:  value.length >= 8,
    upper:   /[A-Z]/.test(value),
    lower:   /[a-z]/.test(value),
    digit:   /\d/.test(value),
    special: /[^a-zA-Z0-9]/.test(value),
  };
}

export function validateConfirm(value: string, against: string): string {
  if (!value) return 'Please confirm your password';
  if (value !== against) return 'Passwords do not match';
  return '';
}

export function validateName(value: string): string {
  const v = value.trim();
  if (!v) return 'Full name is required';
  if (v.length < 2) return 'Name must be at least 2 characters';
  return '';
}

export function getPasswordStrength(value: string): PasswordStrength | '' {
  if (!value || value.length < 8) return value ? 'weak' : '';
  let score = 0;
  if (/[a-z]/.test(value)) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;
  if (score <= 1) return 'weak';
  if (score <= 2) return 'fair';
  return 'strong';
}