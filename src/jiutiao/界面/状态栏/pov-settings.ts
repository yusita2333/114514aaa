// pov-settings · 男性视角开关(批H2·用户需求: 以打手小头目POV体验故事)
// 开启时: 读酒馆 {{user}} 名(substitudeMacros)作为男主人公名,注入视角层——
// 正文以"九条会打手小头目·<名字>"的男性视角展开,可与九条凛互动。默认关闭=原第三人称跟随凛。
// 偏好存 localStorage(跨聊天全局)。

declare function substitudeMacros(text: string): string;

const KEY = 'pellucid_male_pov';
let malePov = false;
try { malePov = localStorage.getItem(KEY) === '1'; } catch { /* 无localStorage默认关 */ }

export function getMalePov(): boolean { return malePov; }
export function setMalePov(v: boolean) {
  malePov = v;
  try { localStorage.setItem(KEY, v ? '1' : '0'); } catch { /* 忽略 */ }
}

/** 读酒馆用户名({{user}}宏)。失败/空 → '小头目'(兜底称呼)。 */
export function getUserName(): string {
  try {
    if (typeof substitudeMacros === 'function') {
      const n = substitudeMacros('{{user}}').trim();
      if (n && n !== '{{user}}') return n.slice(0, 24);
    }
  } catch { /* 兜底 */ }
  return '小头目';
}

/**
 * 视角层文本(注入 prompt·开启时替换默认视角硬约束)。
 * 男主=九条会打手小头目(在场打手中的头目·可与凛互动·参与事件),视角=第三人称贴身跟随男主(或男主主观视角)。
 */
export function buildMalePovDirective(): string {
  const name = getUserName();
  return (
    `2. 【叙事视角·硬约束(男性视角模式)】玩家的化身是「${name}」——九条会的打手小头目,打手们的直属头目,深得会长信任。正文视角规则:\n`
    + `   · 以${name}的视角展开叙事(第三人称贴身跟随${name},或以${name}的主观视角),他亲身在场、亲身参与本格事件;\n`
    + `   · ${name}可以与九条凛直接互动(对话/命令/亲手参与),NSFW场景中他是参与者之一(通常是主导或首个);\n`
    + `   · 凛仍以"凛/她"称呼,她的反应与堕落刻画不减——视角换了,她仍是舞台中心;\n`
    + `   · 其余打手仍是匿名群像(不给${name}以外的打手起名);会长若需提及仍称"会长",${name}是会长麾下的头目;\n`
    + `   · 【严禁】用"你"称呼${name}或任何角色(不写第二人称),${name}一律用名字或"他"。\n`
  );
}
