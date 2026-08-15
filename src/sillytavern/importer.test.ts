import { describe, expect, it } from 'vitest';
import { importPreset } from './importer';

describe('preset importer validation', () => {
  it('normalizes supported prompt entries and ignores malformed external data', () => {
    const preset = importPreset({
      name: 'Imported',
      gen_params: { temperature: '0.7', max_tokens: '1024' },
      prompts: [
        { identifier: 'main', name: 'Main', role: 'system', content: 'Hello' },
        null,
        'invalid',
      ],
      prompt_order: [
        { identifier: 'main', enabled: true },
        null,
        { enabled: true },
      ],
    });

    expect(preset.name).toBe('Imported');
    expect(preset.settings.temp_openai).toBe(0.7);
    expect(preset.settings.openai_max_tokens).toBe(1024);
    expect(preset.settings.prompt_order).toEqual([
      expect.objectContaining({ identifier: 'main', role: 'system', content: 'Hello', enabled: true }),
    ]);
  });
});
