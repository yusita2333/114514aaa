// api-settings · 副 AI 独立端点配置(批E1·v19遗留待办落地)
// 副 AI 负责后台任务: 小总结/大总结/数值抽取——都是轻量结构化任务,适合换便宜快模型。
// 主 AI(正文)不受影响,仍走酒馆当前预设端点。
// 配置存 localStorage(跨聊天全局);调用时读取(getExtractApiForCall)→改配置即时生效,无需重启。

export interface ExtractApiConfig {
  enabled: boolean;
  apiurl: string;   // OpenAI 兼容端点,如 https://api.xxx.com/v1
  key: string;      // ⚠ 明文存浏览器 localStorage,仅限本机使用
  model: string;    // 模型名,如 gpt-4o-mini / deepseek-chat
}

const KEY = 'pellucid_extract_api';
const DEFAULTS: ExtractApiConfig = { enabled: false, apiurl: '', key: '', model: '' };

export function getExtractApiConfig(): ExtractApiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<ExtractApiConfig>;
    return {
      enabled: !!p.enabled,
      apiurl: typeof p.apiurl === 'string' ? p.apiurl : '',
      key: typeof p.key === 'string' ? p.key : '',
      model: typeof p.model === 'string' ? p.model : '',
    };
  } catch { return { ...DEFAULTS }; }
}

export function setExtractApiConfig(cfg: ExtractApiConfig) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* 无localStorage环境忽略 */ }
}

/**
 * 从端点抓取可用模型列表(批G·OpenAI 兼容 GET {apiurl}/models)。
 * 返回模型 id 数组(按字母排序)。网络/鉴权/格式错误抛 Error(调用方展示给用户)。
 */
export async function fetchModelList(apiurl: string, key: string): Promise<string[]> {
  const base = apiurl.trim().replace(/\/+$/, '');
  if (!base) throw new Error('先填写端点 URL');
  const resp = await fetch(`${base}/models`, {
    method: 'GET',
    headers: key.trim() ? { Authorization: `Bearer ${key.trim()}` } : {},
  });
  if (!resp.ok) throw new Error(`端点返回 ${resp.status} ${resp.statusText}`);
  const json = await resp.json().catch(() => { throw new Error('响应不是有效 JSON'); });
  // OpenAI 格式 {data:[{id}]};部分兼容端点直接返回数组
  const arr = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : null);
  if (!arr) throw new Error('响应格式不是 OpenAI 兼容的模型列表');
  const ids = arr.map((m: any) => typeof m === 'string' ? m : m?.id).filter((x: any) => typeof x === 'string' && x);
  if (!ids.length) throw new Error('模型列表为空');
  return [...new Set(ids as string[])].sort();
}

/**
 * 供 generateRaw custom_api 的副端点配置。未启用/未填端点 → undefined(回落主端点)。
 * source 固定 'openai'(酒馆 custom_api 的 OpenAI 兼容通道)。
 */
export function getExtractApiForCall(): { apiurl: string; key?: string; model?: string; source: string } | undefined {
  const c = getExtractApiConfig();
  if (!c.enabled || !c.apiurl.trim()) return undefined;
  return {
    apiurl: c.apiurl.trim(),
    ...(c.key.trim() ? { key: c.key.trim() } : {}),
    ...(c.model.trim() ? { model: c.model.trim() } : {}),
    source: 'openai',
  };
}
