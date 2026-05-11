import type { Lorebook, LorebookEntry } from './types';

export interface MatchedEntry {
  entry: LorebookEntry;
  lorebookName: string;
  matchedKeys: string[];
}

export function scanLorebooks(
  lorebooks: Lorebook[],
  activeIds: string[],
  text: string,
  options: {
    caseSensitive?: boolean;
    matchWholeWords?: boolean;
  } = {}
): MatchedEntry[] {
  const activeBooks = lorebooks.filter(b => activeIds.includes(b.id));
  const matches: MatchedEntry[] = [];

  for (const book of activeBooks) {
    for (const entry of book.entries) {
      if (!entry.enabled) continue;

      const matchedKeys = matchEntry(entry, text, options);
      if (matchedKeys.length > 0) {
        matches.push({
          entry,
          lorebookName: book.name,
          matchedKeys,
        });
      }
    }
  }

  return matches.sort((a, b) => b.entry.order - a.entry.order);
}

function matchEntry(
  entry: LorebookEntry,
  text: string,
  options: { caseSensitive?: boolean; matchWholeWords?: boolean }
): string[] {
  const { caseSensitive = false, matchWholeWords = false } = options;
  const searchText = caseSensitive ? text : text.toLowerCase();
  const matched: string[] = [];

  for (const key of entry.key) {
    if (!key.trim()) continue;
    const searchKey = caseSensitive ? key : key.toLowerCase();

    if (matchWholeWords) {
      const regex = new RegExp(`\\b${escapeRegex(searchKey)}\\b`, caseSensitive ? 'g' : 'gi');
      if (regex.test(searchText)) matched.push(key);
    } else {
      if (searchText.includes(searchKey)) matched.push(key);
    }
  }

  return matched;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildLorebookPrompt(matches: MatchedEntry[]): string {
  if (matches.length === 0) return '';

  const sections = matches.map(m => {
    const header = m.entry.comment ? `[${m.entry.comment}]` : '';
    return `${header}\n${m.entry.content}`.trim();
  });

  return sections.join('\n\n');
}
