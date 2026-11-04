type OnboardingGateOptions = {
  hasCompletedOnboarding: boolean;
  crossDeviceSharingEnabled: boolean;
  hasSession: boolean;
  isAnonymous: boolean;
  remoteUserId: string | null;
};

export function isAppReadyForSession(options: OnboardingGateOptions): boolean {
  return options.hasCompletedOnboarding || (
    options.crossDeviceSharingEnabled && (
      (options.hasSession && !options.isAnonymous) ||
      (options.isAnonymous && !!options.remoteUserId)
    )
  );
}
