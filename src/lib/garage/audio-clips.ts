/**
 * Local recordings for physical keyboards and computer power switches.
 * Null selects the original synthesized cue without a recording request.
 */
export type ClipCue = 'alien' | 'power-on' | 'power-off';
export const garageAudioClips: Record<ClipCue, string | null> = {
  alien: '/assets/audio/computers/koi-mil-gaya-keyboard.mp3',
  'power-on': '/assets/audio/computers/windows-xp-startup.mp3',
  'power-off': '/assets/audio/computers/windows-xp-shutdown.mp3',
};
