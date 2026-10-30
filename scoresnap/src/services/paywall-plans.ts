import Purchases, { INTRO_ELIGIBILITY_STATUS, type PurchasesPackage } from 'react-native-purchases';
export const PLAN_OPTIONS = [
  {tier:'pro', name:'Pro', features:'All 30 game modes · Unlimited cloud scans · Settlement · Statistics', options:[{key:'annual',fallback:'$24.99',period:'year'},{key:'monthly',fallback:'$3.99',period:'month'}]},
  {tier:'td', name:'Tournament Director', features:'Everything in Pro · Host multiple groups and rounds · Players always join and score free', options:[{key:'td_annual',fallback:'$79.99',period:'year'},{key:'td_monthly',fallback:'$12.99',period:'month'}]},
] as const;
export async function eligibleAnnualTrials(packages: Record<string, PurchasesPackage | null>): Promise<Record<string, boolean>> {
  const annuals = [packages.annual, packages.td_annual].filter((p): p is PurchasesPackage => !!p);
  if (!annuals.length) return {};
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(annuals.map(p=>p.product.identifier));
    return Object.fromEntries(annuals.map(p=>[p.product.identifier,
      result[p.product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE &&
      p.product.introPrice?.price === 0 && p.product.introPrice?.periodUnit === 'DAY' && p.product.introPrice?.periodNumberOfUnits === 7]));
  } catch { return {}; }
}
