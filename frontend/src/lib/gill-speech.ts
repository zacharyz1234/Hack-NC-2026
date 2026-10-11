export type SpeechAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};
export type AlignedSpeech = {
  audio_base64: string;
  alignment: SpeechAlignment;
};
export type MouthCue = { start: number; end: number };

// Vowel groups approximate syllable nuclei; their timing comes from the speech
// provider, not word length or volume. Spaces and punctuation never open the mouth.
export function mouthCues(alignment: SpeechAlignment): MouthCue[] {
  const {
    characters,
    character_start_times_seconds: starts,
    character_end_times_seconds: ends,
  } = alignment;
  if (
    !Array.isArray(characters) ||
    !Array.isArray(starts) ||
    !Array.isArray(ends) ||
    characters.length !== starts.length ||
    starts.length !== ends.length
  )
    throw new Error("Gill's speech timing is incomplete.");
  const cues: MouthCue[] = [];
  let vowelGroup = false;
  for (let i = 0; i < characters.length; i++) {
    const start = starts[i]!;
    const end = ends[i]!;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start
    )
      throw new Error("Gill's speech timing is invalid.");
    const vowel = /^[aeiouy]$/i.test(characters[i]!);
    if (vowel) {
      if (vowelGroup && cues.length) cues[cues.length - 1]!.end = end;
      else cues.push({ start, end });
    }
    vowelGroup = vowel;
  }
  // Short minimum openings remain visible; cap at the next syllable's onset.
  return cues.map((cue, i) => ({
    start: cue.start,
    end: Math.min(
      Math.max(cue.end, cue.start + 0.07),
      cues[i + 1]?.start ?? Infinity,
    ),
  }));
}

export function decodeSpeechAudio(base64: string): ArrayBuffer {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}
