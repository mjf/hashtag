export type HashtagType = 'unwrapped' | 'wrapped';

export type HashtagMatch = {
  type: HashtagType;
  start: number;
  end: number;
  raw: string;
  rawText: string;
  text: string;
};

export type HashtagPatternOptions = {
  type?: HashtagType | 'any';
  global?: boolean;
  sticky?: boolean;
  capture?: 'rawText' | 'text';
};

export interface HashtagPattern {
  readonly source: string;
  readonly flags: string;
  lastIndex: number;

  exec(input: string): RegExpExecArray | null;
  test(input: string): boolean;
  reset(): void;

  execMatch(input: string): HashtagMatch | null;
  matchAll(input: string): IterableIterator<RegExpExecArray>;
  matchAllMatches(input: string): IterableIterator<HashtagMatch>;
}

// - 0 = trailing
// - 1 = none
export type PunctuationStrategyCode = 0 | 1;

export type PunctuationStrategyCodeConfig = Record<
  number,
  PunctuationStrategyCode
>;

export const punctuationStrategyCode: PunctuationStrategyCodeConfig =
  Object.create(null);

{
  // Latin / Cyrillic / Greek / Hebrew
  punctuationStrategyCode[0x002e] = 0; // FULL STOP
  punctuationStrategyCode[0x002c] = 0; // COMMA
  punctuationStrategyCode[0x0021] = 0; // EXCLAMATION MARK
  punctuationStrategyCode[0x003f] = 0; // QUESTION MARK
  punctuationStrategyCode[0x003b] = 0; // SEMICOLON
  punctuationStrategyCode[0x003a] = 0; // COLON
  punctuationStrategyCode[0x00b7] = 0; // MIDDLE DOT

  // Devanagari / Bengali / Other Indic Scripts
  punctuationStrategyCode[0x0964] = 0; // DEVANAGARI DANDA
  punctuationStrategyCode[0x0965] = 0; // DEVANAGARI DOUBLE DANDA

  // Arabic / Persian / Urdu (Logical trailing)
  punctuationStrategyCode[0x060c] = 0; // ARABIC COMMA
  punctuationStrategyCode[0x061b] = 0; // ARABIC SEMICOLON
  punctuationStrategyCode[0x061f] = 0; // ARABIC QUESTION MARK
  punctuationStrategyCode[0x06d4] = 0; // ARABIC FULL STOP

  // Armenian
  punctuationStrategyCode[0x0589] = 0; // ARMENIAN FULL STOP
  punctuationStrategyCode[0x055b] = 0; // ARMENIAN MODIFIER LETTER LEFT HALF RING
  punctuationStrategyCode[0x055c] = 0; // ARMENIAN EXCLAMATION MARK
  punctuationStrategyCode[0x055e] = 0; // ARMENIAN QUESTION MARK

  // Ethiopic (Amharic / Tigrinya)
  punctuationStrategyCode[0x1361] = 0; // ETHIOPIC WORDSPACE
  punctuationStrategyCode[0x1362] = 0; // ETHIOPIC FULL STOP
  punctuationStrategyCode[0x1363] = 0; // ETHIOPIC COMMA
  punctuationStrategyCode[0x1364] = 0; // ETHIOPIC SEMICOLON
  punctuationStrategyCode[0x1365] = 0; // ETHIOPIC COLON

  // Tibetan
  punctuationStrategyCode[0x0f0d] = 1; // TIBETAN MARK SHAD
  punctuationStrategyCode[0x0f0e] = 1; // TIBETAN MARK NYIS SHAD

  // Georgian
  punctuationStrategyCode[0x10fb] = 0; // GEORGIAN PARAGRAPH SEPARATOR

  // CJK (Chinese, Japanese, Korean)
  punctuationStrategyCode[0x3002] = 1; // IDEOGRAPHIC FULL STOP
  punctuationStrategyCode[0x3001] = 1; // IDEOGRAPHIC COMMA
  punctuationStrategyCode[0xff0c] = 1; // FULLWIDTH COMMA
  punctuationStrategyCode[0xff1f] = 1; // FULLWIDTH QUESTION MARK
  punctuationStrategyCode[0xff01] = 1; // FULLWIDTH EXCLAMATION MARK
  punctuationStrategyCode[0xff1b] = 1; // FULLWIDTH SEMICOLON
  punctuationStrategyCode[0xff1a] = 1; // FULLWIDTH COLON
  punctuationStrategyCode[0x30fb] = 1; // KATAKANA MIDDLE DOT
  punctuationStrategyCode[0xff0e] = 1; // FULLWIDTH FULL STOP
}

function isStrongTerminator(code: number): boolean {
  // 0x20 SP
  // 0x7f DEL
  // 0x9f APC (C1 end)
  return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
}

function isHighSurrogate(code: number): boolean {
  // High Surrogate Block (0xd800-0xdbff)
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  // Low Surrogate Block (0xdc00-0xdfff)
  return code >= 0xdc00 && code <= 0xdfff;
}

function isSurrogatePair(input: string, pos: number): boolean {
  if (pos + 1 >= input.length) {
    return false;
  }
  const h = input.charCodeAt(pos);
  if (isHighSurrogate(h)) {
    const l = input.charCodeAt(pos + 1);
    return isLowSurrogate(l);
  }
  return false;
}

function hasLoneSurrogate(input: string, pos: number): boolean {
  const code = input.charCodeAt(pos);
  if (isHighSurrogate(code)) {
    return !isSurrogatePair(input, pos);
  }
  if (isLowSurrogate(code)) {
    return true;
  }
  return false;
}

function hasAnyLoneSurrogate(input: string): boolean {
  for (let i = 0; i < input.length; ) {
    if (hasLoneSurrogate(input, i)) {
      return true;
    }
    i += isSurrogatePair(input, i) ? 2 : 1;
  }
  return false;
}

function isLineBreakChar(code: number): boolean {
  // 0x0d CR
  // 0x0a LF
  return code === 0x0a || code === 0x0d;
}

function isHorizontalWhitespace(code: number): boolean {
  // 0x20 SP
  // 0x09 HT
  return code === 0x20 || code === 0x09;
}

function normalizeWrappedText(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x0d) {
      if (i + 1 < text.length && text.charCodeAt(i + 1) === 0x0a) {
        i += 2;
      } else {
        i += 1;
      }
      out.push(' ');
      while (
        i < text.length &&
        isHorizontalWhitespace(text.charCodeAt(i))
      ) {
        i += 1;
      }
      continue;
    }
    if (code === 0x0a) {
      i += 1;
      out.push(' ');
      while (
        i < text.length &&
        isHorizontalWhitespace(text.charCodeAt(i))
      ) {
        i += 1;
      }
      continue;
    }
    out.push(text[i]);
    i += 1;
  }
  return out.join('');
}

function extractWrappedTag(
  input: string,
  hashIndex: number,
): { end: number; rawText: string } | null {
  const n = input.length;
  if (hashIndex + 1 >= n || input.charCodeAt(hashIndex + 1) !== 0x3c) {
    // 0x3c Less-than Sign
    return null;
  }
  const startIndex = hashIndex + 2;
  let pos = startIndex;
  // 0 = even number of backslashes
  // 1 = odd (escaped)
  let slashParity = 0;
  while (pos < n) {
    if (hasLoneSurrogate(input, pos)) {
      return null;
    }
    const code = input.charCodeAt(pos);
    if (code === 0x5c) {
      // 0x5c Backslash
      slashParity ^= 1;
      pos += 1;
      continue;
    }
    if (code === 0x3e) {
      // 0x3e Greater-than Sign
      if (slashParity === 0) {
        if (pos === startIndex) {
          return null;
        }
        return {
          end: pos + 1,
          rawText: input.slice(startIndex, pos),
        };
      }
      slashParity = 0;
      pos += 1;
      continue;
    }
    slashParity = 0;
    pos += isSurrogatePair(input, pos) ? 2 : 1;
  }
  return null;
}

function extractUnwrappedTag(
  input: string,
  start: number,
): { end: number; rawText: string } | null {
  const n = input.length;
  let pos = start;
  while (pos < n) {
    if (hasLoneSurrogate(input, pos)) {
      break;
    }
    const code = input.charCodeAt(pos);
    if (isLineBreakChar(code)) {
      break;
    }
    if (code === 0x5c) {
      // 0x5c Backslash
      if (pos + 1 < n) {
        const next = input.charCodeAt(pos + 1);
        if (isLineBreakChar(next) || hasLoneSurrogate(input, pos + 1)) {
          break;
        }
        pos += isSurrogatePair(input, pos + 1) ? 3 : 2;
        continue;
      }
      pos += 1;
      break;
    }
    if (isStrongTerminator(code) || code === 0x23) {
      // 0x23 Hash
      break;
    }
    const punctCode = punctuationStrategyCode[code];
    if (punctCode !== undefined) {
      if (punctCode === 1) {
        break;
      }
      if (pos + 1 >= n) {
        break;
      }
      if (hasLoneSurrogate(input, pos + 1)) {
        break;
      }
      const next = input.charCodeAt(pos + 1);
      if (
        isStrongTerminator(next) ||
        punctuationStrategyCode[next] !== undefined
      ) {
        break;
      }
      pos += 1;
      continue;
    }
    pos += isSurrogatePair(input, pos) ? 2 : 1;
  }
  return pos > start
    ? { end: pos, rawText: input.slice(start, pos) }
    : null;
}

interface ScanResult {
  type: HashtagType;
  start: number;
  end: number;
  rawText: string;
}

function isUnescapedHash(input: string, hashIndex: number): boolean {
  let slashCount = 0;
  for (let j = hashIndex - 1; j >= 0; j -= 1) {
    if (input.charCodeAt(j) !== 0x5c) {
      // 0x5c Backslash
      break;
    }
    slashCount += 1;
  }
  return (slashCount & 1) === 0;
}

function* scanAllHashtags(
  input: string,
  fromIndex = 0,
): Generator<ScanResult> {
  const n = input.length;
  let i = fromIndex;
  while (i < n) {
    const hashIndex = input.indexOf('#', i);
    if (hashIndex < 0) {
      return;
    }
    if (hasLoneSurrogate(input, hashIndex)) {
      i = hashIndex + 1;
      continue;
    }
    if (!isUnescapedHash(input, hashIndex)) {
      i = hashIndex + 1;
      continue;
    }
    if (hashIndex + 1 < n && input.charCodeAt(hashIndex + 1) === 0x3c) {
      // 0x3c Less-than Sign
      const parsed = extractWrappedTag(input, hashIndex);
      if (parsed) {
        yield {
          type: 'wrapped',
          start: hashIndex,
          end: parsed.end,
          rawText: parsed.rawText,
        };
        i = parsed.end;
        continue;
      }
      i = hashIndex + 2;
      continue;
    }
    const parsed = extractUnwrappedTag(input, hashIndex + 1);
    if (parsed) {
      const unescaped = unescapeHashtagText(parsed.rawText);
      if (unescaped.length > 0 && !hasAnyLoneSurrogate(unescaped)) {
        yield {
          type: 'unwrapped',
          start: hashIndex,
          end: parsed.end,
          rawText: parsed.rawText,
        };
        i = parsed.end;
        continue;
      }
    }
    i = hashIndex + 1;
  }
}

export function unescapeHashtagText(text: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') {
      if (i + 1 < text.length) {
        out.push(text[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
    } else {
      out.push(text[i]);
      i += 1;
    }
  }
  return out.join('');
}

function canBeUnwrapped(text: string): boolean {
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return false;
    }
    const code = text.charCodeAt(i);
    if (isLineBreakChar(code)) {
      return false;
    }
    if (isStrongTerminator(code)) {
      return false;
    }
    i += isSurrogatePair(text, i) ? 2 : 1;
  }
  return true;
}

function escapeAsUnwrapped(text: string): string {
  const out: string[] = [];
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return '';
    }
    const code = text.charCodeAt(i);
    if (isLineBreakChar(code)) {
      return '';
    }
    const ch = text[i];
    if (i === 0 && ch === '<') {
      out.push('\\', ch);
      i += 1;
    } else if (ch === '\\' || ch === '#') {
      out.push('\\', ch);
      i += 1;
    } else if (isSurrogatePair(text, i)) {
      out.push(text.slice(i, i + 2));
      i += 2;
    } else {
      out.push(ch);
      i += 1;
    }
  }
  return out.join('');
}

function escapeAsWrapped(text: string): string {
  const out: string[] = [];
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return '';
    }
    const ch = text[i];
    if (ch === '\\' || ch === '>' || ch === '<') {
      out.push('\\', ch);
      i += 1;
    } else if (isSurrogatePair(text, i)) {
      out.push(text.slice(i, i + 2));
      i += 2;
    } else {
      out.push(ch);
      i += 1;
    }
  }
  return out.join('');
}

export function createHashtag(text: string): string {
  if (text.length === 0) {
    return '';
  }
  if (hasAnyLoneSurrogate(text)) {
    return '';
  }
  if (canBeUnwrapped(text)) {
    const escaped = escapeAsUnwrapped(text);
    return escaped.length > 0 ? '#' + escaped : '';
  }
  const escaped = escapeAsWrapped(text);
  return escaped.length > 0 ? '#<' + escaped + '>' : '';
}

function toMatch(item: ScanResult): HashtagMatch | null {
  const raw =
    item.type === 'wrapped' ? `#<${item.rawText}>` : `#${item.rawText}`;
  const unescaped = unescapeHashtagText(item.rawText);
  if (unescaped.length === 0 || hasAnyLoneSurrogate(unescaped)) {
    return null;
  }
  return {
    type: item.type,
    start: item.start,
    end: item.end,
    raw,
    rawText: item.rawText,
    text:
      item.type === 'wrapped'
        ? normalizeWrappedText(unescaped)
        : unescaped,
  };
}

function toExecArray(
  match: HashtagMatch,
  includeTypeGroup: boolean,
  capture: 'rawText' | 'text',
  input: string,
): RegExpExecArray {
  const payload = capture === 'text' ? match.text : match.rawText;
  const arr: unknown[] = [match.raw, payload];
  if (includeTypeGroup) {
    arr.push(match.type);
  }
  const execArray = arr as RegExpExecArray;
  execArray.index = match.start;
  execArray.input = input;
  return execArray;
}

function flagsFromOptions(global: boolean, sticky: boolean): string {
  return `${global ? 'g' : ''}${sticky ? 'y' : ''}`;
}

export function hashtagPattern(
  options: HashtagPatternOptions = {},
): HashtagPattern {
  const type = options.type ?? 'any';
  const global = options.global ?? false;
  const sticky = options.sticky ?? false;
  const capture = options.capture ?? 'rawText';
  const includeTypeGroup = type === 'any';
  const state = {
    lastIndex: 0,
  };
  function execInternal(input: string): HashtagMatch | null {
    let startIndex = 0;
    if (global || sticky) {
      // coerce lastIndex to a non-negative integer
      const n = state.lastIndex;
      const i = n > 0 ? n - (n % 1) : 0;
      startIndex = i <= input.length ? i : input.length + 1;
      state.lastIndex = startIndex > input.length ? 0 : i;
      if (startIndex > input.length) {
        return null;
      }
    }
    if (sticky) {
      for (const item of scanAllHashtags(input, startIndex)) {
        if (item.start !== startIndex) {
          break;
        }
        if (type !== 'any' && item.type !== type) {
          break;
        }
        return toMatch(item);
      }
      if (global || sticky) {
        state.lastIndex = 0;
      }
      return null;
    }
    for (const item of scanAllHashtags(input, startIndex)) {
      if (type !== 'any' && item.type !== type) {
        continue;
      }
      const m = toMatch(item);
      if (m) return m;
    }
    if (global || sticky) {
      state.lastIndex = 0;
    }
    return null;
  }

  function exec(input: string): RegExpExecArray | null {
    const m = execInternal(input);
    if (!m) {
      return null;
    }
    if (global || sticky) {
      state.lastIndex = m.end;
    }
    return toExecArray(m, includeTypeGroup, capture, input);
  }

  function execMatch(input: string): HashtagMatch | null {
    const m = execInternal(input);
    if (!m) {
      return null;
    }
    if (global || sticky) {
      state.lastIndex = m.end;
    }
    return m;
  }

  function* matchAll(input: string): IterableIterator<RegExpExecArray> {
    const p = hashtagPattern({ type, global: true, sticky, capture });
    p.lastIndex = 0;
    while (true) {
      const m = p.exec(input);
      if (!m) return;
      yield m;
    }
  }

  function* matchAllMatches(
    input: string,
  ): IterableIterator<HashtagMatch> {
    const p = hashtagPattern({ type, global: true, sticky, capture });
    p.lastIndex = 0;
    while (true) {
      const m = p.execMatch(input);
      if (!m) return;
      yield m;
    }
  }

  return {
    source: 'hashtag',
    flags: flagsFromOptions(global, sticky),
    get lastIndex(): number {
      return state.lastIndex;
    },
    set lastIndex(v: number) {
      // Clamp/coerce lastIndex to a non-negative integer (no Math.*).
      const n = v;
      state.lastIndex = n > 0 ? n - (n % 1) : 0;
    },
    exec,
    execMatch,
    test(input: string): boolean {
      const saved = state.lastIndex;
      const m = exec(input);
      const ok = m !== null;
      state.lastIndex = saved;
      return ok;
    },
    reset(): void {
      state.lastIndex = 0;
    },
    matchAll,
    matchAllMatches,
  };
}

export const hashtag = hashtagPattern({ type: 'any' });
export const wrappedHashtag = hashtagPattern({ type: 'wrapped' });
export const unwrappedHashtag = hashtagPattern({ type: 'unwrapped' });

export type FindOptions = {
  type?: HashtagType | 'any';
  fromIndex?: number;
};

export function findFirstHashtag(
  input: string,
  options: FindOptions = {},
): HashtagMatch | null {
  const p = hashtagPattern({
    type: options.type ?? 'any',
    global: true,
  });
  if (options.fromIndex !== undefined) {
    const n = options.fromIndex;
    p.lastIndex = n > 0 ? n - (n % 1) : 0;
  }
  return p.execMatch(input);
}

export function findAllHashtags(
  input: string,
  options: FindOptions = {},
): HashtagMatch[] {
  const p = hashtagPattern({
    type: options.type ?? 'any',
    global: true,
  });
  if (options.fromIndex !== undefined) {
    const n = options.fromIndex;
    p.lastIndex = n > 0 ? n - (n % 1) : 0;
  }
  const out: HashtagMatch[] = [];
  while (true) {
    const m = p.execMatch(input);
    if (!m) break;
    out.push(m);
  }
  return out;
}

export function* iterateHashtags(
  input: string,
  options: FindOptions = {},
): IterableIterator<HashtagMatch> {
  const p = hashtagPattern({
    type: options.type ?? 'any',
    global: true,
  });
  if (options.fromIndex !== undefined) {
    const n = options.fromIndex;
    p.lastIndex = n > 0 ? n - (n % 1) : 0;
  }
  while (true) {
    const m = p.execMatch(input);
    if (!m) return;
    yield m;
  }
}
