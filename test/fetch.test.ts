/** Test adapted to match some test cases from cacheable-request test suite
 * link: https://github.com/jaredwray/cacheable/blob/d2005a05195cb9c88f9b99cd20af8e4a3a5df397/packages/cacheable-request/test/cache.test.ts
 * with some extras for the cacheable-fetch implementation
 */

import { test, beforeAll, afterAll, expect } from "bun:test";
import { server, PATH } from "./test-server";
import { cacheableFetch } from "../src/index";
import { LMDBDatabaseFactory } from "../src/storage";

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
/* Wait time for the request to be stored in the cache, because the response is returned while the response is stored in the cache.
 * You can increase this time if the test fails because of that. I found 3 to be the sweet spot for my machine.
 */
const CACHESTORE_WAIT_TIME = 3; //in milliseconds

beforeAll(() => {
  server.listen(PORT);
});

afterAll(async () => {
  await server.stop();
  await LMDBDatabaseFactory.closeInstance();
});

test("Non cacheable responses are not cached", async () => {
  const url = BASE_URL + PATH.NO_STORE;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(LMDBDatabaseFactory.getInstance().getKeysCount()).toBe(0);
  expect(Number(firstResponse)).toBeLessThan(Number(secondResponse));
});

test("Cacheable responses are cached", async () => {
  const url = BASE_URL + PATH.CACHE;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(LMDBDatabaseFactory.getInstance().getKeysCount()).toBe(1);
  expect(firstResponse).toBe(secondResponse);
});

test("Cacheable responses have unique cache key", async () => {
  const url = BASE_URL + PATH.CACHE;
  const firstResponse = await cacheableFetch(url + "?foo").then((r) =>
    r.text()
  );
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url + "?bar").then((r) =>
    r.text()
  );

  expect(LMDBDatabaseFactory.getInstance().getKeysCount()).toBe(2);
  expect(firstResponse).not.toBe(secondResponse);
});

test(`Cacheable responses for root path (i.e. /) are cached with same key`, async () => {
  const firstURL = new URL(BASE_URL);
  const secondURL = BASE_URL + "/";
  const db = LMDBDatabaseFactory.getInstance();

  const firstResponse = await cacheableFetch(firstURL).then((r) => r.text());
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(secondURL).then((r) => r.text());

  expect(db.get(`GET:${BASE_URL}`)).toBeUndefined();
  expect(db.get(`GET:${secondURL}`)).toBeDefined();
  expect(firstResponse).toBe(secondResponse);
});

test("Stale cache entries with Last-Modified headers are revalidated", async () => {
  const url = BASE_URL + PATH.LAST_MODIFIED;
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url);

  const cacheValue = LMDBDatabaseFactory.getInstance().get("GET:" + url);
  expect(cacheValue).toBeDefined();
  expect(cacheValue.policy.st).toBe(200);
  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  const firstResponseText = await firstResponse.text();
  expect(firstResponseText).toBe("last modified");
  expect(firstResponseText).toBe(await secondResponse.text());
});

test("Stale cache entries with ETag headers are revalidated", async () => {
  const url = BASE_URL + PATH.ETAG;
  expect(LMDBDatabaseFactory.getInstance().get("GET:" + url)).toBeUndefined();
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  expect(LMDBDatabaseFactory.getInstance().get("GET:" + url)).toBeDefined();
  const secondResponse = await cacheableFetch(url);
  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  expect(await firstResponse.text()).toBe("etag");
  expect(await secondResponse.text()).toBe("etag");
});

test(`Stale cache entries that can't be revalidate are deleted from cache`, async () => {
  const url = BASE_URL + PATH.CACHE_THEN_NO_STORE;
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url);

  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  expect(firstResponse.headers.get("cache-control")).toBe("public, max-age=0");
  expect(secondResponse.headers.get("cache-control")).toBe(
    "public, no-cache, no-store"
  );
  expect(await firstResponse.text()).toBe("cache-then-no-store-on-revalidate");
  expect(await secondResponse.text()).toBe("no-store");
});

test("Revalidated responses that are modified are passed through", async () => {
  const url = BASE_URL + PATH.REVALIDATE_MODIFIED;
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url);
  expect(firstResponse.status).toBe(200);
  expect(secondResponse.status).toBe(200);
  expect(await firstResponse.text()).toBe("revalidate-modified");
  expect(await secondResponse.text()).toBe("new-body");
});

test("checks status codes when comparing cache & response", async () => {
  const url = `${BASE_URL}${PATH.FIRST_ERROR}`;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(firstResponse).toBe("received 502");
  expect(secondResponse).toBe("ok");
});

test("saves compressed response", async () => {
  const url = BASE_URL + PATH.COMPRESS;
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url);

  expect(firstResponse.headers.get("etag")).toBe("foobar");
  expect(secondResponse.headers.get("etag")).toBe("foobar");
  expect(firstResponse.headers.get("content-encoding")).toBe(
    secondResponse.headers.get("content-encoding")
  );
});
