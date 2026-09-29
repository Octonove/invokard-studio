import type { Caption, CaptionStyle, CaptionWord, Project } from './types.js';

export interface CaptionEvent {
  start: number;
  end: number;
  lines: string[][];
  /** Index in this event's flattened lines; null during an actual pause. */
  activeWord: number | null;
  fontSize: number;
}
export interface CaptionTrack {
  ass: string;
  events: CaptionEvent[];
  captionTiming: { wordTimedCaptions: number; totalCaptions: number; warnings: string[] };
}

function bounded(value: number | undefined, fallback: number, min: number, max: number, name: string, integer = false) {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) throw new Error(`Invalid caption style ${name}`);
  return result;
}
function assColor(value: string) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Caption colors must use #RRGGBB');
  return value.slice(5, 7).toUpperCase() + value.slice(3, 5).toUpperCase() + value.slice(1, 3).toUpperCase();
}
function styleFor(project: Project) {
  const style: CaptionStyle = project.captionStyle ?? {}, scale = project.format.width / 1080;
  if (style.mode && !['auto', 'word', 'plain'].includes(style.mode)) throw new Error('Invalid caption mode');
  if (style.bold !== undefined && typeof style.bold !== 'boolean') throw new Error('Invalid caption bold style');
  return {
    mode: style.mode ?? 'auto',
    size: Math.max(1, Math.round(bounded(style.fontSize, 92, 16, 240, 'fontSize') * scale)),
    outline: Number((bounded(style.outlineWidth, 5, 0, 12, 'outlineWidth') * scale).toFixed(2)),
    wordsPerLine: bounded(style.maxWordsPerLine, 3, 1, 8, 'maxWordsPerLine', true),
    lines: bounded(style.maxLines, 2, 1, 3, 'maxLines', true),
    marginBottom: Math.round(project.format.height * bounded(style.marginBottom, .22, .08, .45, 'marginBottom')),
    marginSide: Math.round(project.format.width * .08),
    bold: style.bold === false ? 0 : -1,
    color: assColor(style.color ?? '#FFFFFF'), active: assColor(style.activeColor ?? project.brand.accent), outlineColor: assColor(style.outlineColor ?? '#000000'),
    // ASS style fields cannot contain commas; names also must never add tags or records.
    font: /^[\p{L}\p{N} ._-]{1,80}$/u.test(project.brand.fontFamily) ? project.brand.fontFamily : 'Arial'
  };
}

/** Escape for libass, not shell/filter syntax. Literal backslashes are separated from
 * special N/n/h/braces by an invisible word joiner. Braces use libass's documented
 * literal-bracket escapes: github.com/libass/libass/wiki/Libass'-ASS-Extensions. */
export function escapeAssText(text: string) {
  return text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\\/g, '\\\u2060').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}
function timestamp(seconds: number) {
  const cs = Math.round(seconds * 100);
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}
function normalized(text: string) { return text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); }
function validateCaption(caption: Caption, previousEnd: number) {
  if (!Number.isFinite(caption.start) || !Number.isFinite(caption.end) || caption.start < 0 || caption.start < previousEnd || caption.end <= caption.start) throw new Error('Caption timing must be ordered and non-overlapping');
  if (typeof caption.text !== 'string' || !caption.text.trim() || caption.text.length > 4000) throw new Error('Invalid caption text');
  if (caption.words !== undefined) {
    if (!Array.isArray(caption.words) || !caption.words.length || caption.words.length > 500) throw new Error('Caption words require timed words');
    let end = caption.start;
    for (const word of caption.words) {
      if (!Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < end - .001 || word.start < caption.start - .001 || word.end > caption.end + .001 || word.end <= word.start || typeof word.text !== 'string' || !word.text || /\s/u.test(word.text) || word.text.length > 160) throw new Error('Caption word timings must be ordered, non-overlapping and inside the caption');
      end = word.end;
    }
    if (normalized(caption.words.map(word => word.text).join(' ')) !== normalized(caption.text)) throw new Error('Caption word text must match its phrase');
  }
}

// Conservative advance estimates avoid a platform-specific font measurement dependency.
// Long words reduce the whole block size; they are never cropped or split mid-word.
function units(text: string) {
  return [...text].reduce((sum, char) => sum + (/\p{M}/u.test(char) ? 0 : /[ilI.,'!|:;]/.test(char) ? .32 : /[MW@%]/.test(char) ? 1 : /\s/u.test(char) ? .34 : /[\p{Lu}\p{N}]/u.test(char) ? .76 : /[\u0000-\u024f]/.test(char) ? .63 : 1.05), 0);
}
function fitSize(lines: string[][], size: number, safeWidth: number) {
  const widest = Math.max(1, ...lines.map(line => units(line.join(' '))));
  return Math.max(1, Math.min(size, Math.floor(safeWidth / widest)));
}
function phraseLines(text: string, maxLines: number, wordsPerLine: number) {
  const words = text.trim().split(/\s+/u), lines: string[][] = [];
  const count = Math.min(maxLines, Math.ceil(words.length / wordsPerLine));
  let offset = 0;
  for (let i = 0; i < count; i++) {
    const take = Math.ceil((words.length - offset) / (count - i));
    lines.push(words.slice(offset, offset + take)); offset += take;
  }
  return lines;
}
interface WordBlock { words: CaptionWord[]; lines: string[][]; }
function wordBlocks(words: CaptionWord[], style: ReturnType<typeof styleFor>, safeWidth: number): WordBlock[] {
  const blocks: WordBlock[] = []; let block: WordBlock = { words: [], lines: [[]] };
  const flush = () => { if (block.words.length) blocks.push(block); block = { words: [], lines: [[]] }; };
  for (const word of words) {
    const previous = block.words.at(-1);
    if (previous && word.start - previous.end >= .45) flush();
    let line = block.lines.at(-1)!;
    if (line.length && (line.length >= style.wordsPerLine || units([...line, word.text].join(' ')) * style.size > safeWidth)) {
      if (block.lines.length >= style.lines) flush();
      else block.lines.push([]);
      line = block.lines.at(-1)!;
    }
    line.push(word.text); block.words.push(word);
  }
  flush(); return blocks;
}

export function buildCaptionTrack(project: Project): CaptionTrack {
  const style = styleFor(project), events: CaptionEvent[] = [], warnings: string[] = [];
  const safeWidth = project.format.width - 2 * (style.marginSide + style.outline);
  let previousEnd = 0, wordTimedCaptions = 0, fallbackCount = 0, longPlain = 0;
  for (const caption of project.captions) {
    validateCaption(caption, previousEnd); previousEnd = caption.end;
    if (style.mode === 'word' && !caption.words?.length) throw new Error('Word caption mode requires real word timings for every caption. Transcribe with word timing or use auto/plain.');
    if (style.mode === 'plain' || !caption.words?.length) {
      const lines = phraseLines(caption.text, style.lines, style.wordsPerLine);
      if (!caption.words?.length && style.mode === 'auto') fallbackCount++;
      if (lines.some(line => line.length > style.wordsPerLine)) longPlain++;
      events.push({ start: caption.start, end: caption.end, lines, activeWord: null, fontSize: fitSize(lines, style.size, safeWidth) });
      continue;
    }
    wordTimedCaptions++;
    const blocks = wordBlocks(caption.words, style, safeWidth);
    blocks.forEach((block, index) => {
      const first = block.words[0], last = block.words.at(-1)!;
      const start = index === 0 ? caption.start : first.start;
      const next = blocks[index + 1];
      // Keep the old block neutral until the next actual word starts. Never guess a split time.
      const end = next ? next.words[0].start : caption.end;
      const fontSize = fitSize(block.lines, style.size, safeWidth);
      const add = (from: number, to: number, activeWord: number | null) => { if (to > from) events.push({ start: from, end: to, lines: block.lines, activeWord, fontSize }); };
      let cursor = start;
      block.words.forEach((word, activeWord) => { add(cursor, word.start, null); add(word.start, word.end, activeWord); cursor = word.end; });
      add(last.end, end, null);
    });
  }
  if (fallbackCount) warnings.push(`${fallbackCount} caption(s) have no word timings: rendered whole phrases without estimated word highlights.`);
  if (longPlain) warnings.push(`${longPlain} plain caption(s) exceed the word limit: kept the complete phrase at its supplied times, reduced font size and used at most ${style.lines} lines.`);
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${project.format.width}\nPlayResY: ${project.format.height}\nScaledBorderAndShadow: yes\nWrapStyle: 2\nYCbCr Matrix: TV.709\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Reels,${style.font},${style.size},&H00${style.color},&H00${style.active},&H00${style.outlineColor},&H00000000,${style.bold},0,0,0,100,100,0,0,1,${style.outline},0,2,${style.marginSide},${style.marginSide},${style.marginBottom},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const dialogue = events.filter(event => Math.round(event.end * 100) > Math.round(event.start * 100)).map(event => {
    let wordIndex = 0;
    const text = event.lines.map(line => line.map(word => {
      const current = wordIndex++, escaped = escapeAssText(word);
      return current === event.activeWord ? `{\\1c&H${style.active}&}${escaped}{\\1c&H${style.color}&}` : escaped;
    }).join(' ')).join('\\N');
    return `Dialogue: 0,${timestamp(event.start)},${timestamp(event.end)},Reels,,0,0,0,,{\\q2\\fs${event.fontSize}}${text}`;
  }).join('\n');
  return { ass: header + dialogue + '\n', events, captionTiming: { wordTimedCaptions, totalCaptions: project.captions.length, warnings } };
}
