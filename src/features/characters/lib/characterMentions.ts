import type { CharacterLink, Story } from '../../../domain/model.ts';
import { MEMBERSHIP_CATEGORIES } from '../../world/lib/worldProfile.ts';

export type MentionKind = 'character' | 'organization';
export type MentionCandidate = { id: string; title: string; description: string; kind: MentionKind };
export type MentionQuery = { start: number; end: number; query: string };

// Feature: imports accept only nonoverlapping mention ranges inside their original plain-text field.
export function validCharacterLinks(value: unknown, links: unknown): links is CharacterLink[] {
  if (typeof value !== 'string' || !Array.isArray(links)) return false;
  const ordered = [...links].sort((a, b) => (a?.start ?? 0) - (b?.start ?? 0));
  return ordered.every((link, index) => link && typeof link === 'object' && typeof link.targetId === 'string' && !!link.targetId
    && Number.isInteger(link.start) && Number.isInteger(link.end) && link.start >= 0 && link.end > link.start && link.end <= value.length
    && value[link.start] === '@' && (!index || ordered[index - 1].end <= link.start));
}

// Feature: affiliation suggestions include saved factions and families alongside existing organizations.
export function mentionCandidates(story: Story, kind: MentionKind, characterId?: string): MentionCandidate[] {
  const entries = kind === 'character' ? story.characters.filter((entry) => entry.id !== characterId) : story.worldbuilding.filter((entry) => MEMBERSHIP_CATEGORIES.includes(entry.category));
  // Feature: structured personality, group purpose or family origins can supply a preview before a long description is written.
  return entries.map((entry) => ({ id: entry.id, title: entry.title, kind, description: entry.content.trim() || (kind === 'character' ? entry.characterProfile?.personality?.trim() : entry.worldProfile?.purpose?.trim() || entry.worldProfile?.origins?.trim()) || '' }));
}

// Feature: typing @ or @/ at the caret opens search, while email addresses and existing linked chips are ignored.
export function mentionQuery(value: string, caret: number, links: CharacterLink[] = []): MentionQuery | null {
  const end = Math.max(0, Math.min(value.length, caret));
  if (!end) return null;
  const start = value.lastIndexOf('@', end - 1);
  if (start < 0 || (start > 0 && /[\p{L}\p{N}_@]/u.test(value[start - 1])) || links.some((link) => start >= link.start && start < link.end)) return null;
  const query = value.slice(start + 1, end).replace(/^\//, '');
  return /^[\p{L}\p{N}_ -]{0,80}$/u.test(query) ? { start, end, query } : null;
}

// Feature: underscores and spaces are interchangeable when searching @/org_name and multiword character names.
export function filterMentionCandidates(candidates: MentionCandidate[], query: string) {
  const normalized = query.replace(/_/g, ' ').trim().toLocaleLowerCase();
  return candidates.filter((candidate) => candidate.title.replace(/_/g, ' ').toLocaleLowerCase().includes(normalized));
}

// Feature: surrounding text edits shift linked ranges; editing inside a link safely converts it to ordinary text.
export function moveCharacterLinks(before: string, after: string, links: CharacterLink[]): CharacterLink[] {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let oldEnd = before.length, newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) { oldEnd--; newEnd--; }
  const delta = newEnd - oldEnd;
  return links.flatMap((link) => link.end <= start ? [{ ...link }] : link.start >= oldEnd ? [{ ...link, start: link.start + delta, end: link.end + delta }] : []);
}

// Feature: choosing a suggestion inserts its readable name and an explicit stable target, preserving other mentions.
export function insertCharacterMention(value: string, links: CharacterLink[], query: MentionQuery, candidate: MentionCandidate) {
  const label = (candidate.kind === 'organization' ? '@/' : '@') + candidate.title;
  const next = value.slice(0, query.start) + label + ' ' + value.slice(query.end);
  const shifted = moveCharacterLinks(value, next, links);
  return { value: next, links: [...shifted, { targetId: candidate.id, start: query.start, end: query.start + label.length }].sort((a, b) => a.start - b.start), caret: query.start + label.length + 1 };
}
