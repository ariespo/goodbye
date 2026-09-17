import type { ApiPricing } from '../../sillytavern/api-telemetry';

export function ApiPricingFields({ label, baseUrl, model, pricing, onChange }: {
  label: string;
  baseUrl: string;
  model: string;
  pricing?: ApiPricing;
  onChange: (pricing: ApiPricing | undefined) => void;
}) {
  const active = pricing?.baseUrl === baseUrl && pricing.model === model ? pricing : undefined;
  const update = (patch: Partial<ApiPricing>) => onChange({
    ...active, baseUrl, model, currency: active?.currency ?? 'USD', ...patch,
  });
  return <fieldset className="mt-4 min-w-0 space-y-3 border-t border-border-subtle pt-3">
    <legend className="settings-label pt-3">费用估算（可选）</legend>
    <p className="settings-help">按服务商报价填写每百万 token 的价格，留空表示未知。仅适用于当前接口地址和模型；估算不代表实际账单。</p>
    {pricing && !active && <p className="settings-help">接口或模型已更改，原价格不适用；请为当前模型重新填写。</p>}
    <label className="block">
      <span className="settings-label">计价币种</span>
      <select className="settings-input w-full" aria-label={`${label}计价币种`} value={active?.currency ?? 'USD'}
        onChange={event => update({ currency: event.target.value as ApiPricing['currency'] })}>
        <option value="USD">USD 美元</option><option value="CNY">CNY 人民币</option>
      </select>
    </label>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {([
        ['inputPerMillion', '输入价格'], ['outputPerMillion', '输出价格'], ['cachedInputPerMillion', '缓存输入价格'],
      ] as const).map(([key, name]) => <label key={key} className="block min-w-0">
        <span className="settings-label">{name} / 百万 token</span>
        <input className="settings-input w-full" aria-label={`${label}${name} / 百万 token`} type="number" min="0" step="any"
          placeholder="未知" value={active?.[key] ?? ''} onChange={event => {
            const text = event.target.value;
            const value = text === '' ? undefined : Number(text);
            if (value === undefined || (Number.isFinite(value) && value >= 0)) update({ [key]: value });
          }} />
      </label>)}
    </div>
    <p className="settings-help">缓存价格留空时按输入价格估算；单独填写后，需要服务商返回缓存用量才能完整估算。更改币种不会换算已填价格。</p>
    {pricing && <button type="button" className="settings-btn settings-btn-ghost" onClick={() => onChange(undefined)}>清除价格</button>}
  </fieldset>;
}
