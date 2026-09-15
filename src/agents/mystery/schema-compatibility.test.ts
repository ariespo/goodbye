import { describe, expect, it } from 'vitest';
import { schemaWithoutAdditionalProperties, validateAdaptedSchemaValue } from './schema-compatibility';
import { ACTION_AUDITED_NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT } from './schemas';

describe('schema compatibility local constraints', () => {
  const schema = { type: 'object', additionalProperties: false, required: ['judgment'], properties: {
    judgment: { anyOf: [
      { type: 'object', additionalProperties: false, required: ['status', 'line'], properties: { status: { const: 'pass' }, line: { type: 'integer', minimum: 0 } } },
      { type: 'object', additionalProperties: false, required: ['status', 'reason'], properties: { status: { const: 'fail' }, reason: { type: 'string', minLength: 1 } } },
    ] },
  } };

  it.each([
    { judgment: { status: 'pass', line: 0 } },
    { judgment: { status: 'fail', reason: 'omitted' } },
  ])('accepts the matching anyOf branch: %j', value => {
    expect(() => validateAdaptedSchemaValue(value, schema)).not.toThrow();
  });

  it.each([
    { judgment: { status: 'pass', line: 0, reason: 'borrowed from another branch' } },
    { judgment: { status: 'fail', line: 0 } },
    { judgment: { status: 'pass', line: -1 } },
    { judgment: { status: 'fail', reason: '' } },
  ])('does not combine or ignore constraints across anyOf branches: %j', value => {
    expect(() => validateAdaptedSchemaValue(value, schema)).toThrow('$.judgment');
  });

  it('preserves data objects and property names while removing only schema keywords', () => {
    const original = { type: 'object', additionalProperties: false, properties: {
      additionalProperties: { type: 'object', additionalProperties: false, properties: {
        additionalProperties: { const: { additionalProperties: 'ordinary data' }, examples: [{ additionalProperties: false }] },
      } },
    } };
    expect(schemaWithoutAdditionalProperties(original)).toEqual({ type: 'object', properties: {
      additionalProperties: { type: 'object', properties: {
        additionalProperties: { const: { additionalProperties: 'ordinary data' }, examples: [{ additionalProperties: false }] },
      } },
    } });
    expect(original.additionalProperties).toBe(false);
    expect(original.properties.additionalProperties.additionalProperties).toBe(false);
  });

  it.each(['patternProperties', '$ref', 'if', 'unevaluatedProperties'])(
    'does not adapt schemas with unsupported local constraint %s', keyword => {
    expect(schemaWithoutAdditionalProperties({ type: 'object', additionalProperties: false,
      properties: { nested: { [keyword]: {} } } })).toBeUndefined();
  });

  it('does not introduce an unchanged probe when no schema additionalProperties exists', () => {
    expect(schemaWithoutAdditionalProperties({ type: 'object', properties: { additionalProperties: { type: 'string' } } }))
      .toBeUndefined();
  });

  it('supports the actual narrative-review schema without dropping any required fields', () => {
    const format = ACTION_AUDITED_NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT;
    expect(format.type).toBe('json_schema');
    if (format.type !== 'json_schema') throw new Error('expected review schema');
    const adapted = schemaWithoutAdditionalProperties(format.json_schema.schema);
    expect(adapted).toBeDefined();
    expect(adapted?.required).toEqual(format.json_schema.schema.required);
    expect(() => validateAdaptedSchemaValue({ approved: true }, format.json_schema.schema)).toThrow('$.assertionAudit');
  });
});
