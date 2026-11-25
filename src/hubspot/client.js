import { log } from '../logger.js';

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function hubspotFetch(
  url,
  options = {},
  { token, maxRetries = 5, fetchImpl = fetch, sleepImpl = defaultSleep } = {},
) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= maxRetries) {
      const body = await res.text();
      throw new Error(`HubSpot ${res.status} for ${new URL(url).pathname}: ${body.slice(0, 300)}`);
    }

    const retryAfter = Number(res.headers.get('retry-after'));
    const delay =
      retryAfter > 0
        ? retryAfter * 1000
        : Math.min(30000, 500 * 2 ** attempt) + Math.random() * 250;
    log('warn', 'hubspot_retry', { status: res.status, attempt: attempt + 1, delayMs: Math.round(delay) });
    await sleepImpl(delay);
  }
}
