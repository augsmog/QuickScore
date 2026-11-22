// Regression test for AUG-538 (SCORESNAP-9 RevenueCat offerings error, AUG-68).
// getOfferings() must never throw into the UI: it returns null when purchases are
// not configured, and on a RevenueCat rejection it reports to Sentry and returns null.
// All native / app-internal imports are mocked so the module loads under the node jest env.

// The repository intentionally does not install @types/jest; Jest supplies these globals at runtime.
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: any;
declare const beforeEach: (fn: () => void) => void;
declare const jest: any;

const mockCaptureException = jest.fn();
const mockGetItem = jest.fn(async () => null);
const mockSetItem = jest.fn(async () => undefined);
const mockTrackEntitlement = jest.fn();
const mockPurchases = {
  setLogLevel: jest.fn(),
  configure: jest.fn(),
  addCustomerInfoUpdateListener: jest.fn(),
  getCustomerInfo: jest.fn(),
  getOfferings: jest.fn(),
};

jest.mock("react-native", () => ({
  Platform: { OS: "ios" },
  NativeModules: { RNPurchases: {} },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: (...args: any[]) => mockGetItem(...args), setItem: (...args: any[]) => mockSetItem(...args) },
}));
jest.mock("@sentry/react-native", () => ({ captureException: (...args: any[]) => mockCaptureException(...args) }));
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    setLogLevel: (...args: any[]) => mockPurchases.setLogLevel(...args),
    configure: (...args: any[]) => mockPurchases.configure(...args),
    addCustomerInfoUpdateListener: (...args: any[]) => mockPurchases.addCustomerInfoUpdateListener(...args),
    getCustomerInfo: (...args: any[]) => mockPurchases.getCustomerInfo(...args),
    getOfferings: (...args: any[]) => mockPurchases.getOfferings(...args),
  },
  LOG_LEVEL: { DEBUG: "DEBUG" },
  PURCHASES_ERROR_CODE: {},
}));
jest.mock("../../stores/scan-store", () => ({
  useScanStore: { getState: () => ({ setTier: () => undefined }) },
}));
jest.mock("../entitlements", () => ({ tierFromCustomerInfo: () => "free" }));
jest.mock("../../stores/persisted-keys", () => ({ TD_CONVERSION_SEEN_KEY: "td-seen" }));
jest.mock("../posthog-log", () => ({
  posthogAppLogger: { tournamentDirectorEntitlementStarted: (...args: any[]) => mockTrackEntitlement(...args) },
}));
jest.mock("../td-conversion", () => ({ tdConversionEvent: () => null }));

import { getOfferings, initPurchases } from "../purchases";

const OFFERING = { identifier: "default", availablePackages: [] };

describe("getOfferings (AUG-538 / SCORESNAP-9)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = false;
    process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY = "test-key";
    mockPurchases.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
  });

  it("returns null without calling RevenueCat when purchases are not configured", async () => {
    const result = await getOfferings();
    expect(result).toBeNull();
    expect(mockPurchases.getOfferings).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("returns the current offering after configuration", async () => {
    await initPurchases("user-1");
    mockPurchases.getOfferings.mockResolvedValue({ current: OFFERING });
    await expect(getOfferings()).resolves.toBe(OFFERING);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("swallows a RevenueCat rejection, reports it to Sentry, and returns null", async () => {
    const err = new Error("offerings fetch failed");
    mockPurchases.getOfferings.mockRejectedValue(err);
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(getOfferings()).resolves.toBeNull();
      expect(mockCaptureException).toHaveBeenCalledWith(err, {
        tags: { service: "purchases", action: "offerings" },
      });
    } finally {
      spy.mockRestore();
    }
  });
});
