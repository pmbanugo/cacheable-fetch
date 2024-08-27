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
  const url = `${BASE_URL}/no-store`;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(LMDBDatabaseFactory.getInstance().getKeysCount()).toBe(0);
  expect(Number(firstResponse)).toBeLessThan(Number(secondResponse));
});

test("Cacheable responses are cached", async () => {
  const url = `${BASE_URL}/cache`;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(LMDBDatabaseFactory.getInstance().getKeysCount()).toBe(1);
  expect(firstResponse).toBe(secondResponse);
});

test("Cacheable responses have unique cache key", async () => {
  const url = `${BASE_URL}${PATH.CACHE}`;
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

test("checks status codes when comparing cache & response", async () => {
  const url = `${BASE_URL}${PATH.FIRST_ERROR}`;
  const firstResponse = await cacheableFetch(url).then((r) => r.text());
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url).then((r) => r.text());

  expect(firstResponse).toBe("received 502");
  expect(secondResponse).toBe("ok");
});

test("saves compressed response", async () => {
  const url = `${BASE_URL}/${PATH.COMPRESS}`;
  const firstResponse = await cacheableFetch(url);
  await Bun.sleep(CACHESTORE_WAIT_TIME);
  const secondResponse = await cacheableFetch(url);

  expect(firstResponse.headers.get("etag")).toBe("foobar");
  expect(secondResponse.headers.get("etag")).toBe("foobar");
  expect(firstResponse.headers.get("content-encoding")).toBe(
    secondResponse.headers.get("content-encoding")
  );
});
