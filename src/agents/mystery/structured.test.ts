import { describe, expect, it, vi } from 'vitest';
import { completeParsedStructured } from './structured';

describe('completeParsedStructured', () => {
  it('feeds an invalid structured response back once and parses the correction', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"approved":true}');

    const result = await completeParsedStructured(
      complete,
      'test-model',
      [{ role: 'user', content: 'review this' }],
      { temperature: 0 },
      { type: 'json_object' },
      text => JSON.parse(text) as { approved: boolean },
    );

    expect(result).toEqual({ approved: true });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(complete.mock.calls[1]?.[0]).toEqual(expect.arrayContaining([
      { role: 'assistant', content: 'not json' },
      expect.objectContaining({ role: 'user', content: expect.stringContaining('不可解析') }),
    ]));
  });
});
