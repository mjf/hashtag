import {
  findFirstHashtag,
  findHashtagWrappedTags,
  hashtagForContent,
  unescapeHashtagContent,
  unwrappedTagRegex,
} from './hashtag.ts';

import { describe, it } from 'https://deno.land/std/testing/bdd.ts';
import { expect } from 'https://deno.land/std/expect/mod.ts';

function testWrapped(input: string, expected: string[]) {
  const tags = findHashtagWrappedTags(input).map((t) => t.content);
  expect(tags).toEqual(expected);
}
function testFirst(
  input: string,
  type: 'wrapped' | 'unwrapped' | null,
  tag?: string,
) {
  const res = findFirstHashtag(input);
  if (type === null) {
    expect(res).toBeNull();
  } else {
    expect(res).not.toBeNull();
    expect(res!.type).toBe(type);
    expect(res!.tag).toBe(tag);
  }
}
function testUnwrappedRegex(input: string, expected: string | null) {
  const m = unwrappedTagRegex.exec(input);
  if (expected === null) {
    expect(m).toBeNull();
  } else {
    expect(m).not.toBeNull();
    expect(m![1]).toBe(expected);
  }
}
function testUnescapeWrapped(input: string, expected: string) {
  expect(unescapeHashtagContent(input)).toBe(expected);
}
function testUnescapeUnwrapped(input: string, expected: string) {
  expect(unescapeHashtagContent(input)).toBe(expected);
}
function testSynth(content: string, expected: string) {
  expect(hashtagForContent(content)).toBe(expected);
}

describe('Wrapped hashtag parsing', () => {
  it('basic wrapped', () => {
    testWrapped('#<foo>', ['foo']);
    testWrapped('hello #<foo> world', ['foo']);
    testWrapped('#<foo> #<bar>', ['foo', 'bar']);
  });

  it('escaped >', () => {
    testWrapped('#<foo\\>>', ['foo\\>']);
    testWrapped('#<foo\\\\>>', ['foo\\\\']);
    testWrapped('#<foo\\\\\\>>', ['foo\\\\\\>']);
    testWrapped('#<foo\\\\\\\\>>', ['foo\\\\\\\\']);
    testWrapped('#<foo\\>bar>', ['foo\\>bar']);
  });

  it('escaped leading #', () => {
    testWrapped('\\#<foo>', []);
    testWrapped('abc\\#<bar>', []);
  });

  it('empty tag', () => {
    testWrapped('#<>', []);
    testWrapped('#<\\>>', ['\\>']);
    testWrapped('#<\\<\\>>', ['\\<\\>']);
  });

  it('nested < or > inside', () => {
    testWrapped('#<foo<bar>>', ['foo<bar']);
    testWrapped('#<foo\\<bar>>', ['foo\\<bar']);
  });

  it('multiple tags in string', () => {
    testWrapped('A#<one>B#<two>C', ['one', 'two']);
    testWrapped('#<a>#<b>#<c>', ['a', 'b', 'c']);
  });

  it('escaped < in content', () => {
    testWrapped('#<foo\\<bar>', ['foo\\<bar']);
  });

  it('no closing >', () => {
    testWrapped('#<foo', []);
    testWrapped('#<foo\\>', []);
  });

  it('escapes in content', () => {
    testWrapped('#<foo\\\\bar>', ['foo\\\\bar']);
    testWrapped('#<foo\\<bar\\>>', ['foo\\<bar\\>']);
  });
});

describe('First hashtag detection', () => {
  it('wrapped first', () => {
    testFirst('#<foo> #bar', 'wrapped', 'foo');
    testFirst('abc #<xyz> #tag', 'wrapped', 'xyz');
  });

  it('unwrapped first', () => {
    testFirst('#foo', 'unwrapped', 'foo');
    testFirst('text #tag', 'unwrapped', 'tag');
  });

  it('none found', () => {
    testFirst('no hashtag here', null);
    testFirst('\\#foo', null);
    testFirst('#<>', null);
  });

  it('prefer earliest by position', () => {
    testFirst('#foo and #<bar>', 'unwrapped', 'foo');
    testFirst('xxx #<bar> then #baz', 'wrapped', 'bar');
  });
});

describe('Unwrapped hashtag regex (compat)', () => {
  it('basic', () => {
    testUnwrappedRegex('#foo', 'foo');
    testUnwrappedRegex('#bar123', 'bar123');
    testUnwrappedRegex('abc #baz', 'baz');
  });

  it('disallowed chars terminate', () => {
    testUnwrappedRegex('#foo,bar', 'foo,bar');
    testUnwrappedRegex('#foo.bar', 'foo.bar');
    testUnwrappedRegex('#foo bar', 'foo');
  });

  it('escaped #', () => {
    testUnwrappedRegex('\\#foo', null);
  });

  it('hash terminates', () => {
    testUnwrappedRegex('#foo#bar', 'foo');
  });

  it('control chars terminate', () => {
    testUnwrappedRegex('#foo\nbar', 'foo');
  });
});

describe('Unescape (wrapped)', () => {
  it('simple and special', () => {
    testUnescapeWrapped('foo', 'foo');
    testUnescapeWrapped('foo\\<bar\\>', 'foo<bar>');
    testUnescapeWrapped('foo\\\\bar', 'foo\\bar');
    testUnescapeWrapped('f\\<o\\>o', 'f<o>o');
    testUnescapeWrapped('a\\<b\\>c', 'a<b>c');
    testUnescapeWrapped('foo\\x', 'foox');
  });
});

describe('Unescape (unwrapped)', () => {
  it('simple and escapes', () => {
    testUnescapeUnwrapped('foo', 'foo');
    testUnescapeUnwrapped('foo\\#bar', 'foo#bar');
    testUnescapeUnwrapped('foo\\\\bar', 'foo\\bar');
    testUnescapeUnwrapped('foo\\xbar', 'fooxbar');
    testUnescapeUnwrapped('\\#foo', '#foo');
  });
});

describe('Hashtag synthesis (hashtagForContent)', () => {
  it('unwrapped ok (escaping where needed)', () => {
    testSynth('foo', '#foo');
    testSynth('bar123', '#bar123');
    testSynth('testTag', '#testTag');
    testSynth('foo\\bar', '#foo\\\\bar');
    testSynth('foo#bar', '#foo\\#bar');
    testSynth('#foo', '#\\#foo');
    testSynth('\\foo', '#\\\\foo');
  });

  it('wrapped forced for disallowed', () => {
    testSynth('foo bar', '#<foo bar>');
    testSynth('foo,bar', '#foo,bar');
    testSynth('abc:def', '#abc:def');
    testSynth('foo.bar', '#foo.bar');
    testSynth('a<b>c', '#<a\\<b\\>c>');
    testSynth('a\\b>c', '#<a\\\\b\\>c>');
    testSynth('foo<>', '#<foo\\<\\>>');
    testSynth('foo#bar?', '#foo\\#bar?');
  });
});

describe('Unicode and edge cases', () => {
  it('unwrapped emoji allowed', () => {
    testUnwrappedRegex('#😀', '😀');
    testFirst('#😀 stuff', 'unwrapped', '😀');
    testSynth('😀', '#😀');
  });

  it('wrapped with emoji and escapes', () => {
    testWrapped('#<a😀b>', ['a😀b']);
    testWrapped('#<x\\>😀>', ['x\\>😀']);
  });

  it('unwrapped with escaped hash inside', () => {
    const m = unwrappedTagRegex.exec('#foo\\#bar');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('foo\\#bar');
    expect(unescapeHashtagContent(m![1])).toBe('foo#bar');
  });

  it('lone trailing backslash in unwrapped', () => {
    const m = unwrappedTagRegex.exec('#foo\\');
    expect(m).not.toBeNull();
    expect(m![1]).toBe('foo\\');
    expect(unescapeHashtagContent(m![1])).toBe('foo');
  });
});

describe('Document / line boundaries', () => {
  it('start of line unwrapped', () => {
    testFirst('#start', 'unwrapped', 'start');
    testUnwrappedRegex('#line', 'line');
  });

  it('start of line escaped hash does not match', () => {
    testFirst('\\#start', null);
    testUnwrappedRegex('\\#line', null);
  });

  it('end of line unwrapped terminated by newline', () => {
    testUnwrappedRegex('#tail\nnext', 'tail');
    testFirst('#tail\nnext', 'unwrapped', 'tail');
  });

  it('end of line unwrapped terminated by CRLF', () => {
    testUnwrappedRegex('#tail\r\nnext', 'tail');
    testFirst('#tail\r\nnext', 'unwrapped', 'tail');
  });

  it('multiple lines earliest picks first valid', () => {
    testFirst('#one\n\\#not\n#<wrapped> after', 'unwrapped', 'one');
    testFirst('\\#skip\n#<wrapped> then #two', 'wrapped', 'wrapped');
  });

  it('hash followed by space then later tag', () => {
    testFirst('# something #real', 'unwrapped', 'real');
  });
});

describe('Unwrapped extended characters', () => {
  it('slash allowed in unwrapped', () => {
    testUnwrappedRegex('#foo/bar', 'foo/bar');
    testFirst('#foo/bar test', 'unwrapped', 'foo/bar');
  });

  it('hyphen and underscore allowed', () => {
    testUnwrappedRegex('#a-b_c', 'a-b_c');
    testFirst('text #a-b_c end', 'unwrapped', 'a-b_c');
  });

  it('digits leading', () => {
    testUnwrappedRegex('#123abc', '123abc');
    testFirst('#123abc!', 'unwrapped', '123abc');
  });

  it('surrogate pair at start plus ascii', () => {
    testUnwrappedRegex('#😀x', '😀x');
    testFirst('#😀x?', 'unwrapped', '😀x');
  });
});

describe('Wrapped edge / failure modes', () => {
  it('wrapped with escaped terminator > inside', () => {
    testWrapped('#<a\\>b>', ['a\\>b']);
  });

  it('wrapped invalid (empty) then valid later', () => {
    const tags = findHashtagWrappedTags('#<> #<ok>');
    expect(tags.map((t) => t.content)).toEqual(['ok']);
  });

  it('wrapped with escaped backslashes and angle mix', () => {
    testWrapped('#<x\\\\\\<y\\>>', ['x\\\\\\<y\\>']);
  });
});

describe('Earliest selection with escaped hashes', () => {
  it('skip escaped hash before valid', () => {
    testFirst('\\#fake #real', 'unwrapped', 'real');
    testFirst('\\#fake #<wrapped> #u', 'wrapped', 'wrapped');
  });

  it('multiple escaped then one valid unwrapped', () => {
    testFirst('\\#one \\#two #three', 'unwrapped', 'three');
  });
});

describe('Trailing and boundary behaviors', () => {
  it('unwrapped at end of text', () => {
    testFirst('some text #final', 'unwrapped', 'final');
    testUnwrappedRegex('some text #final', 'final');
  });

  it('wrapped at end of text', () => {
    testFirst('intro #<end>', 'wrapped', 'end');
  });

  it('unwrapped immediately before punctuation terminator', () => {
    testFirst('list: #item,', 'unwrapped', 'item');
    testUnwrappedRegex('list: #item.', 'item');
  });
});

describe('Synthesis additional checks', () => {
  it('synthesis with slash stays unwrapped', () => {
    testSynth('foo/bar', '#foo/bar');
  });

  it('synthesis with space forces wrapped', () => {
    testSynth('foo bar baz', '#<foo bar baz>');
  });

  it('synthesis with angle brackets escaped in wrapped', () => {
    testSynth('a<b>c', '#<a\\<b\\>c>');
  });
});
