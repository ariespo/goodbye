import { describe, expect, it } from 'vitest';
import { createDefaultPreset, normalizeAgentNarrativeMode } from './types';

describe('default narrative token budget', () => {
  it('uses the expanded 80k context and 4k output reserve', () => {
    const preset = createDefaultPreset();
    expect(preset.settings.openai_max_context).toBe(80000);
    expect(preset.settings.openai_max_tokens).toBe(4096);
  });
});

describe('narrative mode migration', () => {
  it('keeps supported modes and migrates removed legacy values to standard', () => {
    expect(normalizeAgentNarrativeMode('strict')).toBe('strict');
    expect(normalizeAgentNarrativeMode('standard')).toBe('standard');
    expect(normalizeAgentNarrativeMode('legacy')).toBe('standard');
    expect(normalizeAgentNarrativeMode(undefined)).toBe('standard');
  });
});
