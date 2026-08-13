// 开场白引用(批G2·用户定稿方案)
// 真相源=角色卡 first_mes(第0楼): 前端运行时经酒馆助手 getChatMessages(0) 读取,剥离状态栏 placeholder。
// 不再把开场白硬编码为真相源——卡改开场白,前端教程自动跟随。内置 FALLBACK=发布版开场白(读取失败/本地dev兜底)。

declare function getChatMessages(id: number | string): { message: string }[];

export const OPENING_FALLBACK = "极道组织九条会，据传乃五摄家九条氏的分家。始祖因与鬼结合，被本家驱逐，至今不被接纳。\r\n然而尽管被驱逐，九条分家的后代却凭借着体内流淌的恶鬼之血打下一片基业，乃至占山为王。\r\n时间来到现代，背负恶鬼之血的九条分家因得不到华族的承认，逐渐将势力转入地下，变为极道组织——九条会。\r\n这样的九条会，又在数年前因会长与其夫人遭遇暗杀，家产被分家瓜分而日渐衰落。\r\n被遗留在这世间的会长之女，其名九条凛，便是故事的主人公。\r\n背负九条分家之血，九条凛自幼便被发掘出极其浓厚的鬼之血脉，不仅拥有更强的武力，更强的恢复力，浓郁的鬼之血更是外显于其身，那便是九条分家血脉的顶点——罗刹瞳。\r\n如血般鲜红，如鬼般狠厉，拥有鬼之眸的少女。为了追寻父母遇害的真相，接过了九条会长之位，踏上了复仇之路。\r\n十年之后，曾经的少女已经成长为了高贵冷艳的成熟女性，她注定执掌力量，讨伐所有仇敌……\r\n虽然说是这样，但很遗憾的是，这个世界没有那么简单，复仇也没有那么容易。\r\n家财被亲戚们席卷一空，手下作鸟兽散，一无所有的九条大小姐想要复仇，想要重新振兴自家的九条会，手中俨然已经无牌可打。\r\n为了笼络手下的打手，她能给出的东西，只有自己的肉体。\r\n而今天劳累一天，在回家之前的那一刻，九条大小姐要做的第一件事——是去买避孕套。";

/** 读取开场白正文: 卡内第0楼(剥placeholder) → 失败用内置兜底 */
export function getOpeningStory(): string {
  try {
    if (typeof getChatMessages === 'function') {
      const raw = getChatMessages(0)?.[0]?.message ?? '';
      const t = raw.replace(/<StatusPlaceHolderImpl\/>/g, '').trim();
      if (t.length > 50) return t; // 过短=占位/异常,走兜底
    }
  } catch { /* 楼层不可读→兜底 */ }
  return OPENING_FALLBACK;
}
