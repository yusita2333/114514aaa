// 招募文案变体(批C1·待办#3) · 纯代码模板池
// 双线10种: 极道线(因武威名声加入) / 淫名线(因大小姐AV慕名加入)。
// 按 极道威望 vs 淫名 占比加权随机选线——淫名越高,越多人是"冲着大小姐来的"。

/** 极道线(威名):5 种 */
const MARTIAL_LINES = [
  '街面上传开了九条会重新抬头的名声,几条汉子主动寻上门来,说想跟着能打的会长混口饭吃。',
  '上个月火并的战果被添油加醋传遍了赌场和酒馆,几个亡命徒慕名投靠,拍着胸脯要为九条会卖命。',
  '隔壁区几个被打散的小组员走投无路,听闻九条会收人,结伴来到宅门前低头递了名帖。',
  '道场里的动静瞒不住人——九条会招兵买马的消息不胫而走,今天又有壮汉登门,说宁可跟强的。',
  '收保护费的兄弟顺路放了话:九条会缺人手。傍晚就有几个横肉脸的家伙蹲在门口等着面谈。',
];

/** 淫名线(大小姐AV/肉体名声):5 种 */
const INFAMY_LINES = [
  '新来的几个家伙眼神藏不住——他们是看过大小姐的片子才来的,面试时喉结一直在动。',
  '暗网论坛上九条会的"福利待遇"被传得有鼻子有眼,今天来应募的人里,一半是冲着大小姐的小穴来的。',
  '有人拿着打印出来的截图来问"这是真的吗",得到肯定答复后当场按了手印,连月钱都没问。',
  '几个外区的浪人交了投名状,私下里嘀咕着"听说夜里排得上号",登记的干部装作没听见。',
  '招募处排起了小队——比起月钱,新人们更关心的显然是传闻里"供奉"的资格,一个个摩拳擦掌。',
];

/**
 * 按威望占比选一条招募文案。以 淫名/(极道+淫名) 的概率走淫名线。
 * @param rng 0..1 随机源(注入保证可测)
 */
export function recruitFlavorLine(martial: number, infamy: number, rng: () => number): string {
  const m = Math.max(0, martial), i = Math.max(0, infamy);
  const total = m + i;
  const useInfamy = total > 0 && rng() < i / total;
  const pool = useInfamy ? INFAMY_LINES : MARTIAL_LINES;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** 完整快进文案: 风味行 + 结果行 */
export function recruitSummaryText(
  martial: number, infamy: number, recruited: number, cost: number, rng: () => number,
): string {
  const flavor = recruitFlavorLine(martial, infamy, rng);
  const result = recruited > 0
    ? `本次招入 ${recruited} 名打手,花费 ¥${cost}。`
    : '本次没有招到人(额度已尽或资金不足)。';
  return `${flavor}\n${result}`;
}
