/** Scope of the current localContestJoinService, regardless of connectivity. */
export function getLocalJoinLimitation() {
  return {
    title: "Same browser only",
    message: "This join code works on this device/browser, not another phone. Live cross-device sharing is coming.",
    sameBrowserOnly: true,
    crossDeviceSharing: false,
    canJoin: true,
    dismissible: false,
  } as const;
}
