import {
  createHashtag,
  findHashtag,
  findWrappedHashtags,
  HashtagType,
  hashtagRegExp,
  wrappedHashtagRegExp,
  unescapeHashtagText,
  unwrappedHashtagRegExp,
} from './hashtag.ts';

import { describe, it } from '@std/testing/bdd';
import { expect } from '@std/expect';

function assertWrappedTags(input: string, expected: string[]) {
  const tags = findWrappedHashtags(input).map((t) => t.text);
  expect(tags).toEqual(expected);
}

function assertFirstTag(
  input: string,
  type: HashtagType.Wrapped | HashtagType.Unwrapped | null,
  text?: string,
) {
  const res = findHashtag(input);
  if (type === null) {
    expect(res).toBeNull();
  } else {
    expect(res).not.toBeNull();
    expect(res!.type).toBe(type);
    expect(res!.text).toBe(text);
  }
}

function assertUnwrappedRegExp(input: string, expected: string | null) {
  const m = unwrappedHashtagRegExp.exec(input);
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
    const res = findHashtag(str);
    expect(res).toBeNull();
  });

  it('roundtrips tag starting with escaped <', () => {
    const text = '<start';
    const str = createHashtag(text);
    const res = findHashtag(str);
    expect(res).not.toBeNull();
    expect(res?.text).toBe(text);
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
});

describe('RegExp Mock (State)', () => {
  it('supports global iteration', () => {
    const input = 'text #one #<wrapped> #two #<three> #four';
    const regexp = unwrappedHashtagRegExp;

    let m = regexp.exec(input);
    expect(m![1]).toBe('one');

    m = regexp.exec(input);
    expect(m![1]).toBe('two');

    m = regexp.exec(input);
    expect(m![1]).toBe('four');

    m = regexp.exec(input);
    expect(m).toBeNull();
  });

  it('resets on new input', () => {
    const regexp = unwrappedHashtagRegExp;
    regexp.exec('#first');
    const m = regexp.exec('#second');
    expect(m![1]).toBe('second');
  });
});

describe('Complex Regex Iteration', () => {
  const input =
    '\\# #<long name> #test\\#ing # #\\<magic> ## ' +
    '#🚀.launch #\n #<skip> and #the\\ end.';

  it('iterates unwrapped regex over complex input', () => {
    const regex = unwrappedHashtagRegExp;
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
    const regex = wrappedHashtagRegExp;
    let m;

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<long name>');
    expect(m![1]).toBe('long name');
    expect(m!.index).toBe(3);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<skip>');
    expect(m![1]).toBe('skip');
    expect(m!.index).toBe(56);

    m = regex.exec(input);
    expect(m).toBeNull();
  });

  it('iterates combined (hashtag) regex over complex input', () => {
    const regex = hashtagRegExp;
    let m;

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<long name>');
    expect(m![1]).toBe('long name');
    expect(m![2]).toBe(HashtagType.Wrapped);
    expect(m!.index).toBe(3);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#test\\#ing');
    expect(m![1]).toBe('test\\#ing');
    expect(m![2]).toBe(HashtagType.Unwrapped);
    expect(m!.index).toBe(16);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#\\<magic>');
    expect(m![1]).toBe('\\<magic>');
    expect(m![2]).toBe(HashtagType.Unwrapped);
    expect(m!.index).toBe(29);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#🚀.launch');
    expect(m![1]).toBe('🚀.launch');
    expect(m![2]).toBe(HashtagType.Unwrapped);
    expect(m!.index).toBe(42);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#<skip>');
    expect(m![1]).toBe('skip');
    expect(m![2]).toBe(HashtagType.Wrapped);
    expect(m!.index).toBe(56);

    m = regex.exec(input);
    expect(m).not.toBeNull();
    expect(m![0]).toBe('#the\\ end');
    expect(m![1]).toBe('the\\ end');
    expect(m![2]).toBe(HashtagType.Unwrapped);
    expect(m!.index).toBe(68);

    m = regex.exec(input);
    expect(m).toBeNull();
  });
});

describe('Finding First Tag', () => {
  it('prefers wrapped when trigger present', () => {
    assertFirstTag('#<foo> #bar', HashtagType.Wrapped, 'foo');
    assertFirstTag('abc #<xyz> #tag', HashtagType.Wrapped, 'xyz');
  });

  it('finds unwrapped tags', () => {
    assertFirstTag('#foo', HashtagType.Unwrapped, 'foo');
    assertFirstTag('text #tag', HashtagType.Unwrapped, 'tag');
  });

  it('returns null when no tags found', () => {
    assertFirstTag('no hashtag here', null);
    assertFirstTag('\\#foo', null);
    assertFirstTag('#<>', null);
  });

  it('selects earliest tag by position', () => {
    assertFirstTag('#foo and #<bar>', HashtagType.Unwrapped, 'foo');
    assertFirstTag('xxx #<bar> then #baz', HashtagType.Wrapped, 'bar');
  });

  it('skips escaped hashes', () => {
    assertFirstTag('\\#fake #real', HashtagType.Unwrapped, 'real');
    assertFirstTag(
      '\\#fake #<wrapped> #u',
      HashtagType.Wrapped,
      HashtagType.Wrapped,
    );
    assertFirstTag(
      '\\#one \\#two #three',
      HashtagType.Unwrapped,
      'three',
    );
  });
});

describe('Resilience & Recovery', () => {
  it('skips hash followed by space', () => {
    assertFirstTag('# #tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('text # #tag', HashtagType.Unwrapped, 'tag');
  });

  it('skips hash followed by strong terminator', () => {
    assertFirstTag('#\n#tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('#\r\n#tag', HashtagType.Unwrapped, 'tag');
  });

  it('handles consecutive hashes (##)', () => {
    assertFirstTag('##tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('# #tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('##', null);
    assertFirstTag('###tag', HashtagType.Unwrapped, 'tag');
  });

  it('handles hashes followed by punctuation', () => {
    assertFirstTag('#..#tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('#..#tag', HashtagType.Unwrapped, 'tag');
    assertFirstTag('#!#tag', HashtagType.Unwrapped, '!');
  });

  it('recovers from complex invalid sequences', () => {
    assertFirstTag('##foo', HashtagType.Unwrapped, 'foo');
    assertFirstTag('##foo#bar', HashtagType.Unwrapped, 'foo');
  });
});

describe('Finding All Wrapped Tags', () => {
  it('finds multiple tags', () => {
    const tags = findWrappedHashtags('#<a>#<b>#<c>');
    expect(tags.map((t) => t.text)).toEqual(['a', 'b', 'c']);
  });
});

describe('Unicode & Surrogates', () => {
  it('handles emoji in unwrapped tags', () => {
    assertFirstTag('#😀 stuff', HashtagType.Unwrapped, '😀');
    assertSynthesis('😀', '#😀');
    assertUnwrappedRegExp('#😀', '😀');
  });

  it('handles emoji in wrapped tags', () => {
    assertWrappedTags('#<a😀b>', ['a😀b']);
    assertWrappedTags('#<x\\>😀>', ['x\\>😀']);
  });

  it('handles surrogate pairs at start', () => {
    assertUnwrappedRegExp('#😀x', '😀x');
    assertFirstTag('#😀x?', HashtagType.Unwrapped, '😀x');
  });
});

describe('Boundaries & EOI', () => {
  it('handles start of line', () => {
    assertFirstTag('#start', HashtagType.Unwrapped, 'start');
    assertUnwrappedRegExp('#line', 'line');
    assertFirstTag('\\#start', null);
    assertUnwrappedRegExp('\\#line', null);
  });

  it('handles end of line', () => {
    assertUnwrappedRegExp('#tail\nnext', 'tail');
    assertFirstTag('#tail\nnext', HashtagType.Unwrapped, 'tail');
    assertUnwrappedRegExp('#tail\r\nnext', 'tail');
    assertFirstTag('#tail\r\nnext', HashtagType.Unwrapped, 'tail');
  });

  it('handles end of text', () => {
    assertFirstTag('some text #final', HashtagType.Unwrapped, 'final');
    assertUnwrappedRegExp('some text #final', 'final');
    assertFirstTag('intro #<end>', HashtagType.Wrapped, 'end');
    assertFirstTag('#foo\\', HashtagType.Unwrapped, 'foo');
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
    assertFirstTag('list: #item,', HashtagType.Unwrapped, 'item');
    assertUnwrappedRegExp('list: #item.', 'item');
    assertFirstTag('#tag:', HashtagType.Unwrapped, 'tag');
  });
});

describe('Edge Cases & Specific Behavior', () => {
  it('allows escaped hash inside unwrapped', () => {
    const m = unwrappedHashtagRegExp.exec('#foo\\#bar');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('foo\\#bar');
    expect(unescapeHashtagText(m![1])).toBe('foo#bar');
  });

  it('does not fallback from wrapped to unwrapped', () => {
    const res = findHashtag('#<tag');
    expect(res).toBeNull();
  });

  it('validates strict empty text rejection', () => {
    assertFirstTag('#\\\\', HashtagType.Unwrapped, '\\');
    assertUnwrappedRegExp('#\\\\', '\\\\');
  });
});
