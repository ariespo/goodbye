import type { Ending, EndingConditionItem } from './types';
import { getVariablePath } from './vars-merger';

const TAG_PRIORITY: Record<Ending['tag'], number> = {
  hidden: 500,
  true: 400,
  good: 300,
  bad: 200,
  normal: 100,
};

export function checkEndingConditions(
  variables: Record<string, any>,
  endings: Ending[],
  endingsSeen: string[] = []
): Ending | null {
  const matched = endings
    .filter(ending => !endingsSeen.includes(ending.id))
    .filter(ending => ending.conditionGroups.length > 0)
    .filter(ending => ending.conditionGroups.every(group => {
      const checks = group.conditions.map(condition => evaluateCondition(variables, condition));
      return group.mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
    }))
    .sort((a, b) => {
      const tagDiff = TAG_PRIORITY[b.tag] - TAG_PRIORITY[a.tag];
      if (tagDiff !== 0) return tagDiff;
      return a.order - b.order;
    });

  return matched[0] ?? null;
}

function evaluateCondition(variables: Record<string, any>, condition: EndingConditionItem): boolean {
  const currentValue = getVariablePath(variables, condition.variablePath);
  const targetValue = condition.targetValue;

  switch (condition.operator) {
    case '>=':
      return Number(currentValue) >= Number(targetValue);
    case '<=':
      return Number(currentValue) <= Number(targetValue);
    case '>':
      return Number(currentValue) > Number(targetValue);
    case '<':
      return Number(currentValue) < Number(targetValue);
    case '=':
      return currentValue === targetValue || String(currentValue) === String(targetValue);
    case '!=':
      return currentValue !== targetValue && String(currentValue) !== String(targetValue);
    default:
      return false;
  }
}
