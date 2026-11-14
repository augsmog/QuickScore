'use strict';

const PERSONAS = [
  'group organizer',
  'casual first-time guest',
  'older player',
  'scorekeeper',
];

function summarize(eventsByDevice, devices) {
  return eventsByDevice.map((events, index) => {
    const actions = events.filter(event => event.type === 'activate');
    const scrolls = events.filter(event => event.type === 'scroll');
    const targets = actions.map(({ label, y, viewportHeight }) => ({
      label,
      y,
      aboveFold: Number.isFinite(y) && Number.isFinite(viewportHeight)
        ? y >= 0 && y < viewportHeight
        : null,
    }));
    return {
      persona: PERSONAS[index] || `participant ${index + 1}`,
      device: devices[index],
      activations: actions.length,
      scrolls: scrolls.length,
      targets,
      findability: 'NOT ASSESSED: browser automation cannot infer human first-impression discovery',
    };
  });
}

function toMarkdown(rows) {
  const lines = [
    '# Four-context consumer-style observations',
    '',
    'Browser simulation only. Activation counts and target positions are observed; human findability, motor ability, VoiceOver, and physical-device performance are not assessed.',
    '',
    '| Persona | Simulated device | Activations | Scrolls | Clicked targets above initial fold | Findability |',
    '|---|---|---:|---:|---:|---|',
  ];
  for (const row of rows) {
    const known = row.targets.filter(target => target.aboveFold !== null).length;
    const above = row.targets.filter(target => target.aboveFold === true).length;
    const unknown = row.targets.length - known;
    lines.push(`| ${row.persona} | ${row.device} | ${row.activations} | ${row.scrolls} | ${above}/${known} known (${unknown} unknown) | NOT ASSESSED |`);
  }
  lines.push('', 'Raw target labels and viewport coordinates are retained in `consumer-ux.json`.', '');
  return lines.join('\n');
}

module.exports = { PERSONAS, summarize, toMarkdown };
