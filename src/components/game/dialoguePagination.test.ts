import { describe, expect, it } from 'vitest';
import { paginateDialogueText, resolveDialogueAdvance } from './dialoguePagination';

describe('paginateDialogueText', () => {
  it('prefers a sentence-ending punctuation boundary that fits the frame', () => {
    const pages = paginateDialogueText('甲甲。乙乙乙', candidate => candidate.length <= 5);

    expect(pages).toEqual(['甲甲。', '乙乙乙']);
  });

  it('falls back to character boundaries when one sentence is taller than the frame', () => {
    const pages = paginateDialogueText('甲乙丙丁戊己庚辛壬', candidate => candidate.length <= 4);

    expect(pages).toEqual(['甲乙丙丁', '戊己庚辛', '壬']);
  });
});

describe('resolveDialogueAdvance', () => {
  it('finishes the current page before revealing the next page or line', () => {
    expect(resolveDialogueAdvance({ pageComplete: false, hasNextPage: true, hasNextLine: true })).toBe('finish-page');
    expect(resolveDialogueAdvance({ pageComplete: true, hasNextPage: true, hasNextLine: true })).toBe('next-page');
    expect(resolveDialogueAdvance({ pageComplete: true, hasNextPage: false, hasNextLine: true })).toBe('next-line');
    expect(resolveDialogueAdvance({ pageComplete: true, hasNextPage: false, hasNextLine: false })).toBe('done');
  });
});
