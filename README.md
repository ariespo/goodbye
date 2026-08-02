# 漫长的告别 / Farewell Web

一款以暴雨、调查与时间轮回为核心的浏览器叙事游戏。玩家会在多次9月9日中积累线索，沿五条基础真相路线与两条解释层路线抵达不同结局。

当前版本：`0.8.0`。项目处于可玩测试阶段，尚未作为正式发行版发布。

剧情术语、轮回计数、前三轮节奏和 Agent 权限的权威约束见 [`docs/agent-story-contract.md`](docs/agent-story-contract.md)。

## 本地运行

需要 Node.js 和 npm。

```bash
npm ci
npm run dev
```

正式校验：

```bash
npm run build
npm test -- --run
npm run lint
```

## 核心结构

- `src/agents/mystery/`：Fact Gate、Director、事实审查和Writer隔离。
- `src/agents/state/`：独立State Agent，只提交带原文证据的受限状态补丁。
- `src/engine/game-transaction.ts`：统一结算时间、资源成本、定时事件、结局和轮回失败。
- `src/data/`：地点、人物知识、资源目录与游戏数据。
- `public/assets/`：实际运行时资源。
- `docs/development-assets/`：不会进入生产包的候选图和美术过程文件。

## 数据与API

设置、存档和聊天保存在浏览器本地。API Key不会发送到本项目服务器，但调用模型时会直接发送给用户配置的AI服务商。建议只使用可信服务商，并为Key设置最小权限和额度限制。

## 路线

基础路线：A、B、C、NONE、FAKE。

解释层：CULT叠加于A，PSYCH叠加于C。已见结局和跨路线进度独立持久化，不会因开始新游戏而清空。
