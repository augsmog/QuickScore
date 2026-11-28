// Sharing the Pay-up ticket image: capture at 1080×1350, hand the file to the share sheet,
// and report failure instead of throwing so the screen can fall back to the text result.
const loader = require('./helpers/load-ts.cjs');
const { sharePayUpTicket } = loader({ '../ui/share/PayUpTicket': { TICKET_CAPTURE: { width: 1080, height: 1350 } } })('src/services/share-pay-up-ticket.ts');
const deps = (over = {}) => ({ capture: jest.fn(async () => 'file:///tmp/ticket.png'), available: jest.fn(async () => true), share: jest.fn(async () => {}), ...over });

test('captures a 1080×1350 PNG and shares that file', async () => {
  const d = deps(); const view = {};
  expect(await sharePayUpTicket(view, 'Thursday round', d)).toBe(true);
  expect(d.capture).toHaveBeenCalledWith(view, { format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1350 });
  expect(d.share).toHaveBeenCalledWith('file:///tmp/ticket.png', { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Thursday round' });
});

test.each([
  ['no view mounted', undefined, {}],
  ['sharing unavailable on this device', {}, { available: jest.fn(async () => false) }],
  ['capture fails', {}, { capture: jest.fn(async () => { throw Error('capture failed'); }) }],
  ['capture returns nothing', {}, { capture: jest.fn(async () => '') }],
  ['share sheet fails', {}, { share: jest.fn(async () => { throw Error('share failed'); }) }],
])('%s: reports false and never throws', async (_name, view, over) => {
  const d = deps(over);
  await expect(sharePayUpTicket(view, 'Round', d)).resolves.toBe(false);
  if (!view || over.available || over.capture) expect(d.share).not.toHaveBeenCalled();
});
