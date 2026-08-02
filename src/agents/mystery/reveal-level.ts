import { REVEAL_LEVELS, type RevealLevel } from './types';

export function revealLevelRank(level: RevealLevel): number {
  return REVEAL_LEVELS.indexOf(level);
}

export function isRevealAtMost(level: RevealLevel, maximum: RevealLevel): boolean {
  return revealLevelRank(level) <= revealLevelRank(maximum);
}

export function lowerRevealLevel(a: RevealLevel, b: RevealLevel): RevealLevel {
  return revealLevelRank(a) <= revealLevelRank(b) ? a : b;
}
