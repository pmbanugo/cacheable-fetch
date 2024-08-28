import CachePolicy from "http-cache-semantics";
import { cacheResponse, getCachedResponse } from "./storage";

/**
 * Send a HTTP(s) request
 *
 * @param input A URL string or any other object with a stringifier — including a URL object type, or a Request object.
 * @param init A structured value that contains settings for the fetch() request.
 *
 * @returns A promise that resolves to {@link Response} object.
 */
export async function cacheableFetch(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : new Request(input, init);
  const policyRequest = toCachePolicyRequest(request);
  const cacheKey = await generateCacheKey(request);
  const cachedEntry = getCachedResponse(cacheKey);

  if (cachedEntry) {
    const cachedPolicy = CachePolicy.fromObject(cachedEntry.policy);

    if (cachedPolicy.satisfiesWithoutRevalidation(policyRequest)) {
      return new Response(cachedEntry.responseBody, {
        status: cachedEntry.policy.st,
        headers: toHeaders(cachedPolicy.responseHeaders()),
      });
    }

    const newRequestHeaders = cachedPolicy.revalidationHeaders(policyRequest);
    const revalidationRequest = new Request(request, {
      headers: toHeaders(newRequestHeaders),
    });
    const revalidatedResponse = await fetch(revalidationRequest);

    const { policy, modified } = cachedPolicy.revalidatedPolicy(
      toCachePolicyRequest(revalidationRequest),
      toCachePolicyResponse(revalidatedResponse)
    );

    const newPolicyObject = policy.toObject();
    cacheResponse({
      key: cacheKey,
      response: modified
        ? revalidatedResponse.clone()
        : new Response(cachedEntry.responseBody),
      policy: newPolicyObject,
    });

    return modified
      ? new Response(revalidatedResponse.body, {
          status: revalidatedResponse.status,
          headers: toHeaders(policy.responseHeaders()),
        })
      : new Response(cachedEntry.responseBody, {
          status: newPolicyObject.st,
          headers: toHeaders(policy.responseHeaders()),
        });
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
