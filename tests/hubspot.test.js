import { describe, it, expect, vi } from 'vitest';
import { hubspotFetch } from '../src/hubspot/client.js';
import { extractContacts } from '../src/hubspot/extract.js';

const res = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (key) => headers[key.toLowerCase()] ?? null },
  json: async () => body,
  text: async () => JSON.stringify(body),
});

describe('hubspotFetch', () => {
  it('retries on 429 and honours Retry-After', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(429, {}, { 'retry-after': '1' }))
      .mockResolvedValueOnce(res(200, { ok: true }));
    const sleepImpl = vi.fn().mockResolvedValue();

    const data = await hubspotFetch(
      'https://api.hubapi.com/x',
      {},
      { token: 'test-token', fetchImpl, sleepImpl },
    );

    expect(data).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledWith(1000);
  });

  it('does not retry on a 400', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(400, { message: 'bad' }));

    await expect(
      hubspotFetch('https://api.hubapi.com/x', {}, { token: 'test-token', fetchImpl }),
    ).rejects.toThrow('HubSpot 400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(500));
    const sleepImpl = vi.fn().mockResolvedValue();

    await expect(
      hubspotFetch('https://api.hubapi.com/x', {}, {
        token: 'test-token',
        fetchImpl,
        sleepImpl,
        maxRetries: 2,
      }),
    ).rejects.toThrow('HubSpot 500');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('extractContacts', () => {
  it('follows paging cursors until none is left', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        res(200, { results: [{ id: '1' }], paging: { next: { after: 'abc' } } }),
      )
      .mockResolvedValueOnce(res(200, { results: [{ id: '2' }] }));
    const cfg = {
      hubspotBase: 'https://api.hubapi.com',
      contactsPath: '/crm/v3/objects/contacts',
      hubspotToken: 'test-token',
    };
    const all = [];

    for await (const page of extractContacts(cfg, { fetchImpl })) all.push(...page);

    expect(all.map((record) => record.id)).toEqual(['1', '2']);
    expect(fetchImpl.mock.calls[1][0]).toContain('after=abc');
  });
});
