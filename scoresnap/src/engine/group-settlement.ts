import { calculateContestSettlement } from './contest-results';
export const calculateGroupSettlements = (contest: any, games?: any, bet?: number) => ({groups: [], allGroups: calculateContestSettlement(contest, games, bet)});
