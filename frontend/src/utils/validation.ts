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
  if (value.length < 8) return 'Password must be at least 8 characters';
  return '';
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