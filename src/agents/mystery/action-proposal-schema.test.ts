import { describe, expect, it } from 'vitest';
import { DIRECTOR_SYSTEM_PROMPT, WRITER_SYSTEM_PROMPT } from './prompts';
import { DIRECTOR_PLAN_JSON_SCHEMA, DIRECTOR_PLAN_RESPONSE_FORMAT } from './schemas';

type JsonSchema = {
  type?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  enum?: string[];
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  additionalProperties?: boolean;
};

describe('Director action proposal contract', () => {
  it('lets strict Director output propose one to eight validated intent stages', () => {
    const schema = DIRECTOR_PLAN_JSON_SCHEMA as JsonSchema;
    const actionSteps = schema.properties?.actionSteps;
    const item = actionSteps?.items;

    expect(actionSteps).toMatchObject({ type: 'array', minItems: 1, maxItems: 8 });
    expect(item).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'kind', 'scope', 'locationId'],
    });
    expect(Object.keys(item?.properties ?? {}).sort()).toEqual(['id', 'kind', 'locationId', 'scope']);
    expect(item?.properties?.id).toMatchObject({ type: 'string', minLength: 1 });
    expect(item?.properties?.locationId).toMatchObject({ type: 'string', minLength: 1 });
    expect(item?.properties?.kind?.enum).toEqual([
      'inquiry', 'investigation', 'search', 'travel', 'rest', 'wait',
    ]);
    expect(item?.properties?.scope?.enum).toEqual(['short', 'normal', 'deep']);
    expect(schema.required).not.toContain('actionSteps');
    expect(DIRECTOR_PLAN_RESPONSE_FORMAT.type).toBe('json_schema');
    if (DIRECTOR_PLAN_RESPONSE_FORMAT.type !== 'json_schema') {
      throw new Error('Director response format must use its strict JSON schema');
    }
    expect(DIRECTOR_PLAN_RESPONSE_FORMAT.json_schema.schema).toBe(DIRECTOR_PLAN_JSON_SCHEMA);
  });

  it('keeps compatibility time as optional advisory metadata', () => {
    const schema = DIRECTOR_PLAN_JSON_SCHEMA as JsonSchema;
    expect(schema.required).not.toContain('timeCostMinutes');
    expect(schema.properties?.timeCostMinutes).toMatchObject({
      type: 'integer', minimum: 1, maximum: 180,
    });
  });
});

describe('resolved action prompt authority', () => {
  it('teaches the Director central prices, travel and partial compound execution', () => {
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/short[^\n]*25[^\n]*normal[^\n]*55[^\n]*deep[^\n]*105/u);
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/旅行[^\n]*(?:程序|引擎)[^\n]*只[^\n]*一次/u);
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/复合行动[^\n]*(?:按顺序|依次)[^\n]*(?:累加|合计)/u);
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/短预算[^\n]*部分[^\n]*(?:不得|不能)[^\n]*完整[^\n]*奖励/u);
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/timeCostMinutes[^\n]*兼容[^\n]*建议[^\n]*(?:程序|引擎)[^\n]*忽略/u);
    expect(DIRECTOR_SYSTEM_PROMPT).toMatch(/不得[^\n]*(?:requestedMinutes|eventId|completionSourceIds)/u);
    expect(DIRECTOR_SYSTEM_PROMPT).not.toContain('对话约5-15');
    expect(DIRECTOR_SYSTEM_PROMPT).not.toContain('调查约20-40');
  });

  it('makes the Writer render only the current resolved interval and earned outcomes', () => {
    expect(WRITER_SYSTEM_PROMPT).toMatch(/resolvedAction[^\n]*(?:唯一|权威)/u);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/startTime[^\n]*endTime[^\n]*executedMinutes/u);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/完整[^\n]*(?:时间区间|经过区间)[^\n]*(?:高光|关键片段)/u);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/不得[^\n]*(?:自行|独立)[^\n]*(?:时间|体力|理智|资源)/u);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/未完成[^\n]*(?:不得|不能)[^\n]*(?:发现|奖励|结果)/u);
    expect(WRITER_SYSTEM_PROMPT).toMatch(/续作[^\n]*(?:不得|不能)[^\n]*重演[^\n]*(?:旅行|路程|行动|工作)/u);
  });
});
