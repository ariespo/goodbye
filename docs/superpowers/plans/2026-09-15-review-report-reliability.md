# 审查报告可靠性修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement and review each bounded task.

**Goal:** 修复固定版本19次尝试中7次失败对应的报告格式、字段、引用和听众依据问题，保持事实权限与失败不提交边界。

**Architecture:** 保留既有串行提交和同一次正文审查。程序生成完整输出要求，行号引用回填可见原文；错误报告在既有一次纠正机会内处理，真实语义违规仍由编剧修复。兼容历史报告，不把结构合规当成语义通过。

**Tech Stack:** TypeScript、Vitest、现有 JSON Schema 与游戏编排。

**Spec:** 用户已接受本任务此前提出的五类方案，并要求继续实施；不引入 Skill、不常规增加调用、不放松审查。

## 边界与已知证据

- 基线 `8b148f3`；复用独立工作树 `F:/farewell-day-action-authority`。
- 原始记录 `.codex-test-tmp/day-evaluation/options-standard-audit946ce32-g37juice-c1.json`；只提取脱敏样本入库。
- attempt7 行动审查将非相邻台词拼接为 quote，触发精确引文校验。改为显式行号集合，仍验证存在、类型、范围、完整覆盖与语义判定。
- `NARRATIVE_CONTINUITY_REVIEW` 残留五字段说明，和新增 actionAudit 冲突；需要统一协议来源。
- 格式问题不得静默补 pass、空审计或丢掉真实违规；听众与来源事实须继续严格校验。

## Task 1 — 行动审查引用

Files: `action-audit.ts`、其测试；root 集成 `schemas.ts`、`prompts.ts`、`narrative-review.ts` 及整合测试。

- [x] 添加非相邻可见行引用和非法行号的失败回归。
- [x] 新输出要求 evidenceLineIndices，程序回填原文并验证；保留旧 quote 结构的严格兼容。
- [x] 明确 pass 必须有真实依据、fail 可报告遗漏、事件不适用；所有旧安全回归保留。

## Task 2 — 结构化输出与纠正

Files: `structured.ts`、`structured.test.ts`；root 集成统一正文协议及 schema。

- [x] 根据实际网关返回检查不支持字段及有效输出模式。
- [x] 清理五字段冲突，在既有纠正请求中提供当前完整结构和精确错误路径，禁止补造结果。
- [x] 覆盖 schema 回退、错误 JSON、缺字段、第二次仍无效、取消信号与成功单次调用。

## Task 3 — 听众与事实来源

Files: 按只读调查结果限定到 `fact-assertion-review.ts`、`character-continuity.ts` 或提示词的必要位置及测试。

- [x] 区分确实越权与报告引用/听众依据错误，记录最小复现。
- [x] 提供明确证据范围和合法空结果；若程序误拒则针对根因修复，不降低跨场景、角色知情或语义边界。
- [x] 负向验证未知听众、无关来源、角色越权与真正未支持断言不能放行。

## Task 4 — 验收和交付

- [x] 定向测试、全量测试、lint、build。
- [x] 独立复审并修复重要问题。
- [x] 七样本提取验证完成并启动真实复测；上游503与超时后中断，记录调用模式和失败，未宣称真实通过率。
- [x] 保存范围、结果和限制，提交完成改动。
