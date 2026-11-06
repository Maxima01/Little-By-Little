import assert from 'node:assert/strict';
import test from 'node:test';
import { manageCloudSessionLifecycle } from '../src/features/workspace/lib/cloudSessionLifecycle.ts';

// Feature: model native foreground/background transitions without requiring a device or real login.
test('native token refresh starts immediately, follows visibility and stops on cleanup', () => {
  const calls = [];
  let listener;
  const auth = {
    startAutoRefresh: async () => { calls.push('start'); },
    stopAutoRefresh: async () => { calls.push('stop'); },
  };
  const state = { currentState: 'active', addEventListener: (_event, handler) => {
    listener = handler;
    return { remove: () => { calls.push('remove'); } };
  } };
  const cleanup = manageCloudSessionLifecycle(auth, state);
  listener('background');
  listener('active');
  cleanup();
  assert.deepEqual(calls, ['start', 'stop', 'start', 'remove', 'stop']);
});

// Feature: native launches in the background wait for activation before refreshing a login.
test('background initialization does not start refresh prematurely', () => {
  const calls = [];
  manageCloudSessionLifecycle({
    startAutoRefresh: async () => { calls.push('start'); },
    stopAutoRefresh: async () => { calls.push('stop'); },
  }, { currentState: 'background', addEventListener: () => ({ remove() {} }) });
  assert.deepEqual(calls, ['stop']);
});
