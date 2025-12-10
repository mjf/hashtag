export type HashtagKind = 'wrapped' | 'unwrapped';

export type WrappedHashtag = {
  start: number;
  end: number;
  content: string;
};

export type FirstHashtag =
  | { type: 'wrapped'; tag: string }
  | { type: 'unwrapped'; tag: string };

const BACKSLASH = 0x5c;
const HASH = 0x23;
const LT = 0x3c;
const GT = 0x3e;
const SPACE = 0x20;
const DEL = 0x7f;
const C1_END = 0x9f;

const PERIOD = 0x2e;
const COMMA = 0x2c;
const SEMICOLON = 0x3b;
const COLON = 0x3a;
const EXCLAMATION = 0x21;
const QUESTION = 0x3f;

function isStrongTerminator(cu: number): boolean {
  return cu <= SPACE || (cu >= DEL && cu <= C1_END);
}

function isAngleBracket(cu: number): boolean {
  return cu === LT || cu === GT;
}

function isPunctuation(cu: number): boolean {
  return (
    cu === PERIOD ||
    cu === COMMA ||
    cu === SEMICOLON ||
    cu === COLON ||
    cu === EXCLAMATION ||
    cu === QUESTION
  );
}

function isSurrogatePair(input: string, pos: number): boolean {
  if (pos + 1 >= input.length) return false;
  const h = input.charCodeAt(pos);
  const l = input.charCodeAt(pos + 1);
  return h >= 0xd800 && h <= 0xdbff && l >= 0xdc00 && l <= 0xdfff;
}

function countPrecedingBackslashes(input: string, pos: number): number {
  let count = 0;
  for (
    let k = pos - 1;
    k >= 0 && input.charCodeAt(k) === BACKSLASH;
    k--
  ) {
    count++;
  }
  return count;
}

function isEscaped(input: string, pos: number): boolean {
  return (countPrecedingBackslashes(input, pos) & 1) === 1;
}

function nextUnescapedHash(input: string, from: number): number {
  let pos = from;
  while (true) {
    const i = input.indexOf('#', pos);
    if (i === -1) return -1;
    if (!isEscaped(input, i)) return i;
    pos = i + 1;
  }
}

function parseWrappedAt(
  input: string,
  hashIndex: number,
): { end: number; content: string } | null {
  const n = input.length;
  if (hashIndex + 1 >= n || input.charCodeAt(hashIndex + 1) !== LT) {
    return null;
  }

  const contentStart = hashIndex + 2;
  let pos = contentStart;

  while (pos < n) {
    const gtIndex = input.indexOf('>', pos);
    if (gtIndex === -1) return null;

    if (!isEscaped(input, gtIndex)) {
      if (gtIndex === contentStart) return null;
      return {
        end: gtIndex + 1,
        content: input.slice(contentStart, gtIndex),
      };
    }
    pos = gtIndex + 1;
  }

  return null;
}

function parseUnwrappedFrom(
  input: string,
  start: number,
): { end: number; content: string } | null {
  const n = input.length;
  let pos = start;

  while (pos < n) {
    const cu = input.charCodeAt(pos);

    if (cu === BACKSLASH) {
      if (pos + 1 < n) {
        pos += isSurrogatePair(input, pos + 1) ? 3 : 2;
        continue;
      }
      pos += 1;
      break;
    }

    if (isStrongTerminator(cu) || isAngleBracket(cu) || cu === HASH) {
      break;
    }

    if (isPunctuation(cu)) {
      if (pos + 1 >= n) break;
      const next = input.charCodeAt(pos + 1);
      if (
        isStrongTerminator(next) ||
        isPunctuation(next) ||
        isAngleBracket(next)
      ) {
        break;
      }
      pos += 1;
      continue;
    }

    pos += isSurrogatePair(input, pos) ? 2 : 1;
  }

  return pos > start
    ? { end: pos, content: input.slice(start, pos) }
    : null;
}

export function findHashtagWrappedTags(
  input: string,
): WrappedHashtag[] {
  const result: WrappedHashtag[] = [];
  let pos = 0;

  while (pos < input.length) {
    const hashIndex = nextUnescapedHash(input, pos);
    if (hashIndex === -1) break;

    const parsed = parseWrappedAt(input, hashIndex);
    if (parsed) {
      result.push({
        start: hashIndex,
        end: parsed.end,
        content: parsed.content,
      });
      pos = parsed.end;
    } else {
      pos = hashIndex + 1;
    }
  }

  return result;
}

function findFirstUnwrapped(
  input: string,
): { index: number; content: string } | null {
  let pos = 0;

  while (pos < input.length) {
    const hashIndex = nextUnescapedHash(input, pos);
    if (hashIndex === -1) return null;

    if (
      hashIndex + 1 < input.length &&
      input.charCodeAt(hashIndex + 1) === LT
    ) {
      pos = hashIndex + 2;
      continue;
    }

    const parsed = parseUnwrappedFrom(input, hashIndex + 1);
    if (parsed) {
      return { index: hashIndex, content: parsed.content };
    }
    pos = hashIndex + 1;
  }

  return null;
}

export function unescapeHashtagContent(content: string): string {
  let result = '';
  let i = 0;

  while (i < content.length) {
    if (content[i] === '\\') {
      if (i + 1 < content.length) {
        result += content[i + 1];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      result += content[i];
      i += 1;
    }
  }

  return result;
}

export function findFirstHashtag(input: string): FirstHashtag | null {
  let pos = 0;

  while (pos < input.length) {
    const hashIndex = nextUnescapedHash(input, pos);
    if (hashIndex === -1) return null;

    if (
      hashIndex + 1 < input.length &&
      input.charCodeAt(hashIndex + 1) === LT
    ) {
      const parsed = parseWrappedAt(input, hashIndex);
      if (parsed) {
        return {
          type: 'wrapped',
          tag: unescapeHashtagContent(parsed.content),
        };
      }
      pos = hashIndex + 2;
    } else {
      const parsed = parseUnwrappedFrom(input, hashIndex + 1);
      if (parsed) {
        return {
          type: 'unwrapped',
          tag: unescapeHashtagContent(parsed.content),
        };
      }
      pos = hashIndex + 1;
    }
  }

  return null;
}

function canBeUnwrapped(content: string): boolean {
  for (
    let i = 0;
    i < content.length;
    i += isSurrogatePair(content, i) ? 2 : 1
  ) {
    const cu = content.charCodeAt(i);
    if (isStrongTerminator(cu) || isAngleBracket(cu)) {
      return false;
    }
  }
  return true;
}

function escapeForUnwrapped(content: string): string {
  let result = '';

  for (let i = 0; i < content.length; ) {
    const ch = content[i];
    if (ch === '\\' || ch === '#') {
      result += '\\' + ch;
      i += 1;
    } else if (isSurrogatePair(content, i)) {
      result += content.slice(i, i + 2);
      i += 2;
    } else {
      result += ch;
      i += 1;
    }
  }

  return result;
}

function escapeForWrapped(content: string): string {
  let result = '';

  for (let i = 0; i < content.length; ) {
    const ch = content[i];
    if (ch === '\\' || ch === '>' || ch === '<') {
      result += '\\' + ch;
      i += 1;
    } else if (isSurrogatePair(content, i)) {
      result += content.slice(i, i + 2);
      i += 2;
    } else {
      result += ch;
      i += 1;
    }
  }

  return result;
}

export function hashtagForContent(content: string): string {
  if (canBeUnwrapped(content)) {
    return '#' + escapeForUnwrapped(content);
  } else {
    return '#<' + escapeForWrapped(content) + '>';
  }
}

type ExecResult = Array<string> & { index?: number };

export const unwrappedTagRegex = {
  exec(input: string): ExecResult | null {
    const match = findFirstUnwrapped(input);
    if (!match) return null;

    const result: ExecResult = ['#' + match.content, match.content];
    result.index = match.index;
    return result;
  },
};
