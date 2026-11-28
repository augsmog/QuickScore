// The Pay-up ticket: the share image Augie picked ("the 3rd option", AUG-1601, 2026-11-27).
// These tests pin what goes on it; every amount comes from the settlement, never recomputed.
const loader = require('./helpers/load-ts.cjs');
const { buildTicketModel, netPayments, shortName, playedOn } = loader({})('src/ui/share/pay-up-ticket-model.ts');

const details = { title: 'Thursday round', course: 'Royal Greens Golf & Country Club (Purple)', playedAt: new Date(2026, 9, 29, 11, 4).toISOString(), games: ['skins'], betUnit: 5 };
const tx = (from, to, amount, gameType = 'skins') => ({ from, to, amount, gameType });

test('the two-player card Augie picked: one payment, both standings, round details', () => {
  const model = buildTicketModel({ transactions: [tx('Augie', 'Matt', 5)], netByPlayer: { Matt: 5, Augie: -5 } }, details);
  expect(model).toMatchObject({
    heading: 'PAY UP · THURSDAY ROUND', allSquare: false, more: 0,
    payments: [{ from: 'Augie', to: 'Matt', amount: '$5.00' }],
    finish: [{ name: 'Matt', amount: '+$5.00', tone: 'up' }, { name: 'Augie', amount: '−$5.00', tone: 'down' }],
    course: 'Royal Greens Golf & Country Club (Purple)', played: '29 Oct 2026', game: '1 game · $5 a unit',
    note: 'No hard feelings. Rematch?', download: 'snapscore.autumn8.me',
  });
});

test('a foursome: one line per pair of players, netted across games, biggest first', () => {
  const settlement = { netByPlayer: { Matt: 35, Augie: 10, Chris: -15, Dave: -30 }, transactions: [
    tx('Dave', 'Matt', 20, 'skins'), tx('Dave', 'Matt', 10, 'nassau'), tx('Matt', 'Dave', 5, 'nassau'),
    tx('Chris', 'Matt', 10, 'skins'), tx('Dave', 'Augie', 5, 'nassau'), tx('Chris', 'Augie', 5, 'skins')] };
  const model = buildTicketModel(settlement, { ...details, games: ['skins', 'nassau'] });
  expect(model.payments).toEqual([
    { from: 'Dave', to: 'Matt', amount: '$25.00' }, { from: 'Chris', to: 'Matt', amount: '$10.00' },
    { from: 'Chris', to: 'Augie', amount: '$5.00' }, { from: 'Dave', to: 'Augie', amount: '$5.00' }]);
  expect(model.finish.map(f => `${f.name} ${f.amount}`)).toEqual(['Matt +$35.00', 'Augie +$10.00', 'Chris −$15.00', 'Dave −$30.00']);
  expect(model.game).toBe('2 games · $5 a unit');
});

test('payments that cancel out disappear; fractions of a cent never print', () => {
  expect(netPayments([tx('A', 'B', 5), tx('B', 'A', 5)])).toEqual([]);
  expect(netPayments([tx('A', 'B', 1.25), tx('A', 'B', 1.255)])).toEqual([{ from: 'A', to: 'B', amount: 2.51 }]);
});

test('nobody owes: the card says so instead of listing zero payments', () => {
  const model = buildTicketModel({ transactions: [], netByPlayer: { Matt: 0, Augie: 0 } }, details);
  expect(model).toMatchObject({ heading: 'ALL SQUARE · THURSDAY ROUND', allSquare: true, payments: [], note: 'Play it again to settle it?' });
  expect(model.finish).toEqual([{ name: 'Augie', amount: '$0.00', tone: 'even' }, { name: 'Matt', amount: '$0.00', tone: 'even' }]);
});

test('more than five payments: five lines and a count of the rest', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const transactions = names.slice(1).map((n, i) => tx(n, 'A', 10 - i));
  const model = buildTicketModel({ transactions, netByPlayer: Object.fromEntries(names.map(n => [n, 0])) }, details);
  expect(model.payments).toHaveLength(5);
  expect(model.payments[0]).toEqual({ from: 'B', to: 'A', amount: '$10.00' });
  expect(model.more).toBe(2);
  // Five payment lines leave room for three standings; the rest are counted, not dropped silently.
  expect(model.finish).toHaveLength(3);
  expect(model.moreFinish).toBe(5);
});

test('a foursome with four payments still shows all four standings', () => {
  const settlement = { netByPlayer: { Matt: 35, Augie: 10, Chris: -15, Dave: -30 }, transactions: [tx('Dave', 'Matt', 25), tx('Chris', 'Matt', 10), tx('Dave', 'Augie', 5), tx('Chris', 'Augie', 5)] };
  const model = buildTicketModel(settlement, details);
  expect(model.finish).toHaveLength(4);
  expect(model.moreFinish).toBe(0);
});

test('long full names shorten to first name and last initial on payment lines only', () => {
  expect(shortName('Matt')).toBe('Matt');
  expect(shortName('Augustine Jones')).toBe('Augustine J.');
  expect(shortName('Maximilian Oberholtzer')).toBe('Maximilian O.');
  expect(shortName('Bartholomew')).toBe('Bartholomew');
  expect(shortName('Mary Jo Van Der Berg')).toBe('Mary B.');
  const model = buildTicketModel({ transactions: [tx('Maximilian Oberholtzer', 'Christopher Vandenberghe', 30)],
    netByPlayer: { 'Christopher Vandenberghe': 30, 'Maximilian Oberholtzer': -30 } }, details);
  expect(model.payments[0]).toEqual({ from: 'Maximilian O.', to: 'Christopher V.', amount: '$30.00' });
  expect(model.finish[0].name).toBe('Christopher Vandenberghe');
});

test('the date reads the same on every phone, and a missing date leaves the line out', () => {
  expect(playedOn('2026-01-05')).toBe('5 Jan 2026');
  // A timestamp shows the day it was on this phone: an evening round is not dated tomorrow.
  const evening = new Date(2026, 9, 29, 21, 30);
  expect(playedOn(evening.toISOString())).toBe('29 Oct 2026');
  expect(playedOn(new Date(2026, 10, 14, 0, 5).toISOString())).toBe('14 Nov 2026');
  expect(playedOn(undefined)).toBe('');
  expect(playedOn('not a date')).toBe('');
});

test('an unfinished settlement makes no card', () => {
  expect(buildTicketModel({ transactions: [], netByPlayer: { Matt: 0 }, pending: true }, details)).toBeNull();
});
