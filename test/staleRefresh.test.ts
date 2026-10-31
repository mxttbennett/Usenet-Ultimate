import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { createStremioRouter } from '../src/routes/stremio.js';
import { requestContext } from '../src/requestContext.js';
import { PREFETCH_HEADER, scheduleRefresh } from '../src/addon/prefetch.js';

const quietConsole = { log: console.log, warn: console.warn, error: console.error };
beforeEach(() => { console.log = console.warn = console.error = () => {}; });
afterEach(() => Object.assign(console, quietConsole));

const realFetch = globalThis.fetch;
const realPort = process.env.PORT;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realPort === undefined) delete process.env.PORT;
  else process.env.PORT = realPort;
});

const until = async (done: () => boolean) => {
  for (let i = 0; i < 100 && !done(); i++) await new Promise(r => setTimeout(r, 10));
};

test('a stale answer is followed by one background search of the same stream', async () => {
  // Arrange
  const calls: Array<{ id: string; background: boolean | undefined }> = [];
  const app = express();
  app.use('/:manifestKey', (req, _res, next) => requestContext.run({
    manifestKey: req.params.manifestKey, baseUrl: '', pathPrefix: '', background: req.headers[PREFETCH_HEADER] !== undefined,
  }, () => next()), createStremioRouter({
    manifest: {},
    async get(_resource, _type, id) {
      const store = requestContext.getStore()!;
      calls.push({ id, background: store.background });
      if (!store.background) store.servedStale = true;
      return { streams: [] };
    },
  }));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  process.env.PORT = String(port);

  try {
    // Act
    const res = await fetch(`http://127.0.0.1:${port}/KEY/stream/movie/tt0000020.json`);
    await res.arrayBuffer();
    await until(() => calls.length >= 2);

    // Assert
    assert.deepEqual(calls, [
      { id: 'tt0000020', background: false },
      { id: 'tt0000020', background: true },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});

test('a stream opened twice while stale is refreshed once', async () => {
  // Arrange
  const urls: string[] = [];
  globalThis.fetch = (async (url: string) => { urls.push(url); return new Response('{}'); }) as typeof fetch;
  const url = 'http://127.0.0.1:1337/k/stream/movie/tt0000021.json';

  // Act
  scheduleRefresh(url);
  scheduleRefresh(url);
  await until(() => urls.length >= 1);
  await new Promise(r => setTimeout(r, 50));

  // Assert
  assert.deepEqual(urls, [url]);
});
