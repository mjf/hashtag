import {
  createHashtag,
  findFirstHashtag,
  findAllHashtags,
  hashtagPattern,
  hashtag,
  unwrappedHashtag,
  unescapeHashtagText,
} from './hashtag.ts';

import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';

type HashtagType = 'wrapped' | 'unwrapped';

function assertWrappedTags(input: string, expected: string[]) {
  const tags = findAllHashtags(input, { type: 'wrapped' }).map(
    (t) => t.rawText,
  );
  expect(tags).toEqual(expected);
}

function assertFirstTag(
  input: string,
  type: HashtagType | null,
  text?: string,
) {
  const res = findFirstHashtag(input);
  if (type === null) {
    expect(res).toBeNull();
  } else {
    expect(res).not.toBeNull();
    expect(res!.type).toBe(type);
    expect(res!.text).toBe(text);
  }
}

function assertUnwrappedRegExp(input: string, expected: string | null) {
  const regex = hashtagPattern({ type: 'unwrapped', global: true });
  regex.reset();
  const m = regex.exec(input);
  if (expected === null) {
    expect(m).toBeNull();
  } else {
    expect(m).not.toBeNull();
    expect(m![1]).toBe(expected);
  }
}

function assertSynthesis(text: string, expected: string) {
  expect(createHashtag(text)).toBe(expected);
}

describe('Text Unescaping', () => {
  it('unescapes wrapped text', () => {
    expect(unescapeHashtagText('foo')).toBe('foo');
    expect(unescapeHashtagText('foo\\<bar\\>')).toBe('foo<bar>');
    expect(unescapeHashtagText('foo\\\\bar')).toBe('foo\\bar');
    expect(unescapeHashtagText('f\\<o\\>o')).toBe('f<o>o');
    expect(unescapeHashtagText('a\\<b\\>c')).toBe('a<b>c');
    expect(unescapeHashtagText('foo\\x')).toBe('foox');
  });

  it('unescapes unwrapped text', () => {
    expect(unescapeHashtagText('foo')).toBe('foo');
    expect(unescapeHashtagText('foo\\#bar')).toBe('foo#bar');
    expect(unescapeHashtagText('foo\\\\bar')).toBe('foo\\bar');
    expect(unescapeHashtagText('foo\\xbar')).toBe('fooxbar');
    expect(unescapeHashtagText('\\#foo')).toBe('#foo');
  });
});

describe('Tag Synthesis', () => {
  it('synthesizes unwrapped syntax', () => {
    assertSynthesis('foo', '#foo');
    assertSynthesis('bar123', '#bar123');
    assertSynthesis('testTag', '#testTag');
    assertSynthesis('foo\\bar', '#foo\\\\bar');
    assertSynthesis('foo#bar', '#foo\\#bar');
    assertSynthesis('#foo', '#\\#foo');
    assertSynthesis('\\foo', '#\\\\foo');
  });

  it('synthesizes wrapped syntax when forced', () => {
    assertSynthesis('a b>c', '#<a b\\>c>');
    assertSynthesis('foo bar', '#<foo bar>');
  });

  it('handles angle brackets in synthesis', () => {
    assertSynthesis('a<b>c', '#a<b>c');
    assertSynthesis('a <b> c', '#<a \\<b\\> c>');
    assertSynthesis('<>', '#\\<>');
    assertSynthesis('<<', '#\\<<');
    assertSynthesis('>>', '#>>');
    assertSynthesis('<<<', '#\\<<<');
  });

  it('handles empty text', () => {
    const str = createHashtag('');
    const res = findFirstHashtag(str);
    expect(res).toBeNull();
  });

  it('roundtrips tag starting with escaped <', () => {
    const text = '<start';
    const str = createHashtag(text);
    const res = findFirstHashtag(str);
    expect(res).not.toBeNull();
    expect(res?.text).toBe(text);
  });

  it('rejects newlines in unwrapped synthesis', () => {
    expect(createHashtag('a\nb')).toBe('#<a\nb>');
    expect(createHashtag('a\rb')).toBe('#<a\rb>');
  });
});

describe('Wrapped Tags', () => {
  it('parses basic wrapped tags', () => {
    assertWrappedTags('#<foo>', ['foo']);
    assertWrappedTags('hello #<foo> world', ['foo']);
    assertWrappedTags('#<foo> #<bar>', ['foo', 'bar']);
  });

  it('handles escaped closing bracket', () => {
    assertWrappedTags('#<foo\\>>', ['foo\\>']);
    assertWrappedTags('#<foo\\\\>>', ['foo\\\\']);
    assertWrappedTags('#<foo\\\\\\>>', ['foo\\\\\\>']);
    assertWrappedTags('#<foo\\\\\\\\>>', ['foo\\\\\\\\']);
    assertWrappedTags('#<foo\\>bar>', ['foo\\>bar']);
  });

  it('ignores escaped leading hash', () => {
    assertWrappedTags('\\#<foo>', []);
    assertWrappedTags('abc\\#<bar>', []);
  });

  it('rejects empty wrapped tags', () => {
    assertWrappedTags('#<>', []);
    assertWrappedTags('#<\\>>', ['\\>']);
    assertWrappedTags('#<\\<\\>>', ['\\<\\>']);
  });

  it('allows nested brackets', () => {
    assertWrappedTags('#<foo<bar>>', ['foo<bar']);
    assertWrappedTags('#<foo\\<bar>>', ['foo\\<bar']);
    assertWrappedTags('#<x\\\\\\<y\\>>', ['x\\\\\\<y\\>']);
  });

  it('handles multiple tags', () => {
    assertWrappedTags('A#<one>B#<two>C', ['one', 'two']);
    assertWrappedTags('#<a>#<b>#<c>', ['a', 'b', 'c']);
  });

  it('rejects incomplete wrapped tags', () => {
    assertWrappedTags('#<foo', []);
    assertWrappedTags('#<foo\\>', []);
    assertWrappedTags('#<', []);
  });

  it('normalizes line breaks in wrapped text', () => {
    const r = hashtagPattern({ type: 'wrapped', capture: 'text' });
    const m = r.exec('#<a\nb>');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('a b');

    const m2 = r.exec('#<a\r\n  b>');
    expect(m2).not.toBeNull();
    expect(m2![1]).toBe('a b');

    const m3 = r.exec('#<a\r\tb>');
    expect(m3).not.toBeNull();
    expect(m3![1]).toBe('a b');
  });
});

describe('Unwrapped Tags', () => {
  it('parses basic unwrapped tags', () => {
    assertUnwrappedRegExp('#foo', 'foo');
    assertUnwrappedRegExp('#bar123', 'bar123');
    assertUnwrappedRegExp('abc #baz', 'baz');
  });

  it('terminates on strong terminators', () => {
    assertUnwrappedRegExp('#foo bar', 'foo');
    assertUnwrappedRegExp('#foo\nbar', 'foo');
    assertUnwrappedRegExp('#foo#bar', 'foo');
  });

  it('terminates on disallowed characters', () => {
    assertUnwrappedRegExp('\\#foo', null);
  });

  it('handles punctuation lookahead', () => {
    assertUnwrappedRegExp('#foo,bar', 'foo,bar');
    assertUnwrappedRegExp('#foo.bar', 'foo.bar');
    assertUnwrappedRegExp('#foo!a', 'foo!a');
    assertUnwrappedRegExp('#foo!!', 'foo');
    assertUnwrappedRegExp('#foo..', 'foo');
    assertUnwrappedRegExp('#tag:', 'tag');
    assertUnwrappedRegExp('#tag:a', 'tag:a');
  });

  it('allows extended characters', () => {
    assertUnwrappedRegExp('#foo/bar', 'foo/bar');
    assertUnwrappedRegExp('#a-b_c', 'a-b_c');
    assertUnwrappedRegExp('#123abc', '123abc');
    assertUnwrappedRegExp('#😀x', '😀x');
  });

  it('allows angle brackets', () => {
    assertUnwrappedRegExp('#foo<bar', 'foo<bar');
    assertUnwrappedRegExp('#tag>a<b', 'tag>a<b');
    assertUnwrappedRegExp('#a!<b', 'a!<b');
    assertUnwrappedRegExp('#tag<', 'tag<');
  });

  it('does not allow escaped newlines', () => {
    assertUnwrappedRegExp('#foo\\\nbar', 'foo');
    assertUnwrappedRegExp('#foo\\\r\nbar', 'foo');
    assertUnwrappedRegExp('#foo\\\rbar', 'foo');
  });
});

describe('RegExp Contract', () => {
  it('non-global exec does not advance', () => {
    const input = 'text #one #two';
    const r = unwrappedHashtag;
    r.reset();

    const m1 = r.exec(input);
    expect(m1).not.toBeNull();
    expect(m1![1]).toBe('one');
    expect(r.lastIndex).toBe(0);

    const m2 = r.exec(input);
    expect(m2).not.toBeNull();
    expect(m2![1]).toBe('one');
    expect(r.lastIndex).toBe(0);
  });

  it('global exec advances and updates lastIndex', () => {
    const input = 'text #one #two';
    const r = hashtagPattern({ type: 'unwrapped', global: true });
    r.reset();

    const m1 = r.exec(input);
    expect(m1).not.toBeNull();
    expect(m1![1]).toBe('one');
    expect(r.lastIndex).toBe((m1!.index ?? 0) + m1![0].length);

    const m2 = r.exec(input);
    expect(m2).not.toBeNull();
    expect(m2![1]).toBe('two');
    expect(r.lastIndex).toBe((m2!.index ?? 0) + m2![0].length);

    const m3 = r.exec(input);
    expect(m3).toBeNull();
    expect(r.lastIndex).toBe(0);
  });

  it('sticky requires a match at lastIndex', () => {
    const input = 'text #one #two';
    const r = hashtagPattern({
      type: 'unwrapped',
      sticky: true,
      global: true,
    });

    r.lastIndex = 0;
    let m = r.exec(input);
    expect(m).toBeNull();
    expect(r.lastIndex).toBe(0);

    r.lastIndex = 5;
    m = r.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#one');
    expect(m!.index).toBe(5);
    expect(r.lastIndex).toBe(9);

    m = r.exec(input);
    expect(m).toBeNull();
    expect(r.lastIndex).toBe(0);

    r.lastIndex = 10;
    m = r.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#two');
    expect(m!.index).toBe(10);
  });

  it('sticky without global still advances and resets on failure', () => {
    const input = 'text #one #two';
    const r = hashtagPattern({
      type: 'unwrapped',
      sticky: true,
      global: false,
    });

    r.lastIndex = 5;
    let m = r.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#one');
    expect(r.lastIndex).toBe(9);

    m = r.exec(input);
    expect(m).toBeNull();
    expect(r.lastIndex).toBe(0);
  });

  it('captures type as group 2 for combined matcher', () => {
    const r = hashtag;
    r.reset();

    const m = r.exec('#<x>');
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<x>');
    expect(m![1]).toBe('x');
    expect(m![2]).toBe('wrapped');
  });

  it('capture:text returns unescaped payload', () => {
    const r = hashtagPattern({ type: 'wrapped', capture: 'text' });

    const m1 = r.exec('#<foo\\>>');
    expect(m1).not.toBeNull();
    expect(m1![1]).toBe('foo>');

    const m2 = r.exec('#<foo\\<bar\\>>');
    expect(m2).not.toBeNull();
    expect(m2![1]).toBe('foo<bar>');
  });

  it('exec() sets RegExpExecArray.input to the original input', () => {
    const input = 'A #one B';
    const r = hashtagPattern({ type: 'unwrapped' });
    const m = r.exec(input);
    expect(m).not.toBeNull();
    expect(m!.input).toBe(input);
  });

  it('matchAll returns same sequence as global exec', () => {
    const input = 'A #one B #<two> C #three';
    const r1 = hashtagPattern({ type: 'any', global: true });
    const seq1: string[] = [];
    while (true) {
      const m = r1.exec(input);
      if (!m) break;
      seq1.push(m[0]);
    }

    const r2 = hashtagPattern({ type: 'any' });
    const seq2: string[] = [];
    for (const m of r2.matchAll(input)) {
      seq2.push(m[0]);
    }
    expect(seq2).toEqual(seq1);
  });

  it('matchAllMatches yields typed matches with raw/rawText/text', () => {
    const input = '#<a\\>b>\n#c\\ d';
    const r = hashtagPattern({ type: 'any' });
    const ms = Array.from(r.matchAllMatches(input));
    expect(ms.map((m) => m.raw)).toEqual(['#<a\\>b>', '#c\\ d']);
    expect(ms.map((m) => m.rawText)).toEqual(['a\\>b', 'c\\ d']);
    expect(ms.map((m) => m.text)).toEqual(['a>b', 'c d']);
  });
});

describe('Malformed Surrogates', () => {
  it('rejects lone high surrogate in unwrapped tag', () => {
    const s = `#\uD800x`;
    const m = hashtagPattern({ type: 'unwrapped' }).exec(s);
    expect(m).toBeNull();
    expect(findFirstHashtag(s)).toBeNull();
  });

  it('rejects lone low surrogate in unwrapped tag', () => {
    const s = `#\uDC00x`;
    const m = hashtagPattern({ type: 'unwrapped' }).exec(s);
    expect(m).toBeNull();
    expect(findFirstHashtag(s)).toBeNull();
  });

  it('rejects lone surrogate in wrapped tag', () => {
    const s = `#<\uD800>`;
    const m = hashtagPattern({ type: 'wrapped' }).exec(s);
    expect(m).toBeNull();
    expect(findFirstHashtag(s)).toBeNull();
  });

  it('accepts valid surrogate pairs', () => {
    const s = '#😀x';
    const m = hashtagPattern({ type: 'unwrapped' }).exec(s);
    expect(m).not.toBeNull();
    expect(m![1]).toBe('😀x');
  });
});

describe('Complex Regex Iteration', () => {
  const input =
    '\\# #<long name> #test\\#ing # #\\<magic> ## ' +
    '#🚀.launch #\n #<name> and #the\\ end.';

  it('iterates unwrapped regex over complex input', () => {
    const regex = hashtagPattern({ type: 'unwrapped', global: true });
    let m;

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#test\\#ing');
    expect(m![1]).toBe('test\\#ing');
    expect(m!.index).toBe(16);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#\\<magic>');
    expect(m![1]).toBe('\\<magic>');
    expect(m!.index).toBe(29);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#🚀.launch');
    expect(m![1]).toBe('🚀.launch');
    expect(m!.index).toBe(42);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#the\\ end');
    expect(m![1]).toBe('the\\ end');
    expect(m!.index).toBe(68);

    m = regex.exec(input);
    expect(m).toBeNull();
  });

  it('iterates wrapped regex over complex input', () => {
    const regex = hashtagPattern({ type: 'wrapped', global: true });
    let m;

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<long name>');
    expect(m![1]).toBe('long name');
    expect(m!.index).toBe(3);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<name>');
    expect(m![1]).toBe('name');
    expect(m!.index).toBe(56);

    m = regex.exec(input);
    expect(m).toBeNull();
  });

  it('iterates combined (hashtag) regex over complex input', () => {
    const regex = hashtagPattern({ type: 'any', global: true });
    let m;

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<long name>');
    expect(m![1]).toBe('long name');
    expect(m![2]).toBe('wrapped');
    expect(m!.index).toBe(3);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#test\\#ing');
    expect(m![1]).toBe('test\\#ing');
    expect(m![2]).toBe('unwrapped');
    expect(m!.index).toBe(16);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#\\<magic>');
    expect(m![1]).toBe('\\<magic>');
    expect(m![2]).toBe('unwrapped');
    expect(m!.index).toBe(29);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#🚀.launch');
    expect(m![1]).toBe('🚀.launch');
    expect(m![2]).toBe('unwrapped');
    expect(m!.index).toBe(42);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<name>');
    expect(m![1]).toBe('name');
    expect(m![2]).toBe('wrapped');
    expect(m!.index).toBe(56);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#the\\ end');
    expect(m![1]).toBe('the\\ end');
    expect(m![2]).toBe('unwrapped');
    expect(m!.index).toBe(68);

    m = regex.exec(input);
    expect(m).toBeNull();
  });
});

describe('Finding First Tag', () => {
  it('prefers wrapped when trigger present', () => {
    assertFirstTag('#<foo> #bar', 'wrapped', 'foo');
    assertFirstTag('abc #<xyz> #tag', 'wrapped', 'xyz');
  });

  it('finds unwrapped tags', () => {
    assertFirstTag('#foo', 'unwrapped', 'foo');
    assertFirstTag('text #tag', 'unwrapped', 'tag');
  });

  it('returns null when no tags found', () => {
    assertFirstTag('no hashtag here', null);
    assertFirstTag('\\#foo', null);
    assertFirstTag('#<>', null);
  });

  it('selects earliest tag by position', () => {
    assertFirstTag('#foo and #<bar>', 'unwrapped', 'foo');
    assertFirstTag('xxx #<bar> then #baz', 'wrapped', 'bar');
  });

  it('skips escaped hashes', () => {
    assertFirstTag('\\#fake #real', 'unwrapped', 'real');
    assertFirstTag('\\#fake #<wrapped> #u', 'wrapped', 'wrapped');
    assertFirstTag('\\#one \\#two #three', 'unwrapped', 'three');
  });
});

describe('Resilience & Recovery', () => {
  it('skips hash followed by space', () => {
    assertFirstTag('# #tag', 'unwrapped', 'tag');
    assertFirstTag('text # #tag', 'unwrapped', 'tag');
  });

  it('skips hash followed by strong terminator', () => {
    assertFirstTag('#\n#tag', 'unwrapped', 'tag');
    assertFirstTag('#\r\n#tag', 'unwrapped', 'tag');
  });

  it('handles consecutive hashes (##)', () => {
    assertFirstTag('##tag', 'unwrapped', 'tag');
    assertFirstTag('# #tag', 'unwrapped', 'tag');
    assertFirstTag('##', null);
    assertFirstTag('###tag', 'unwrapped', 'tag');
  });

  it('handles hashes followed by punctuation', () => {
    assertFirstTag('#..#tag', 'unwrapped', 'tag');
    assertFirstTag('#!#tag', 'unwrapped', '!');
  });

  it('recovers from complex invalid sequences', () => {
    assertFirstTag('##foo', 'unwrapped', 'foo');
    assertFirstTag('##foo#bar', 'unwrapped', 'foo');
  });
});

describe('Finding All Wrapped Tags', () => {
  it('finds multiple tags', () => {
    const tags = findAllHashtags('#<a>#<b>#<c>', { type: 'wrapped' });
    expect(tags.map((t) => t.rawText)).toEqual(['a', 'b', 'c']);
  });
});

describe('Unicode & Surrogates', () => {
  it('handles emoji in unwrapped tags', () => {
    assertFirstTag('#😀 stuff', 'unwrapped', '😀');
    assertSynthesis('😀', '#😀');
    assertUnwrappedRegExp('#😀', '😀');
  });

  it('handles emoji in wrapped tags', () => {
    assertWrappedTags('#<a😀b>', ['a😀b']);
    assertWrappedTags('#<x\\>😀>', ['x\\>😀']);
  });

  it('handles surrogate pairs at start', () => {
    assertUnwrappedRegExp('#😀x', '😀x');
    assertFirstTag('#😀x?', 'unwrapped', '😀x');
  });
});

describe('Boundaries & EOI', () => {
  it('handles start of line', () => {
    assertFirstTag('#start', 'unwrapped', 'start');
    assertUnwrappedRegExp('#line', 'line');
    assertFirstTag('\\#start', null);
    assertUnwrappedRegExp('\\#line', null);
  });

  it('handles end of line', () => {
    assertUnwrappedRegExp('#tail\nnext', 'tail');
    assertFirstTag('#tail\nnext', 'unwrapped', 'tail');
    assertUnwrappedRegExp('#tail\r\nnext', 'tail');
    assertFirstTag('#tail\r\nnext', 'unwrapped', 'tail');
  });

  it('handles end of text', () => {
    assertFirstTag('some text #final', 'unwrapped', 'final');
    assertUnwrappedRegExp('some text #final', 'final');
    assertFirstTag('intro #<end>', 'wrapped', 'end');
    assertFirstTag('#foo\\', 'unwrapped', 'foo');
    assertUnwrappedRegExp('#foo\\', 'foo\\');
  });

  it('handles hash at EOI', () => {
    assertFirstTag('#', null);
    assertUnwrappedRegExp('#', null);
  });

  it('handles hash+backslash at EOI', () => {
    assertFirstTag('#\\', null);
    assertUnwrappedRegExp('#\\', null);
  });

  it('handles incomplete wrapped at EOI', () => {
    assertFirstTag('#<', null);
    assertWrappedTags('#<', []);
  });

  it('handles punctuation at EOI', () => {
    assertFirstTag('list: #item,', 'unwrapped', 'item');
    assertUnwrappedRegExp('list: #item.', 'item');
    assertFirstTag('#tag:', 'unwrapped', 'tag');
  });
});

describe('Edge Cases & Specific Behavior', () => {
  it('allows escaped hash inside unwrapped', () => {
    const regex = hashtagPattern({ type: 'unwrapped', global: true });
    const m = regex.exec('#foo\\#bar');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('foo\\#bar');
    expect(unescapeHashtagText(m![1])).toBe('foo#bar');
  });

  it('does not fallback from wrapped to unwrapped', () => {
    const res = findFirstHashtag('#<tag');
    expect(res).toBeNull();
  });

  it('validates strict empty text rejection', () => {
    assertFirstTag('#\\\\', 'unwrapped', '\\');
    assertUnwrappedRegExp('#\\\\', '\\\\');
  });
});

describe('fromIndex', () => {
  it('handles fromIndex beyond end of input', () => {
    expect(findFirstHashtag('#tag', { fromIndex: 999 })).toBeNull();
    expect(findAllHashtags('#tag', { fromIndex: 999 })).toEqual([]);
  });

  it('handles fromIndex inside a surrogate pair without crashing', () => {
    const s = 'x😀 #ok';
    // Place fromIndex at the low-surrogate code unit of 😀
    const lowSurrogateIndex = 2;
    const m = findFirstHashtag(s, { fromIndex: lowSurrogateIndex });
    expect(m).not.toBeNull();
    expect(m!.raw).toBe('#ok');
  });
});
