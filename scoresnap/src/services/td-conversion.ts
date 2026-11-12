import { TD_ENTITLEMENT_ID } from "./entitlements";
import type { CustomerInfo } from "react-native-purchases";

export type TdPeriodType = "normal" | "trial" | "intro";
export type TdConversionEvent = {
  period_type: TdPeriodType;
  product_id: string;
  store: string;
};

type ConversionResult = { key: string; event: TdConversionEvent };

function periodType(value: string | undefined): TdPeriodType | null {
  switch (value?.toUpperCase()) {
    case "NORMAL":
    case "PREPAID":
      return "normal";
    case "TRIAL":
      return "trial";
    case "INTRO":
      return "intro";
    default:
      return null;
  }
}

/** Derive a conversion event from the raw RevenueCat entitlement, independent of feature gates. */
export function tdConversionEvent(
  previousSeenKey: string | null,
  info: CustomerInfo,
): ConversionResult | null {
  const entitlement = info.entitlements.active[TD_ENTITLEMENT_ID];
  if (!entitlement || !entitlement.isActive) return null;

  const period_type = periodType(entitlement.periodType);
  const product_id = entitlement.productIdentifier;
  const originalPurchaseDate = entitlement.originalPurchaseDate;
  const store = entitlement.store;
  if (!period_type || !product_id || !originalPurchaseDate || !store) return null;

  const key = [product_id, originalPurchaseDate, period_type].join("|");
  if (key === previousSeenKey) return null;
  return { key, event: { period_type, product_id, store } };
}
