// 构建版本号（每次发版 pack 前同步更新）。显示在刊头副标题 + 控制台，
// 便于一眼确认"当前加载的是哪一版"，排查 jsdelivr/缓存/旧聊天导致的版本错乱。
export const BUILD_VERSION = 'v1.8.2';

/**
 * DEBUG 测试档开关：true 时①新开局直接高配(巨款/大量打手/高威望/多行动格,免从头肝)
 * ②设置页出现 DEBUG 工具条(加堕落度/资金/打手/AV拍摄数等,精确跳到中后期任意测试点)。
 * ⚠️ 发正式版前置 false 并去掉版本号 -debug 后缀。
 */
export const DEBUG_BUILD = false;
