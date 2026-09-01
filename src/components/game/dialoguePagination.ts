export type DialogueAdvance = 'finish-page' | 'next-page' | 'next-line' | 'done';

const PREFERRED_BREAK = /[。！？；…\n]/u;

export function paginateDialogueText(text: string, fits: (candidate: string) => boolean): string[] {
  if (!text) return [''];

  const pages: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (fits(remaining)) {
      pages.push(remaining);
      break;
    }

    let low = 1;
    let high = remaining.length;
    let longestFit = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(remaining.slice(0, middle))) {
        longestFit = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }

    const hardBreak = Math.max(1, longestFit);
    let preferredBreak = 0;
    for (let index = 0; index < hardBreak; index += 1) {
      if (PREFERRED_BREAK.test(remaining[index])) preferredBreak = index + 1;
    }

    const breakAt = preferredBreak || hardBreak;
    pages.push(remaining.slice(0, breakAt).trimEnd());
    remaining = remaining.slice(breakAt).replace(/^\s+/u, '');
  }

  return pages.length > 0 ? pages : [''];
}

export function resolveDialogueAdvance({
  pageComplete,
  hasNextPage,
  hasNextLine,
}: {
  pageComplete: boolean;
  hasNextPage: boolean;
  hasNextLine: boolean;
}): DialogueAdvance {
  if (!pageComplete) return 'finish-page';
  if (hasNextPage) return 'next-page';
  if (hasNextLine) return 'next-line';
  return 'done';
}
