/**
 * Optional rights-cleared local clips for physical keyboards and power switches.
 * Null uses original synthesized computer sounds without a clip network request.
 */
export type ClipCue = 'alien' | 'power-on' | 'power-off';
export const garageAudioClips: Record<ClipCue, string | null> = {
  alien: null,
  'power-on': null,
  'power-off': null,
};
