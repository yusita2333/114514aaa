// 地盘系统 · 类型定义（数据驱动·可扩展）
// 设计正典 §7：地盘解锁=击败该区域boss(复仇目标)。每个复仇目标=一片区域的boss。
// 击败=玩家武力+门槛已削减≥击败门槛(贿赂/调查降门槛)。击败→解锁该区域。
// 扩展原则：新区域=往 REGIONS append 一条 RegionDef，引擎只认结构。

/** 区域产出（据点 faucet：避孕套进货/资金/威望，每日结算） */
export interface RegionYields {
  condom?: number;   // 避孕套进货量
  money?: number;    // 资金
  martial?: number;  // 极道威望
}

/** 一个地盘区域定义（=一片地盘 + 把守它的复仇boss） */
export interface RegionDef {
  id: string;
  name: string;
  bossName: string;          // 复仇目标=区域boss(小关=无名据点;中心关=实义boss)
  defeatThreshold: number;   // 击败门槛(基础);玩家武力+门槛已削减≥此值=可击败
  yields: RegionYields;      // 据点产出(解锁后每日)
  garrisonNeed: number;      // 驻防需求(守住要多少打手;进攻事件判定用)
  shops?: number;            // 该区域含店铺数(解锁后计入采购上限)
  requiresRegion?: string;   // 前置区域(必须先解锁某区域才能打);空=初始可打
  sidelineSettlement?: boolean; // 旁系清算(后期一次性事件,非阶段主线)
  /** 所属阶段(1-4)。同阶段=同一片地图。占满本阶段10小关→解锁中心关;击败中心关→解锁下一阶段。 */
  stage: number;
  /** 是否为中心关(Boss关)。每阶段1个,更高产出更难门槛,需占满本阶段全部小关才可打。 */
  isCenter?: boolean;
}

/** 区域运行时状态（按 region id 索引,存 EngineState.regions） */
export interface RegionState {
  defeated: boolean;        // boss是否已击败(=区域已解锁)
  thresholdReduced: number; // 贿赂/调查累积削减的门槛量
  garrison: number;         // 已派驻守此区域的打手
  intel?: boolean;          // 是否已刺探到情报(解锁该关的贿赂降门槛资格)
}
