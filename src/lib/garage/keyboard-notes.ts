import type { ComputerId } from './computers';

export const keyboardNoteIds = ['1', '2', '3', '4'] as const;
export type KeyboardNoteId = (typeof keyboardNoteIds)[number];
export type KeyboardAction = `${ComputerId}-keyboard` | `${ComputerId}-note-${KeyboardNoteId}`;

/** Four sounds from one decoded recording; timings are relative to its PCM audio. */
export const keyboardSampleUrl = '/assets/audio/computers/koi-mil-gaya-keyboard.mp3';
export const keyboardNotes: Record<
  KeyboardNoteId,
  { color: string; offset: number; duration: number }
> = {
  // Leave 15 ms between the opening syllables to exclude the second articulation from key 1.
  '1': { color: '#c5a369', offset: 0.59, duration: 0.365 },
  '2': { color: '#8ea58b', offset: 0.97, duration: 0.435 },
  '3': { color: '#839eab', offset: 1.405, duration: 1.33 },
  '4': { color: '#b78470', offset: 3.912, duration: 0.898 },
};

export function keyboardNoteAction(computer: ComputerId, note: KeyboardNoteId): KeyboardAction {
  return `${computer}-note-${note}`;
}

export function parseKeyboardTarget(action: string | null) {
  const match = /^(kazam|projects)-(?:keyboard|note-([1-4]))$/.exec(action ?? '');
  return match
    ? { computer: match[1] as ComputerId, note: (match[2] ?? '1') as KeyboardNoteId }
    : null;
}

export function keyboardNoteFromKey(key: string): KeyboardNoteId | null {
  return /^[1-4]$/.test(key) ? (key as KeyboardNoteId) : null;
}
