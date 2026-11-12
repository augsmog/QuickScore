import {focusedSetup,focusedCases} from './focused-cases.mjs';
import * as settlement from './settlement-cases.mjs';
import {visible,stablePaint} from './acceptance-common.mjs';
export async function acceptanceSetup(...args){return await focusedSetup(...args)||await settlement.acceptanceSetup(...args);}
export async function acceptanceReady(page,id){if(id==='profile'||id==='settings'){await visible(id==='profile'?page.getByTestId('profile-settings-gear'):page.getByText('Account settings',{exact:true}));await stablePaint(page);return true;}return settlement.acceptanceReady(page,id);}
export const acceptanceCases={...settlement.acceptanceCases,...focusedCases};
