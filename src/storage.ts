import type CachePolicy from "http-cache-semantics";
import { open, Database } from "lmdb";

const isDeno = navigator.userAgent.startsWith("Deno");
const ENV_KEY = "CACHEABLE_STORAGE_PATH";

const STORAGE_PATH: string | undefined = isDeno
  ? //@ts-ignore
    Deno.env.get(ENV_KEY)
  : process.env[ENV_KEY];

export class LMDBDatabaseFactory {
  private static instance: Database | null = null;
  private static readonly DEFAULT_STORAGE_PATH = STORAGE_PATH;

  private constructor() {}

  public static getInstance(): Database {
    if (!LMDBDatabaseFactory.instance) {
      LMDBDatabaseFactory.instance = open({
        path: LMDBDatabaseFactory.DEFAULT_STORAGE_PATH,
        compression: true,
        //TODO: add in-memory cache option, but allow client to configure it.
      });
    }

    return LMDBDatabaseFactory.instance;
  }

  public static async closeInstance(): Promise<void> {
    if (LMDBDatabaseFactory.instance) {
      await LMDBDatabaseFactory.instance.close();
      LMDBDatabaseFactory.instance = null;
    }
  }
}

export default LMDBDatabaseFactory;

export async function cacheResponse({
  key,
  response,
  policy,
}: {
  key: string;
  response: Response;
  policy: CachePolicy.CachePolicyObject;
}): Promise<void> {
  try {
    const db = LMDBDatabaseFactory.getInstance();
    await db.put(key, {
      policy: policy,
      responseBody: response.body ? await response.arrayBuffer() : undefined,
    } satisfies CacheEntry);
    console.debug("cacheable-fetch: Cached response", key);
  } catch (error) {
    console.error("cacheable-fetch: Failed to cache response", error);
  }
}

export function getCachedResponse(key: string): CacheEntry | undefined {
  try {
    const db = LMDBDatabaseFactory.getInstance();
    const cachedEntry = db.get(key);
    if (cachedEntry) {
      return cachedEntry;
    }
  } catch (error) {
    console.error("cacheable-fetch: Failed to get cached response", error);
  }
}

type CacheEntry = {
  policy: CachePolicy.CachePolicyObject;
  responseBody?: ArrayBuffer; //TODO: consider switching to UInt8Array (gotten from response.byte() ) if it'll make any difference in performance.
};
