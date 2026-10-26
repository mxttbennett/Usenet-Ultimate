import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MBPS, ThroughputSampler, peekBandwidth, recordLiveSample, resetBandwidthState } from '../src/nzbdav/bandwidth.js';

beforeEach(() => resetBandwidthState());

test('with no data the estimate is the default', () => {
  // Act & Assert
  assert.deepEqual(peekBandwidth(), { mbps: DEFAULT_MBPS, source: 'default' });
});

test('an override beats live data', () => {
  // Arrange
  recordLiveSample(80);

  // Act & Assert
  assert.deepEqual(peekBandwidth(30), { mbps: 30, source: 'override' });
});

test('live samples are smoothed toward new readings', () => {
  // Arrange
  recordLiveSample(100);

  // Act
  recordLiveSample(50);

  // Assert
  const est = peekBandwidth();
  assert.equal(est.source, 'live');
  assert.equal(est.mbps, 100 + (50 - 100) * 0.4);
});

test('live data goes stale after its TTL', () => {
  // Arrange
  recordLiveSample(80, 1_000);

  // Act
  const est = peekBandwidth(undefined, 1_000 + 7 * 60 * 60 * 1000);

  // Assert
  assert.equal(est.source, 'default');
});

test('non-positive and non-finite samples are ignored', () => {
  // Act
  recordLiveSample(0);
  recordLiveSample(-5);
  recordLiveSample(Number.NaN);

  // Assert
  assert.equal(peekBandwidth().source, 'default');
});

test('sampler reports a saturated window as megabits per second', () => {
  // Arrange
  const samples: number[] = [];
  const sampler = new ThroughputSampler(m => samples.push(m));

  // Act
  sampler.tick(0, 0, 1_000_000);
  sampler.tick(4_000, 5_000_000, 1_000_000);
  sampler.tick(8_000, 10_000_000, 1_000_000);

  // Assert
  assert.equal(samples.length, 1);
  assert.equal(samples[0], 10);
});

test('sampler drops a window where the backlog ran dry', () => {
  // Arrange
  const samples: number[] = [];
  const sampler = new ThroughputSampler(m => samples.push(m));

  // Act
  sampler.tick(0, 0, 1_000_000);
  sampler.tick(4_000, 1_000_000, 0);
  sampler.tick(8_000, 2_000_000, 1_000_000);

  // Assert
  assert.deepEqual(samples, []);
});

test('sampler starts a fresh window after each report', () => {
  // Arrange
  const samples: number[] = [];
  const sampler = new ThroughputSampler(m => samples.push(m));

  // Act
  sampler.tick(1_000, 0, 1_000_000);
  sampler.tick(9_000, 10_000_000, 1_000_000);
  sampler.tick(17_000, 30_000_000, 1_000_000);

  // Assert
  assert.deepEqual(samples, [10, 20]);
});
