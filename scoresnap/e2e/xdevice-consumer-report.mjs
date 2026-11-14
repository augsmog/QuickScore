import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import metrics from './consumer-ux-metrics.cjs';

// Runs inside each browser document; keep self-contained for addInitScript.
export function observeConsumerActions() {
  const key = '__aug81_consumer_observations__';
  const read = () => { try { return JSON.parse(sessionStorage.getItem(key) || '[]'); } catch { return []; } };
  const record = event => { const events = read(); events.push(event); sessionStorage.setItem(key, JSON.stringify(events)); };
  document.addEventListener('click', event => {
    const element = event.target.closest('button,a,[role="button"],input,select,[data-testid]') || event.target;
    const rect = element.getBoundingClientRect();
    const label = element.getAttribute('aria-label') || element.getAttribute('placeholder') || element.innerText || element.getAttribute('data-testid') || element.tagName;
    record({ type: 'activate', label: String(label).replace(/\s+/g, ' ').trim().slice(0, 120), y: rect.top + window.scrollY, viewportHeight: window.innerHeight });
  }, true);
  let lastScroll = 0;
  document.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScroll > 250) { record({ type: 'scroll' }); lastScroll = now; }
  }, { capture: true, passive: true });
}

async function readObservations(page) {
  return page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem('__aug81_consumer_observations__') || '[]'); } catch { return []; }
  });
}

export class ObservationArchive {
  #events = new Map();
  #retired = new WeakSet();

  async archive(index, page) {
    if (this.#retired.has(page)) return;
    // Snapshot before closing; a failed read must remain retryable.
    const events = await readObservations(page);
    this.#events.set(index, [...(this.#events.get(index) || []), ...structuredClone(events)]);
    this.#retired.add(page);
  }

  async collect(pages) {
    return Promise.all(pages.map(async (page, index) => [
      ...(this.#events.get(index) || []),
      ...(this.#retired.has(page) ? [] : await readObservations(page)),
    ]));
  }
}

export async function writeConsumerReport({ pages, devices, out, observations }) {
  const events = await observations.collect(pages);
  const rows = metrics.summarize(events, devices.map(device => device.name));
  await Promise.all([
    writeFile(path.join(out, 'consumer-ux.json'), `${JSON.stringify({ simulation: true, entitlementFixture: 'disposable TD organizer; ordinary guest accounts', rows }, null, 2)}\n`),
    writeFile(path.join(out, 'consumer-ux.md'), metrics.toMarkdown(rows)),
  ]);
}
