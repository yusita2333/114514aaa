// Vue 编译期 feature flags 的运行时兜底 · 必须最先执行(index.ts 的第一个 import)
// 背景: pinia 走 CDN esm 外部加载,其产物裸引用 __VUE_PROD_DEVTOOLS__ 等编译期 flag。
//   我们自己的 bundle 由 DefinePlugin 替换,但外部 esm 不经过我们的编译——flag 未定义即抛
//   ReferenceError,曾导致点击展开后黑屏(host 建了 App 没挂上)。
// 在 globalThis 上补齐这些 flag,裸引用沿作用域链解析到全局属性,任何 pinia 版本都能跑。
/* eslint-disable @typescript-eslint/no-explicit-any */
const g = globalThis as any;
if (g.__VUE_OPTIONS_API__ === undefined) g.__VUE_OPTIONS_API__ = true;
if (g.__VUE_PROD_DEVTOOLS__ === undefined) g.__VUE_PROD_DEVTOOLS__ = false;
if (g.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ === undefined) g.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__ = false;

export {};
