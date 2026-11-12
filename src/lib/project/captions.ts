import type { CaptionWord } from "./schema";

/** Pengolahan caption (murni): dari baris subtitle atau token Whisper menjadi kata bertanda waktu. */

type Timed = { text: string; startMs: number; endMs: number };

/**
 * Subtitle (.srt/.vtt) hanya punya waktu per baris. Supaya bisa disorot per kata,
 * waktu tiap baris dibagi ke kata-katanya sebanding dengan panjang kata.
 */
export function wordsFromPhrases(phrases: Timed[]): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const phrase of phrases) {
    const parts = phrase.text.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const span = Math.max(0, phrase.endMs - phrase.startMs);
    let cursor = phrase.startMs;
    parts.forEach((part, index) => {
      const end = index === parts.length - 1 ? phrase.endMs : Math.round(cursor + (span * part.length) / total);
      words.push({ text: part, startMs: Math.round(cursor), endMs: Math.max(Math.round(cursor) + 1, end) });
      cursor = end;
    });
  }
  return words;
}

/**
 * Whisper memecah teks menjadi potongan kata; potongan yang diawali spasi memulai
 * kata baru. Potongan digabung jadi kata utuh, dan penanda seperti [BLANK_AUDIO] dibuang.
 */
export function wordsFromTokens(tokens: Timed[]): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const token of tokens) {
    const raw = token.text;
    if (/^\s*[\[(].*[\])]\s*$/.test(raw) || raw.trim() === "") continue;
    const startsWord = /^\s/.test(raw) || words.length === 0;
    const text = raw.trim();
    const last = words[words.length - 1];
    if (!startsWord && last) {
      last.text += text;
      last.endMs = Math.max(last.endMs, Math.round(token.endMs));
    } else {
      words.push({
        text,
        startMs: Math.round(token.startMs),
        endMs: Math.max(Math.round(token.startMs) + 1, Math.round(token.endMs)),
      });
    }
  }
  return words;
}

/**
 * Memetakan kata dari waktu sumber (file media) ke waktu klip di timeline:
 * hanya kata di dalam bagian sumber yang dipakai klip, digeser dan diskalakan oleh kecepatan.
 */
export function wordsForClip(words: CaptionWord[], clip: { inMs: number; durationMs: number; speed: number }): CaptionWord[] {
  const result: CaptionWord[] = [];
  for (const word of words) {
    const startMs = Math.round((word.startMs - clip.inMs) / clip.speed);
    const endMs = Math.round((word.endMs - clip.inMs) / clip.speed);
    if (endMs <= 0 || startMs >= clip.durationMs) continue;
    result.push({ text: word.text, startMs: Math.max(0, startMs), endMs: Math.min(clip.durationMs, Math.max(startMs + 1, endMs)) });
  }
  return result;
}
