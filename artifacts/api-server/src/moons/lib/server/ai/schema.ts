// Our task schemas are written for OpenAI strict mode, which writes "string or null" as type: ['string', 'null'].
// Anthropic and Gemini read the same thing more reliably as anyOf, so the schema is rewritten for them.
type S = Record<string, unknown>;

export function portableSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(portableSchema);
  if (!schema || typeof schema !== 'object') return schema;
  const s = schema as S;
  const out: S = {};
  for (const [k, v] of Object.entries(s)) out[k] = k === 'enum' || k === 'required' ? v : portableSchema(v);
  if (Array.isArray(s.type)) {
    const types = s.type as string[], values = Array.isArray(s.enum) ? s.enum as unknown[] : null;
    const {type: _t, enum: _e, ...rest} = out;
    return {anyOf: types.map(t => {
      if (t === 'null') return {type: 'null'};
      const own = values?.filter(v => v !== null && typeof v === (t === 'integer' ? 'number' : t));
      return {...rest, type: t, ...(own ? {enum: own} : {})};
    })};
  }
  return out;
}
