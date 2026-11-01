/** Computer power recordings; null selects the synthesized cue. */
export type ClipCue = 'power-on' | 'power-off';
export const garageAudioClips: Record<ClipCue, string | null> = {
  'power-on': '/assets/audio/computers/windows-xp-startup.mp3',
  'power-off': '/assets/audio/computers/windows-xp-shutdown.mp3',
};
