/** A deliberately bounded schema dialect: adapt only constraints we can restore locally. */
const supportedKeywords = new Set([
  'type', 'properties', 'additionalProperties', 'required', 'items', 'anyOf', 'oneOf', 'allOf',
  'enum', 'const', 'minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'maxItems',
  'title', 'description', 'default', 'examples', '$schema',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Never traverse enum/default values or property-name maps as if they were schema nodes. */
export function schemaWithoutAdditionalProperties(schema: Record<string, unknown>): Record<string, unknown> | undefined {
  let removed = false;
  let supported = true;
  const visit = (node: unknown): unknown => {
    if (typeof node === 'boolean') return node;
    if (!isRecord(node)) { supported = false; return node; }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (!supportedKeywords.has(key)) supported = false;
      if (key === 'additionalProperties') {
        removed = true;
        if (typeof value !== 'boolean') visit(value);
      } else if (key === 'properties' && isRecord(value)) {
        result[key] = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, visit(item)]));
      } else if (key === 'items') {
        // Tuple schemas are outside the application dialect.
        if (Array.isArray(value)) supported = false;
        result[key] = visit(value);
      } else if (['anyOf', 'oneOf', 'allOf'].includes(key) && Array.isArray(value)) {
        result[key] = value.map(visit);
      } else {
        result[key] = value;
      }
    }
    return result;
  };
  const adapted = visit(schema);
  return removed && supported ? adapted as Record<string, unknown> : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameJson(value, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length
      && keys.every(key => Object.hasOwn(right, key) && sameJson(left[key], right[key]));
  }
  return false;
}

function matchesType(value: unknown, type: unknown): boolean {
  if (Array.isArray(type)) return type.some(item => matchesType(value, item));
  switch (type) {
    case 'object': return isRecord(value);
    case 'array': return Array.isArray(value);
    case 'null': return value === null;
    case 'integer': return typeof value === 'number' && Number.isInteger(value);
    case 'number': return typeof value === 'number' && Number.isFinite(value);
    case 'string': return typeof value === 'string';
    case 'boolean': return typeof value === 'boolean';
    default: return false;
  }
}

function schemaErrors(value: unknown, schema: unknown, path: string): string[] {
  if (schema === true) return [];
  if (schema === false || !isRecord(schema)) return [`${path}: schema 不接受此值`];
  const errors: string[] = [];
  if (schema.type !== undefined && !matchesType(value, schema.type)) return [`${path}: type 必须为 ${JSON.stringify(schema.type)}`];
  if (Object.hasOwn(schema, 'const') && !sameJson(value, schema.const)) errors.push(`${path}: const 不匹配`);
  if (Array.isArray(schema.enum) && !schema.enum.some(item => sameJson(value, item))) errors.push(`${path}: enum 不匹配`);
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) continue;
    const results = branches.map(branch => schemaErrors(value, branch, path));
    const matches = results.filter(result => result.length === 0).length;
    if (keyword === 'allOf') errors.push(...results.flat());
    else if (matches === 0) errors.push(`${path}: ${keyword} 无合法分支；${results.flat().join('；')}`);
    else if (keyword === 'oneOf' && matches !== 1) errors.push(`${path}: oneOf 必须恰好匹配一个分支`);
  }
  if (isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (typeof key === 'string' && !Object.hasOwn(value, key)) errors.push(`${path}.${key}: 缺少必需字段`);
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (Object.hasOwn(properties, key)) errors.push(...schemaErrors(item, properties[key], `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: additionalProperties 禁止未知字段`);
      else if (isRecord(schema.additionalProperties)) errors.push(...schemaErrors(item, schema.additionalProperties, `${path}.${key}`));
    }
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) errors.push(`${path}: 数组短于 minItems`);
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) errors.push(`${path}: 数组长于 maxItems`);
    if (schema.items !== undefined) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, `${path}[${index}]`)));
  }
  if (typeof value === 'string') {
    const length = [...value].length;
    if (typeof schema.minLength === 'number' && length < schema.minLength) errors.push(`${path}: 字符串短于 minLength`);
    if (typeof schema.maxLength === 'number' && length > schema.maxLength) errors.push(`${path}: 字符串长于 maxLength`);
  }
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) errors.push(`${path}: 小于 minimum`);
    if (typeof schema.maximum === 'number' && value > schema.maximum) errors.push(`${path}: 大于 maximum`);
  }
  return errors;
}

/** Validate against the original schema, including the correct anyOf branch. */
export function validateAdaptedSchemaValue(value: unknown, schema: Record<string, unknown>): void {
  const errors = schemaErrors(value, schema, '$');
  if (errors.length > 0) throw new Error(`结构化响应未满足原始 schema：${errors.join('；')}`);
}
