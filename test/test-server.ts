import { Elysia } from "elysia";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

export const PATH = {
  NO_STORE: "/no-store",
  CACHE: "/cache",
  LAST_MODIFIED: "/last-modified",
  STALE_REVALIDATE: "/stale-revalidate",
  STALE_ERROR: "/stale-error",
  STALE_IF_ERROR_SUCCESS: "/stale-if-error-success",
  FIRST_ERROR: "/first-error",
  ETAG: "/etag",
  REVALIDATE_MODIFIED: "/revalidate-modified",
  CACHE_THEN_NO_STORE: "/cache-then-no-store-on-revalidate",
  ECHO: "/echo",
  COMPRESS: "/compress",
} as const;

let noStoreIndex = 0,
  cacheIndex = 0,
  calledFirstError = false,
  cacheThenNoStoreIndex = 0,
  date = Date.now() + 200;

export const server = new Elysia()
  .get("/", ({ set }) => {
    set.headers["cache-control"] = "public, max-age=60";
    return "Hello Elysia - " + Date.now();
  })
  .get(PATH.NO_STORE, ({ set }) => {
    set.headers["cache-control"] = "public, no-cache, no-store";
    return ++noStoreIndex;
  })
  .get(PATH.CACHE, ({ set }) => {
    set.headers["cache-control"] = "public, max-age=60";
    return ++cacheIndex;
  })
  .get(PATH.LAST_MODIFIED, ({ set, headers }) => {
    set.headers["cache-control"] = "public, max-age=0";
    set.headers["last-modified"] = "Wed, 21 Oct 2015 07:28:00 GMT";

    if (headers["if-modified-since"] === "Wed, 21 Oct 2015 07:28:00 GMT") {
      set.status = 304;
      return null;
    }
    return "last modified";
  })
  .get(PATH.STALE_REVALIDATE, ({ set }) => {
    set.headers["cache-control"] = "public, max-age=0.05";
    set.headers["stale-if-error"] = "0.01";

    if (Date.now() <= date) {
      date = Date.now() + 200;
      return "fresh";
    } else if (Date.now() <= date + 600) {
      return "stale";
    } else {
      date = Date.now() + 200;
      return "new";
    }
  })
  //INFO: I don't understand this borrowed test from cacheable-request, I will skip it and re-write it when I have a better understanding of it.
  // .get(PATH.STALE_IF_ERROR_SUCCESS, ({ set }) => {
  //   set.headers["cache-control"] = "public, max-age=0.05";
  //   set.headers["stale-if-error"] = "0.01";

  //   if (Date.now() <= date) {
  //     date = Date.now() + 200;
  //     return "fresh";
  //   } else if (Date.now() <= date + 600) {
  //     return "stale";
  //   } else {
  //     // date = Date.now() + 200;
  //     return "new";
  //   }
  // })
  .get(PATH.STALE_ERROR, ({ set }) => {
    set.headers["cache-control"] = "public, max-age=0.05";
    set.headers["stale-if-error"] = "0.01";

    if (Date.now() <= date) {
      date = Date.now() + 200;
      return "fresh";
    } else if (Date.now() <= date + 600) {
      return "stale";
    }

    return "stale-error-path";
  })
  .get(PATH.FIRST_ERROR, ({ set }) => {
    if (calledFirstError) {
      return "ok";
    }

    calledFirstError = true;
    set.status = 502;
    return "received 502";
  })
  .get(PATH.ETAG, ({ set, headers }) => {
    const etag = "33a64df551425fcc55e4d42a148795d9f25f89d4";
    set.headers["cache-control"] = "public, max-age=0";
    set.headers["etag"] = etag;

    if (headers["if-none-match"] === etag) {
      set.status = 304;
      return null;
    }
    return "etag";
  })
  .get(PATH.REVALIDATE_MODIFIED, ({ set, headers }) => {
    const etag = "33a64df551425fcc55e4d42a148795d9f25f89d4";
    set.headers["cache-control"] = "public, max-age=0";

    if (headers["if-none-match"] === etag) {
      set.headers["etag"] = "0000000000000000000000000000000000";
      return "new-body";
    }

    set.headers["etag"] = etag;
    return "revalidate-modified";
  })
  .get(PATH.CACHE_THEN_NO_STORE, ({ set }) => {
    set.headers["cache-control"] =
      cacheThenNoStoreIndex === 0
        ? "public, max-age=0"
        : "public, no-cache, no-store";

    const body =
      cacheThenNoStoreIndex === 0
        ? "cache-then-no-store-on-revalidate"
        : "no-store";
    cacheThenNoStoreIndex++;
    return body;
  })
  .get(
    PATH.ECHO,
    ({ query, body, headers, path, request }) => {
      return {
        query,
        headers,
        path,
        originalUrl: request.url,
        body,
      };
    },
    { type: "text" }
  )
  .get(PATH.COMPRESS, async ({ set, headers }) => {
    const etag = "foobar";
    if (headers["if-none-match"] === etag) {
      set.status = 304;
      return null;
    }

    const payload = JSON.stringify({ foo: "bar" });
    const compressedBody = await promisify(gzip)(payload);
    set.headers["content-encoding"] = "gzip";
    set.headers["etag"] = etag;
    set.headers["cache-control"] = "public, max-age=60";
    return compressedBody;
  });
