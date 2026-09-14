import { getCanonicalBackgroundId } from '../data/backgroundAssets';
import type { Scene } from '../sillytavern/types';
import { actionNarrativeContextError, type ActionNarrativeContext } from './action-narrative-context';

/** Check earlier work as well as the terminal scene, without applying one
 * location's NPC restrictions to an unrelated later location. */
export function actionSequenceNarrativeError(contexts: readonly ActionNarrativeContext[], scene: Pick<Scene, 'lines'>): string | null {
  const destinations: number[] = [];
  let cursor = 0;
  for (const context of contexts) {
    const background = getCanonicalBackgroundId(context.background);
    const index = scene.lines.findIndex((line, position) => position >= cursor
      && !!line.background && getCanonicalBackgroundId(line.background) === background);
    if (index < 0) return `正文没有按执行顺序呈现 ${context.locationId} 的实际行动。`;
    destinations.push(index);
    cursor = index + 1;
  }
  const routeStart = (index: number) => {
    const previousDestination = index > 0 ? destinations[index - 1] : -1;
    const street = scene.lines.findIndex((line, position) => position > previousDestination
      && position < destinations[index] && !!line.background && getCanonicalBackgroundId(line.background) === 'street');
    return street >= 0 ? street : destinations[index];
  };
  for (const [index, context] of contexts.entries()) {
    const start = routeStart(index);
    const end = index + 1 < contexts.length ? routeStart(index + 1) : scene.lines.length;
    const error = actionNarrativeContextError(context, { lines: scene.lines.slice(start, end) });
    if (error) return error;
  }
  return null;
}
