import type { Mood, Scene, SceneLine } from '../sillytavern/types';

export const CHEN_HUIHUI_CHOCOLATE_EVENT = 'insight:chen-huihui-hypoglycemia';
export const CHEN_HUIHUI_ANGRY_ANIMATION_MS = 25 * 42;

function isChenHuihui(line: Pick<SceneLine, 'speaker' | 'character'>): boolean {
  return /陈慧慧|便利店员|chen-huihui/i.test(`${line.speaker}|${line.character ?? ''}`);
}

function isOldMan(line: Pick<SceneLine, 'speaker' | 'character'>): boolean {
  return /周德明|周德星|周大爷|独居老头|老头|old-man/i.test(`${line.speaker}|${line.character ?? ''}`);
}

function isLinJing(line: Pick<SceneLine, 'speaker' | 'character'>): boolean {
  return /林静|侦探\s*B|陌生女人|detective-b/i.test(`${line.speaker}|${line.character ?? ''}`);
}

function knownEventSet(variables: Record<string, unknown>): Set<string> {
  const value = variables.knowledgeEvents;
  return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
}

export function isZhouDemingConfirmedKiller(variables: Record<string, unknown>): boolean {
  const knowledge = variables.mysteryKnowledge;
  if (!knowledge || typeof knowledge !== 'object' || Array.isArray(knowledge)) return false;
  return (knowledge as Record<string, unknown>)['a-murder-staged-fall'] === 'confirmation';
}

/**
 * Huihui's first angry presentation is permitted only when the same playable
 * scene renders the complete chocolate reveal after it. This is deliberately
 * stricter than a prompt: malformed AI output can never expose the animation.
 */
export function sceneHasStructuredHuihuiAngryReveal(scene: Pick<Scene, 'lines'>): boolean {
  const eventIndex = scene.lines.findIndex(line =>
    line.knowledgeEvents?.includes(CHEN_HUIHUI_CHOCOLATE_EVENT),
  );
  if (eventIndex < 0) return false;

  const angryIndex = scene.lines.findIndex((line, index) =>
    index < eventIndex && isChenHuihui(line) && line.emotion === 'angry',
  );
  if (angryIndex < 0) return false;

  const revealLines = scene.lines.slice(angryIndex + 1, eventIndex + 1);
  const revealText = revealLines.map(line => line.text).join('\n');
  const hasDirectComplaint = revealLines.some(line =>
    isChenHuihui(line) && (/收银员.{0,24}文件夹/.test(line.text) || /文件夹.{0,24}收银员/.test(line.text)),
  );
  return /低血糖/.test(revealText) && /巧克力/.test(revealText) && hasDirectComplaint;
}

export function canShowHuihuiAngry(
  scene: Pick<Scene, 'lines' | 'emotionPolicyContext'>,
  variables: Record<string, unknown>,
): boolean {
  const containsRevealEvent = scene.lines.some(line =>
    line.knowledgeEvents?.includes(CHEN_HUIHUI_CHOCOLATE_EVENT),
  );
  if (containsRevealEvent) return sceneHasStructuredHuihuiAngryReveal(scene);
  const knownAtSceneStart = scene.emotionPolicyContext?.huihuiChocolateKnownAtSceneStart
    ?? knownEventSet(variables).has(CHEN_HUIHUI_CHOCOLATE_EVENT);
  return knownAtSceneStart;
}

function sceneConfirmsZhouBeforeLine(scene: Pick<Scene, 'lines'>, line: SceneLine): boolean {
  const lineIndex = scene.lines.indexOf(line);
  if (lineIndex <= 0) return false;
  const priorText = scene.lines.slice(0, lineIndex).map(candidate => candidate.text).join('\n');
  return /(周德明|周大爷|老头|他).{0,32}(凶手|杀害了?文穗|杀了文穗|把文穗推下|推下二楼).{0,32}/.test(priorText)
    || /(凶手|杀害了?文穗|杀了文穗|把文穗推下|推下二楼).{0,32}(周德明|周大爷|老头|是他)/.test(priorText);
}

function sceneConfirmsZhouAfterLine(scene: Pick<Scene, 'lines'>, line: SceneLine): boolean {
  const lineIndex = scene.lines.indexOf(line);
  if (lineIndex < 0) return false;
  const laterText = scene.lines.slice(lineIndex + 1).map(candidate => candidate.text).join('\n');
  return /(周德明|周大爷|老头|他).{0,32}(凶手|杀害了?文穗|杀了文穗|把文穗推下|推下二楼).{0,32}/.test(laterText)
    || /(凶手|杀害了?文穗|杀了文穗|把文穗推下|推下二楼).{0,32}(周德明|周大爷|老头|是他)/.test(laterText);
}

export function resolveAllowedCharacterPresentation(
  line: SceneLine,
  scene: Pick<Scene, 'lines' | 'emotionPolicyContext'>,
  variables: Record<string, unknown>,
): { emotion: Mood; character?: string } {
  if (isLinJing(line)) {
    return { emotion: 'calm', character: 'detective-b-normal.png' };
  }
  const zhouConfirmedAtSceneStart = scene.emotionPolicyContext?.zhouKillerConfirmedAtSceneStart
    ?? isZhouDemingConfirmedKiller(variables);
  if (isOldMan(line) && line.emotion === 'insane'
    && (!zhouConfirmedAtSceneStart || sceneConfirmsZhouAfterLine(scene, line))
    && !sceneConfirmsZhouBeforeLine(scene, line)) {
    return { emotion: 'angry', character: 'old-man-angry.png' };
  }
  if (isChenHuihui(line) && line.emotion === 'angry' && !canShowHuihuiAngry(scene, variables)) {
    return { emotion: 'calm', character: 'chen-huihui-normal.png' };
  }
  return { emotion: line.emotion ?? 'calm', character: line.character };
}

export function applyCharacterEmotionPolicies(
  scene: Scene,
  variables: Record<string, unknown>,
): Scene {
  const alreadyKnowsChocolate = scene.emotionPolicyContext?.huihuiChocolateKnownAtSceneStart
    ?? knownEventSet(variables).has(CHEN_HUIHUI_CHOCOLATE_EVENT);
  const permitHuihuiAngry = canShowHuihuiAngry(scene, variables);
  const lines = scene.lines.map(line => {
    const presentation = resolveAllowedCharacterPresentation(line, scene, variables);
    const knowledgeEvents = !alreadyKnowsChocolate && !permitHuihuiAngry
      ? line.knowledgeEvents?.filter(eventId => eventId !== CHEN_HUIHUI_CHOCOLATE_EVENT)
      : line.knowledgeEvents;
    return {
      ...line,
      emotion: presentation.emotion,
      character: presentation.character,
      ...(knowledgeEvents?.length ? { knowledgeEvents } : { knowledgeEvents: undefined }),
    };
  });

  if (permitHuihuiAngry && !alreadyKnowsChocolate) {
    const eventIndex = lines.findIndex(line =>
      line.knowledgeEvents?.includes(CHEN_HUIHUI_CHOCOLATE_EVENT),
    );
    let finalAngryIndex = -1;
    for (let index = 0; index < eventIndex; index += 1) {
      if (isChenHuihui(lines[index]) && lines[index].emotion === 'angry') finalAngryIndex = index;
    }
    if (finalAngryIndex >= 0) {
      lines[finalAngryIndex] = {
        ...lines[finalAngryIndex],
        minimumDisplayMs: CHEN_HUIHUI_ANGRY_ANIMATION_MS,
      };
    }
  }

  return {
    ...scene,
    lines,
    character: lines[0]?.character,
    mood: lines[0]?.emotion,
  };
}
