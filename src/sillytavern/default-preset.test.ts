import { describe, expect, it } from 'vitest';
import { createDefaultPreset } from './types';

describe('default narrative token budget', () => {
  it('uses the expanded 80k context and 4k output reserve', () => {
    const preset = createDefaultPreset();
    expect(preset.settings.openai_max_context).toBe(80000);
    expect(preset.settings.openai_max_tokens).toBe(4096);
  });
});
