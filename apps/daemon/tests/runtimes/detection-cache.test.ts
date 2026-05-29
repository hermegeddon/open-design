import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';

import {
  clearAgentDetectionCache,
  detectAgentsCached,
} from '../../src/runtimes/detection.js';
import type { DetectedAgent } from '../../src/runtimes/types.js';

const AGENTS: DetectedAgent[] = [
  {
    id: 'stub',
    name: 'Stub',
    bin: 'stub',
    versionArgs: ['--version'],
    streamFormat: 'raw',
    models: [{ id: 'default', label: 'Default (CLI config)' }],
    modelsSource: 'fallback',
    available: true,
  },
];

afterEach(() => {
  clearAgentDetectionCache();
});

test('detectAgentsCached deduplicates concurrent probes for the same agent env', async () => {
  let calls = 0;
  let resolveProbe!: (agents: DetectedAgent[]) => void;
  const detector = async () => {
    calls += 1;
    return await new Promise<DetectedAgent[]>((resolve) => {
      resolveProbe = resolve;
    });
  };

  const first = detectAgentsCached({}, { detector });
  const second = detectAgentsCached({}, { detector });

  assert.strictEqual(first, second);
  assert.equal(calls, 1);

  resolveProbe(AGENTS);
  assert.deepEqual(await second, AGENTS);
});

test('detectAgentsCached serves a short-lived cached result after a probe completes', async () => {
  let calls = 0;
  let currentTime = 1_000;
  const detector = async () => {
    calls += 1;
    return AGENTS;
  };

  assert.deepEqual(
    await detectAgentsCached({}, { detector, now: () => currentTime, ttlMs: 500 }),
    AGENTS,
  );
  assert.deepEqual(
    await detectAgentsCached({}, { detector, now: () => currentTime + 499, ttlMs: 500 }),
    AGENTS,
  );
  assert.equal(calls, 1);

  currentTime += 501;
  assert.deepEqual(
    await detectAgentsCached({}, { detector, now: () => currentTime, ttlMs: 500 }),
    AGENTS,
  );
  assert.equal(calls, 2);
});

test('detectAgentsCached keys the cache by stable agent env content', async () => {
  let calls = 0;
  const detector = async () => {
    calls += 1;
    return AGENTS;
  };

  await detectAgentsCached({ hermes: { HERMES_BIN: '/bin/a', EXTRA: '1' } }, { detector });
  await detectAgentsCached({ hermes: { EXTRA: '1', HERMES_BIN: '/bin/a' } }, { detector });
  await detectAgentsCached({ hermes: { HERMES_BIN: '/bin/b', EXTRA: '1' } }, { detector });

  assert.equal(calls, 2);
});
