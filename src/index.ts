import CachePolicy from "http-cache-semantics";
import { cacheResponse, getCachedResponse } from "./storage";

export async function cacheableFetch(
  input: RequestInfo,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const policyRequest = toCachePolicyRequest(request);
  const cacheKey = await generateCacheKey(request);
  const cachedEntry = await getCachedResponse(cacheKey);

  if (cachedEntry) {
    const cachedPolicy = CachePolicy.fromObject(cachedEntry.policy);

    if (cachedPolicy.satisfiesWithoutRevalidation(policyRequest)) {
      return new Response(cachedEntry.responseBody, {
        status: cachedEntry.policy.st,
        headers: toHeaders(cachedPolicy.responseHeaders()),
      });
    }
  }

  const response = await fetch(request);

  const policy = new CachePolicy(
    policyRequest,
    toCachePolicyResponse(response)
  );

  if (!policy.storable()) {
    return response;
  }

  cacheResponse({
    key: cacheKey,
    response: response.clone(),
    policy: policy.toObject(),
  });
  return response;
}

function toCachePolicyResponse(response: Response): CachePolicy.Response {
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
  };
}

function toCachePolicyRequest(request: Request): CachePolicy.Request {
  return {
    headers: Object.fromEntries(request.headers),
    url: request.url,
    method: request.method,
  };
}

function toHeaders(policyHeaders: CachePolicy.Headers): Headers {
  const headers = new Headers();
  for (const key in policyHeaders) {
    if (policyHeaders[key] && Object.hasOwn(policyHeaders, key)) {
      let headerValue = policyHeaders[key];
      if (typeof headerValue === "string") {
        headers.append(key, headerValue);
      } else {
        headerValue.forEach((value) => headers.append(key, value));
      }
    }
  }

  return headers;
}

async function generateCacheKey(request: Request): Promise<string> {
  const { url, method, body } = request;
  let key = `${method}:${url}`;

  if (
    body &&
    typeof body === "string" &&
    ["POST", "PUT", "PATCH"].includes(method)
  ) {
    const hashArrayBuffer = await crypto.subtle.digest(
      "MD5",
      new TextEncoder().encode(body)
    );
    const bodyHash = Array.from(new Uint8Array(hashArrayBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    key += `:${bodyHash}`;
  }

  return key;
}
