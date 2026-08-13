/**
 * PellucidLoader v09 · srcdoc iframe + top.document
 * --------------------------------------------------
 * v04-v08 失败根因(v08 诊断锁定):
 *   酒馆助手把每个卡脚本放进 TH-script--*** 隔离 iframe(隐藏不可见)
 *   loader 在那 iframe 内部跑,document.body.appendChild 挂到 iframe 内部 body
 *   Vue mount 也在 iframe 内成功(其实一直在工作),但用户在主页面看不见
 *
 * v09 解决:
 *   1. 跳出 TH-script iframe: 用 window.top.document.body 操作主页面 DOM
 *   2. 创建可见 srcdoc iframe: fetch HTML 文本 → iframe.srcdoc = html
 *   3. srcdoc iframe 是 JS 动态创建并 append 到 top body,绕过状态栏正则的 HTML sanitize
 *   4. iframe 内部完整执行远程 HTML(含 Vue/Pinia ESM CDN import + mount),完全隔离不冲突
 *   5. 远程 HTML 用 const o=Vue / $() 依赖全局 Vue/jQuery, 而 srcdoc iframe 不带这些,
 *      所以 patchHtml() 在 <head> 注入 jQuery + Vue UMD 让全局可用
 */

const topDoc: Document = (window.top?.document ?? document) as Document;

const BASE_URL = 'https://testingcf.jsdelivr.net/gh/wuminggla/pellucid-grove/dist/jiutiao/界面/状态栏/index.html';
const FALLBACK_URL = 'https://cdn.jsdelivr.net/gh/wuminggla/pellucid-grove/dist/jiutiao/界面/状态栏/index.html';
const VUE_UMD = 'https://testingcf.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js';
const JQUERY_UMD = 'https://testingcf.jsdelivr.net/npm/jquery@3/dist/jquery.min.js';

const ROOT_ID = 'pellucid-app-root';
const FRAME_ID = 'pellucid-app-frame';

console.log('[pellucid] v09 ESM bundle 顶层执行 (srcdoc iframe + top.document)');
console.log('[pellucid] 当前 window 是:', window === window.top ? 'TOP' : 'TH-script sandbox');
console.log('[pellucid] 可访问 top.document:', !!window.top?.document);

function ensureRoot(): HTMLElement {
  const existing = topDoc.getElementById(ROOT_ID);
  if (existing) return existing as HTMLElement;

  const root = topDoc.createElement('div');
  root.id = ROOT_ID;
  root.style.cssText = [
    'position:fixed',
    'top:64px',
    'right:20px',
    'width:min(460px,92vw)',
    'height:min(640px,calc(100vh - 100px))',
    'display:flex',
    'flex-direction:column',
    'z-index:9999',
    'background:#0a0608',
    'border:1px solid #3d2828',
    'border-radius:10px',
    'box-shadow:0 8px 32px rgba(0,0,0,0.7)',
    "font-family:'Noto Serif SC',serif",
    'color:#e8dde0',
    'overflow:hidden',
  ].join(';');

  const bar = topDoc.createElement('div');
  bar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:#1a0e12;border-bottom:1px solid #3d2828;flex-shrink:0;';

  const title = topDoc.createElement('span');
  title.style.cssText = 'font-size:12px;color:#8a6b73;letter-spacing:2px;';
  title.textContent = '九条会·pellucid';
  bar.appendChild(title);

  const minBtn = topDoc.createElement('button');
  minBtn.style.cssText = 'background:none;border:none;color:#8a6b73;cursor:pointer;font-size:13px;padding:2px 10px;';
  minBtn.textContent = '▁';
  bar.appendChild(minBtn);
  root.appendChild(bar);

  let collapsed = false;
  minBtn.addEventListener('click', () => {
    collapsed = !collapsed;
    root.style.height = collapsed ? '36px' : 'min(640px,calc(100vh - 100px))';
    minBtn.textContent = collapsed ? '▔' : '▁';
  });

  topDoc.body.appendChild(root);
  console.log('[pellucid] root 容器已挂到 TOP body (id=' + ROOT_ID + ')');
  return root;
}

async function fetchHtml(url: string): Promise<string> {
  const r = await fetch(url, { credentials: 'omit', mode: 'cors' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

/**
 * 给远程 HTML 的 <head> 注入 jQuery + Vue UMD 全局,
 * 让远程 HTML 里 webpack 编译产物用的 const o=Vue / $() 引用能从全局拿到.
 */
function patchHtml(html: string): string {
  const inject = `<script src="${JQUERY_UMD}"></script><script src="${VUE_UMD}"></script>`;
  return html.replace(/<head[^>]*>/i, m => m + inject);
}

function injectIframe(root: HTMLElement, html: string) {
  const loading = root.querySelector('#pellucid-loading');
  if (loading) loading.remove();
  const old = root.querySelector('#' + FRAME_ID);
  if (old) old.remove();

  const iframe = topDoc.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.style.cssText = 'flex:1;border:0;width:100%;min-height:0;background:#0a0608;';
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.srcdoc = patchHtml(html);
  root.appendChild(iframe);
  console.log('[pellucid] srcdoc iframe 已挂载 (注入 jQuery+Vue UMD,Vue mount 将在 iframe 内进行)');
}

let loadPromise: Promise<void> | null = null;
function tryLoadOnce(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const root = ensureRoot();

    const loading = topDoc.createElement('div');
    loading.id = 'pellucid-loading';
    loading.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:#8a6b73;font-size:13px;';
    loading.textContent = '前端正在加载…';
    root.appendChild(loading);

    let html: string;
    try {
      html = await fetchHtml(BASE_URL);
      console.log('[pellucid] fetched from testingcf, html', html.length, 'bytes');
    } catch (e1: any) {
      console.warn('[pellucid] testingcf 失败,回落 cdn:', e1?.message ?? e1);
      loading.textContent = '回落镜像加载中…';
      try {
        html = await fetchHtml(FALLBACK_URL);
        console.log('[pellucid] fetched from cdn, html', html.length, 'bytes');
      } catch (e2: any) {
        console.error('[pellucid] 两个镜像都失败:', e2?.message ?? e2);
        loading.textContent = '⚠ 前端加载失败';
        loading.style.color = '#e06666';
        loadPromise = null;
        return;
      }
    }

    injectIframe(root, html);
  })();
  return loadPromise;
}

function init() {
  console.log('[pellucid] init 启动 (top doc readyState=' + topDoc.readyState + ')');
  tryLoadOnce();
}

if (topDoc.readyState === 'loading') {
  topDoc.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
