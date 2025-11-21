export type HashtagKind = "wrapped" | "unwrapped";

export type WrappedHashtag = {
  start: number;
  end: number;
  content: string;
};

export type FirstHashtag =
  | { type: "wrapped"; tag: string }
  | { type: "unwrapped"; tag: string };

function isStrongTerminator(cu: number): boolean {
  return cu <= 0x20 || (cu >= 0x7f && cu <= 0x9f);
}

function isAngleBracket(cu: number): boolean {
  return cu === 0x3c || cu === 0x3e;
}

function isPunctuation(cu: number): boolean {
  return (
    cu === 0x2e || // .
    cu === 0x2c || // ,
    cu === 0x3b || // ;
    cu === 0x3a || // :
    cu === 0x21 || // !
    cu === 0x3f // ?
  );
}

function countPrecedingBackslashes(input: string, pos: number): number {
  let count = 0;
  for (let k = pos - 1; k >= 0 && input.charCodeAt(k) === 0x5c; k--) {
    count++;
  }
  return count;
}

function isSurrogatePair(input: string, pos: number): boolean {
  if (pos + 1 >= input.length) {
    return false;
  }
  const h = input.charCodeAt(pos);
  const l = input.charCodeAt(pos + 1);
  return h >= 0xd800 && h <= 0xdbff && l >= 0xdc00 && l <= 0xdfff;
}

function nextUnescapedHash(input: string, from: number): number {
  let i = input.indexOf("#", from);
  while (i !== -1) {
    let bs = countPrecedingBackslashes(input, i);
    if ((bs & 1) === 0) {
      return i;
    }
    i = input.indexOf("#", i + 1);
  }
  return -1;
}

function parseWrappedAt(
  input: string,
  index: number,
): { end: number; content: string } | null {
  const n = input.length;
  if (index + 1 >= n || input.charCodeAt(index + 1) !== 0x3c) {
    return null;
  }
  const contentStart = index + 2;
  let j = contentStart;
  while (true) {
    j = input.indexOf(">", j);
    if (j === -1) return null;
    let escBs = countPrecedingBackslashes(input, j);
    if ((escBs & 1) === 0) {
      if (j > contentStart) {
        return {
          end: j + 1,
          content: input.slice(contentStart, j),
        };
      }
      return null;
    }
    j = j + 1;
  }
}

function parseUnwrappedFrom(
  input: string,
  start: number,
): { end: number; content: string } | null {
  const n = input.length;
  let j = start;
  while (j < n) {
    const cu = input.charCodeAt(j);
    if (cu === 0x5c) {
      if (j + 1 < n) {
        if (isSurrogatePair(input, j + 1)) {
          j += 3;
          continue;
        }
        j += 2;
        continue;
      } else {
        j += 1;
        break;
      }
    }
    if (isStrongTerminator(cu) || isAngleBracket(cu)) {
      break;
    }
    if (isPunctuation(cu)) {
      if (j + 1 >= n) {
        break;
      }
      const next = input.charCodeAt(j + 1);
      if (next === cu) {
        j += 1;
        break;
      }
      if (
        isStrongTerminator(next) ||
        isPunctuation(next) ||
        isAngleBracket(next)
      ) {
        break;
      }
      j += 1;
      continue;
    }
    if (isSurrogatePair(input, j)) {
      j += 2;
      continue;
    }
    j += 1;
  }
  if (j > start) {
    return {
      end: j,
      content: input.slice(start, j),
    };
  }
  return null;
}

export function findHashtagWrappedTags(
  input: string,
): WrappedHashtag[] {
  const out: WrappedHashtag[] = [];
  const n = input.length;
  let i = 0;
  while (i < n) {
    const next = findNextWrappedFrom(input, i);
    if (!next) break;
    out.push({
      start: next.start,
      end: next.end,
      content: next.content,
    });
    i = next.end;
  }
  return out;
}

function findNextWrappedFrom(
  input: string,
  from: number,
): { start: number; end: number; content: string } | null {
  const n = input.length;
  let i = from;
  while (i < n) {
    const hash = input.indexOf("#<", i);
    if (hash === -1) {
      return null;
    }
    let bs = countPrecedingBackslashes(input, hash);
    if ((bs & 1) !== 0) {
      i = hash + 2;
      continue;
    }
    const parsed = parseWrappedAt(input, hash);
    if (parsed) {
      return {
        start: hash,
        end: parsed.end,
        content: parsed.content,
      };
    }
    i = hash + 2;
  }
  return null;
}

function findFirstWrapped(
  input: string,
): { index: number; content: string } | null {
  const res = findNextWrappedFrom(input, 0);
  if (!res) {
    return null;
  }
  return {
    index: res.start,
    content: res.content,
  };
}

function findFirstUnwrapped(
  input: string,
): { index: number; content: string } | null {
  const n = input.length;
  let pos = 0;
  while (true) {
    const i = nextUnescapedHash(input, pos);
    if (i === -1) {
      return null;
    }
    if (i + 1 < n && input.charCodeAt(i + 1) === 0x3c) {
      pos = i + 2;
      continue;
    }
    const parsed = parseUnwrappedFrom(input, i + 1);
    if (parsed) {
      return {
        index: i,
        content: parsed.content,
      };
    }
    pos = i + 1;
  }
}

export function unescapeHashtagContent(content: string): string {
  let out = "";
  for (let i = 0; i < content.length; ) {
    const ch = content[i];
    if (ch === "\\") {
      if (i + 1 < content.length) {
        out += content[i + 1];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

export function findFirstHashtag(input: string): FirstHashtag | null {
  const n = input.length;
  let pos = 0;
  while (true) {
    const i = nextUnescapedHash(input, pos);
    if (i === -1) {
      return null;
    }
    if (i + 1 < n && input.charCodeAt(i + 1) === 0x3c) {
      const parsed = parseWrappedAt(input, i);
      if (parsed) {
        return {
          type: "wrapped",
          tag: unescapeHashtagContent(parsed.content),
        };
      }
      pos = i + 2;
    } else {
      const parsed = parseUnwrappedFrom(input, i + 1);
      if (parsed) {
        return {
          type: "unwrapped",
          tag: unescapeHashtagContent(parsed.content),
        };
      }
      pos = i + 1;
    }
  }
}

function canBeUnwrapped(content: string): boolean {
  for (let i = 0; i < content.length; ) {
    const cu = content.charCodeAt(i);
    if (isStrongTerminator(cu) || isAngleBracket(cu)) {
      return false;
    }
    if (isSurrogatePair(content, i)) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return true;
}

export function hashtagForContent(content: string): string {
  if (canBeUnwrapped(content)) {
    let safe = "";
    for (let i = 0; i < content.length; ) {
      const ch = content[i];
      if (ch === "\\" || ch === "#") {
        safe += "\\" + ch;
        i += 1;
      } else if (isPunctuation(content.charCodeAt(i))) {
        if (i + 1 < content.length && content[i + 1] === ch) {
          safe += ch + "\\" + ch;
          i += 2;
        } else {
          safe += ch;
          i += 1;
        }
      } else {
        if (isSurrogatePair(content, i)) {
          safe += content.slice(i, i + 2);
          i += 2;
          continue;
        }
        safe += content[i];
        i += 1;
      }
    }
    return "#" + safe;
  } else {
    let esc = "";
    for (let i = 0; i < content.length; ) {
      const ch = content[i];
      if (ch === "\\" || ch === ">") {
        esc += "\\" + ch;
        i += 1;
      } else {
        if (isSurrogatePair(content, i)) {
          esc += content.slice(i, i + 2);
          i += 2;
          continue;
        }
        esc += content[i];
        i += 1;
      }
    }
    return "#<" + esc + ">";
  }
}

type ExecResult = Array<string> & { index?: number };

export const unwrappedTagRegex = {
  exec(input: string): ExecResult | null {
    const m = findFirstUnwrapped(input);
    if (!m) {
      return null;
    }
    const whole = "#" + m.content;
    const arr: ExecResult = [whole, m.content];
    (arr as any).index = m.index;
    return arr;
  },
};
