export type WrappedHashtag = {
  start: number;
  end: number;
  text: string;
};

export enum HashtagType {
  Unwrapped = 'unwrapped',
  Wrapped = 'wrapped',
}

export type Hashtag =
  | { type: HashtagType.Wrapped; text: string }
  | { type: HashtagType.Unwrapped; text: string };

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

function isSurrogatePair(input: string, pos: number): boolean {
  if (pos + 1 >= input.length) {
    return false;
  }
  const h = input.charCodeAt(pos);
  // High Surrogate Block (0xd800-0xdbff)
  if (h >= 0xd800 && h <= 0xdbff) {
    const l = input.charCodeAt(pos + 1);
    // Low Surrogate Block (0xdc00-0xdfff)
    return l >= 0xdc00 && l <= 0xdfff;
  }
  return false;
}

function isCharEscaped(input: string, pos: number): boolean {
  let count = 0;
  for (let k = pos - 1; k >= 0 && input[k] === '\\'; k--) {
    count++;
  }
  return (count & 1) === 1;
}

function extractWrappedTag(
  input: string,
  hashIndex: number,
): { end: number; text: string } | null {
  const n = input.length;
  if (hashIndex + 1 >= n || input.charCodeAt(hashIndex + 1) !== 0x3c) {
    // 0x3c Less-than Sign
    return null;
  }
  const startIndex = hashIndex + 2;
  let pos = startIndex;
  while (pos < n) {
    const closeBracketIndex = input.indexOf('>', pos);
    if (closeBracketIndex === -1) {
      return null;
    }
    if (!isCharEscaped(input, closeBracketIndex)) {
      if (closeBracketIndex === startIndex) {
        return null;
      }
      return {
        end: closeBracketIndex + 1,
        text: input.slice(startIndex, closeBracketIndex),
      };
    }
    pos = closeBracketIndex + 1;
  }
  return null;
}

function extractUnwrappedTag(
  input: string,
  start: number,
): { end: number; text: string } | null {
  const n = input.length;
  let pos = start;
  while (pos < n) {
    const code = input.charCodeAt(pos);
    if (code === 0x5c) {
      // 0x5c Backslash
      if (pos + 1 < n) {
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
    ? { end: pos, text: input.slice(start, pos) }
    : null;
}

interface ScanResult {
  type: HashtagType;
  start: number;
  end: number;
  rawText: string;
}

function* scanAllHashtags(input: string): Generator<ScanResult> {
  const n = input.length;
  let i = 0;
  // 0 = even number of backslashes
  // 1 = odd (escaped)
  let slashParity = 0;
  while (i < n) {
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
        if (
          i + 1 < n &&
          input.charCodeAt(i + 1) === 0x3c &&
          // 0x3c Less-than Sign
          !isCharEscaped(input, i + 1)
        ) {
          const parsed = extractWrappedTag(input, hashIndex);
          if (parsed) {
            yield {
              type: HashtagType.Wrapped,
              start: hashIndex,
              end: parsed.end,
              rawText: parsed.text,
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
          const unescaped = unescapeHashtagText(parsed.text);
          if (unescaped.length > 0) {
            yield {
              type: HashtagType.Unwrapped,
              start: hashIndex,
              end: parsed.end,
              rawText: parsed.text,
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

export function findWrappedHashtags(input: string): WrappedHashtag[] {
  const result: WrappedHashtag[] = [];
  for (const item of scanAllHashtags(input)) {
    if (item.type === HashtagType.Wrapped) {
      result.push({
        start: item.start,
        end: item.end,
        text: item.rawText,
      });
    }
  }
  return result;
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

export function findHashtag(input: string): Hashtag | null {
  for (const item of scanAllHashtags(input)) {
    return {
      type: item.type,
      text: unescapeHashtagText(item.rawText),
    };
  }
  return null;
}

function canBeUnwrapped(text: string): boolean {
  for (
    let i = 0;
    i < text.length;
    i += isSurrogatePair(text, i) ? 2 : 1
  ) {
    const code = text.charCodeAt(i);
    if (isStrongTerminator(code)) {
      return false;
    }
  }
  return true;
}

function escapeAsUnwrapped(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; ) {
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
  } else {
    return '#<' + escapeAsWrapped(text) + '>';
  }
}

type ExecResult = Array<string> & { index?: number };

function createHashtagRegExp(filterType?: HashtagType): {
  lastIndex: number;
  exec: (input: string) => ExecResult | null;
  reset: () => void;
} {
  const state = {
    lastIndex: 0,
    _iterator: null as Iterator<ScanResult> | null,
    _currentInput: null as string | null,
  };
  return {
    get lastIndex(): number {
      return state.lastIndex;
    },
    set lastIndex(value: number) {
      state.lastIndex = value;
    },
    exec(input: string): ExecResult | null {
      if (input !== state._currentInput) {
        state._currentInput = input;
        state.lastIndex = 0;
        state._iterator = null;
      }
      if (!state._iterator) {
        state._iterator = scanAllHashtags(input);
      }
      while (true) {
        const result = state._iterator!.next();
        if (result.done) {
          state._iterator = null;
          state._currentInput = null;
          state.lastIndex = 0;
          return null;
        }
        const item = result.value;
        state.lastIndex = item.end;
        if (filterType && item.type !== filterType) {
          continue;
        }
        const fullMatch =
          item.type === HashtagType.Wrapped
            ? `#<${item.rawText}>`
            : `#${item.rawText}`;
        const execResult: ExecResult = [fullMatch, item.rawText];
        if (!filterType) {
          execResult.push(item.type);
        }
        execResult.index = item.start;
        return execResult;
      }
    },
    reset(): void {
      state.lastIndex = 0;
      state._iterator = null;
      state._currentInput = null;
    },
  };
}

export const unwrappedHashtagRegExp = createHashtagRegExp(
  HashtagType.Unwrapped,
);
export const wrappedHashtagRegExp = createHashtagRegExp(
  HashtagType.Wrapped,
);
export const hashtagRegExp = createHashtagRegExp();
