import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from './api';
import type {
  OnboardingData, OnboardingDraft, OnboardingFinishResult, OnboardingOptions,
} from '../types/onboarding';

export const getOnboardingOptions = () => apiGet<OnboardingOptions>('/api/v1/onboarding/options');
export const getOnboardingDraft = () => apiGet<OnboardingDraft | null>('/api/v1/onboarding/draft');
export const saveOnboardingDraft = (step: number, data: OnboardingData) =>
  apiPut<OnboardingDraft>('/api/v1/onboarding/draft', { step, data });
export const finishOnboarding = () => apiPost<OnboardingFinishResult>('/api/v1/onboarding/finish');

// Sector list and wizard defaults. Settings uses the same sectors.
export function useOnboardingOptions() {
  return useQuery({
    queryKey: ['onboarding', 'options'],
    queryFn: getOnboardingOptions,
    staleTime: 60 * 60 * 1000,
  });
}
