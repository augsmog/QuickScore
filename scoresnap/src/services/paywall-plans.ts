import Purchases, { INTRO_ELIGIBILITY_STATUS, type PurchasesPackage } from 'react-native-purchases';
export const PLAN_OPTIONS = [
  {tier:'pro', name:'Pro', features:'Games and variants · Unlimited cloud scans · Settlement · Statistics', options:[{key:'annual',fallback:'$24.99',period:'year'},{key:'monthly',fallback:'$3.99',period:'month'}]},
  {tier:'td', name:'Tournament Director', features:'Everything in Pro · Host multiple groups and rounds · Players always join and score free', options:[{key:'td_annual',fallback:'$79.99',period:'year'},{key:'td_monthly',fallback:'$12.99',period:'month'}]},
] as const;
/**
 * AUG-1263 (owner t1517u, Nov 18 2026): Tournament Director has NO free trial. Only the Pro annual
 * product can ever be reported trial-eligible, and Pro is dormant while pro_enabled is off. The TD
 * annual package is never queried and is always reported false, even if a stale App Store Connect
 * or RevenueCat intro offer still exists on it.
 */
export async function eligibleAnnualTrials(packages: Record<string, PurchasesPackage | null>): Promise<Record<string, boolean>> {
  const annuals = [packages.annual].filter((p): p is PurchasesPackage => !!p);
  const td: Record<string, boolean> = packages.td_annual ? {[packages.td_annual.product.identifier]: false} : {};
  if (!annuals.length) return td;
  try {
    const result = await Purchases.checkTrialOrIntroductoryPriceEligibility(annuals.map(p=>p.product.identifier));
    return {...td, ...Object.fromEntries(annuals.map(p=>[p.product.identifier,
      result[p.product.identifier]?.status === INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE &&
      p.product.introPrice?.price === 0 && p.product.introPrice?.periodUnit === 'DAY' && p.product.introPrice?.periodNumberOfUnits === 7]))};
  } catch { return {}; }
}

import { PAYWALL_COPY as C } from '../ui/paywall-copy';
import type { Tier } from './entitlements';
export type PaywallSelection = { tier: Tier; period: 'year' | 'month' };
const format = (template: string, price: string, period: string) => template.replace('{price}', price).replace('{period}', period);
/**
 * AUG-1263: proEnabledNow defaults to true so every caller that predates the pro_enabled flag
 * (including existing tests) keeps seeing both plans unchanged. The real app passes the live
 * proEnabled() so the Pro row -- unpurchasable while the flag is off -- never reaches someone
 * shopping for Tournament Director. tier==='pro' still shows an existing raw Pro subscriber their
 * own plan. The `?? rows[rows.length - 1]` fallback covers a selection pointed at a now-hidden
 * plan (e.g. the default 'pro' selection reaching this with the flag off) without throwing.
 */
export function buildPaywallView(packages: Record<string, PurchasesPackage | null> | null, eligible: Record<string, boolean>, tier: Tier, selection: PaywallSelection, proEnabledNow = true) {
  const period = selection.period;
  const visiblePlans = PLAN_OPTIONS.filter(plan => plan.tier !== 'pro' || proEnabledNow || tier === 'pro');
  const rows = [
    { tier: 'free' as Tier, name: C.free, body: proEnabledNow ? C.freeBody : C.freeBodyNoPro, tag: tier === 'free' ? C.current : '', alternate: '', price: '', trial: '', key: '', selected: selection.tier === 'free' },
    ...visiblePlans.map(plan => {
      const option = plan.options[period === 'year' ? 0 : 1];
      const other = plan.options[period === 'year' ? 1 : 0];
      const pkg = packages?.[option.key];
      return { tier: plan.tier as Tier, name: plan.tier === 'pro' ? C.pro : C.td, body: plan.tier === 'td' ? (proEnabledNow ? C.tdBody : C.tdBodyNoPro) : '',
        tag: tier === plan.tier ? C.current : plan.tier === 'pro' ? C.recommended : '',
        alternate: format(C.alternate, packages?.[other.key]?.product.priceString || other.fallback, other.period),
        price: format(C.price, pkg?.product.priceString || option.fallback, period),
        trial: plan.tier === 'pro' && period === 'year' && pkg && eligible[pkg.product.identifier] === true ? C.trial : '',
        key: option.key, selected: selection.tier === plan.tier };
    }),
  ];
  const selected = rows.find(row => row.selected) ?? rows[rows.length - 1];
  const pkg = packages?.[selected.key] ?? null;
  const owned = tier === 'td' || (tier === 'pro' && selection.tier === 'pro');
  const disabled = selection.tier === 'free' || owned || !pkg;
  const cta = selection.tier === 'free' || owned ? C.current : !pkg ? C.unavailable :
    tier === 'pro' && selection.tier === 'td' ? C.upgrade.replace('{price}/{period}', selected.price) :
    selected.trial ? C.startTrial : C.subscribe.replace('{price}/{period}', selected.price);
  const billed = selection.tier === 'free' ? '' : selected.trial && tier === 'free' ?
    C.then.replace('{price}/year', selected.price) : period === 'year' ? C.yearlyRenew : C.monthlyRenew;
  const values = [
    { icon: 'contest' as const, title: C.contestTitle, body: C.contestBody },
    { icon: 'library' as const, title: C.libraryTitle, body: C.libraryBody },
    { icon: 'live' as const, title: C.liveTitle, body: C.liveBody },
  ];
  return { restore: C.restore, eyebrow: proEnabledNow ? C.eyebrow : C.eyebrowNoPro, headline: C.headline, values, scans: C.scans, rows, cta, billed,
    oneTrial: proEnabledNow ? C.oneTrial : '', legal: C.legal, terms: C.terms, dot: C.dot, privacy: C.privacy, disabled, package: pkg };
}
