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

function isStrongTerminator(code: number): boolean {
  // 0x20 SP
  // 0x7f DEL
  // 0x9f APC (C1 end)
  return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
}

function isPunctuation(code: number): boolean {
  // 0x2e Full Stop
  // 0x2c Period
  // 0x3b Semicolon
  // 0x3a Colon
  // 0x21 Exclamation Mark
  // 0x3f Question Mark
  return (
    code === 0x2e ||
    code === 0x2c ||
    code === 0x3b ||
    code === 0x3a ||
    code === 0x21 ||
    code === 0x3f
  );
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
    if (code === 0x5c) {
      // 0x5c Backslash
      if (pos + 1 < n) {
        if (hasLoneSurrogate(input, pos + 1)) {
          pos += 1;
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
    if (isPunctuation(code)) {
      if (pos + 1 >= n) {
        break;
      }
      if (hasLoneSurrogate(input, pos + 1)) {
        break;
      }
      const next = input.charCodeAt(pos + 1);
      if (isStrongTerminator(next) || isPunctuation(next)) {
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

function* scanAllHashtags(
  input: string,
  fromIndex = 0,
): Generator<ScanResult> {
  const n = input.length;
  let i = fromIndex;
  // 0 = even number of backslashes
  // 1 = odd (escaped)
  let slashParity = 0;
  while (i < n) {
    if (hasLoneSurrogate(input, i)) {
      slashParity = 0;
      i += 1;
      continue;
    }
    const code = input.charCodeAt(i);
    if (code === 0x5c) {
      // 0x5c Backslash
      slashParity ^= 1;
      i += 1;
      continue;
    }
    if (code === 0x23) {
      // 0x23 Hash
      if (slashParity === 0) {
        const hashIndex = i;
        if (i + 1 < n && input.charCodeAt(i + 1) === 0x3c) {
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
            slashParity = 0;
            continue;
          }
          i = hashIndex + 2;
          slashParity = 0;
          continue;
        }
        const parsed = extractUnwrappedTag(input, hashIndex + 1);
        if (parsed) {
          const unescaped = unescapeHashtagText(parsed.rawText);
          if (unescaped.length > 0 && !hasLoneSurrogate(unescaped, 0)) {
            yield {
              type: 'unwrapped',
              start: hashIndex,
              end: parsed.end,
              rawText: parsed.rawText,
            };
            i = parsed.end;
            slashParity = 0;
            continue;
          }
        }
      }
      i += 1;
      slashParity = 0;
      continue;
    }
    slashParity = 0;
    i += isSurrogatePair(input, i) ? 2 : 1;
  }
}

export function unescapeHashtagText(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\') {
      if (i + 1 < text.length) {
        result += text[i + 1];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      result += text[i];
      i += 1;
    }
  }
  return result;
}

function canBeUnwrapped(text: string): boolean {
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return false;
    }
    const code = text.charCodeAt(i);
    if (isStrongTerminator(code)) {
      return false;
    }
    i += isSurrogatePair(text, i) ? 2 : 1;
  }
  return true;
}

function escapeAsUnwrapped(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return '';
    }
    const ch = text[i];
    if (i === 0 && ch === '<') {
      result += '\\' + ch;
      i += 1;
    } else if (ch === '\\' || ch === '#') {
      result += '\\' + ch;
      i += 1;
    } else if (isSurrogatePair(text, i)) {
      result += text.slice(i, i + 2);
      i += 2;
    } else {
      result += ch;
      i += 1;
    }
  }
  return result;
}

function escapeAsWrapped(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; ) {
    if (hasLoneSurrogate(text, i)) {
      return '';
    }
    const ch = text[i];
    if (ch === '\\' || ch === '>' || ch === '<') {
      result += '\\' + ch;
      i += 1;
    } else if (isSurrogatePair(text, i)) {
      result += text.slice(i, i + 2);
      i += 2;
    } else {
      result += ch;
      i += 1;
    }
  }
  return result;
}

export function createHashtag(text: string): string {
  if (canBeUnwrapped(text)) {
    return '#' + escapeAsUnwrapped(text);
  } else if (!hasLoneSurrogate(text, 0)) {
    return '#<' + escapeAsWrapped(text) + '>';
  } else {
    return '';
  }
}

function toMatch(item: ScanResult): HashtagMatch {
  const raw =
    item.type === 'wrapped' ? `#<${item.rawText}>` : `#${item.rawText}`;
  return {
    type: item.type,
    start: item.start,
    end: item.end,
    raw,
    rawText: item.rawText,
    text: unescapeHashtagText(item.rawText),
  };
}

function toExecArray(
  match: HashtagMatch,
  includeTypeGroup: boolean,
  capture: 'rawText' | 'text',
): RegExpExecArray {
  const payload = capture === 'text' ? match.text : match.rawText;
  const arr: unknown[] = [match.raw, payload];
  if (includeTypeGroup) {
    arr.push(match.type);
  }
  const execArray = arr as RegExpExecArray;
  execArray.index = match.start;
  execArray.input = '';
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
    const startIndex = global || sticky ? state.lastIndex : 0;
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
      return toMatch(item);
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
    return toExecArray(m, includeTypeGroup, capture);
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
      state.lastIndex = v;
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
    p.lastIndex = options.fromIndex;
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
    p.lastIndex = options.fromIndex;
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
    p.lastIndex = options.fromIndex;
  }
  while (true) {
    const m = p.execMatch(input);
    if (!m) return;
    yield m;
  }
}
