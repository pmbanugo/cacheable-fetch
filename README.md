# cacheable-fetch: RFC-compliant HTTP Caching for fetch()

`cacheable-fetch` is a [fetch()](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) wrapper with an RFC-compliant HTTP Caching layer, intended for use on the server. It supports Node.js, Bun, and Deno, and isn't intended for use in a serverless environment.

> AFAIK Cloudflare workers supports caching when using the fetch() API, and you can override some of the settings.

The following RFCs are supported:

- [RFC 7234](https://www.rfc-editor.org/rfc/rfc7234)
- [~~RFC 9111~~](https://www.rfc-editor.org/rfc/rfc9111.html) (coming soon.)

## Why do I need this?

Just like browser caching makes websites fast, this does the same thing for your server apps, by following the same cache semantics. It's that simple. If you don't understand what HTTP caching is, maybe one of the videos in my ["web performance, http caching, and cdn"](https://youtube.com/playlist?list=PL3mkKbNRDU2uWRoUpzyIY2HnFaw4-7sjo&si=fLxcj6XgcLPUyOOj) series will help you. If you have more questions, feel free to [start a discussion](https://github.com/pmbanugo/cacheable-fetch/discussions)

> It's only a wrapper over `fetch()`, when you don't need it, just use the regular `fetch()`. If you want a middleware to cache your server's response, you can check [midas-cache](https://github.com/pmbanugo/midas-cache).

## Usage

Here's the command install this package using npm:

```bash
npx jsr add @pmbanugo/cacheable-fetch
```

Or any of the following for other package managers:

```bash
bunx jsr add @pmbanugo/cacheable-fetch
pnpm dlx jsr add @pmbanugo/cacheable-fetch
yarn dlx jsr add @pmbanugo/cacheable-fetch
```

You use it just like you would use the web _fetch()_ API.

```javascript
import { cacheableFetch } from "@pmbanugo/cacheable-fetch";

async function getData() {
  const url = "https://example.org/products.json";
  try {
    const response = await cacheableFetch(url);
    if (!response.ok) {
      throw new Error(`Response status: ${response.status}`);
    }

    const json = await response.json();
    console.log(json);
  } catch (error) {
    console.error(error.message);
  }
}
```
