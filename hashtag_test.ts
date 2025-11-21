import {
  findFirstHashtag,
  findHashtagWrappedTags,
  hashtagForContent,
  unescapeHashtagContent,
  unwrappedTagRegex,
} from "./hashtag.ts";

import { describe, it } from "https://deno.land/std/testing/bdd.ts";
import { expect } from "https://deno.land/std/expect/mod.ts";

describe("Position Independence (Stability)", () => {
  it("single punctuation at EOI vs with following space both terminate", () => {
    const atEOI = findFirstHashtag("#foo.");
    const withSpace = findFirstHashtag("#foo. bar");
    expect(atEOI?.tag).toBe("foo");
    expect(withSpace?.tag).toBe("foo");
  });

  it("version numbers stable across contexts", () => {
    expect(findFirstHashtag("#v2.0")?.tag).toBe("v2.0");
    expect(findFirstHashtag("#v2.0 released")?.tag).toBe("v2.0");
    expect(findFirstHashtag("Try #v2.0 now")?.tag).toBe("v2.0");
    expect(findFirstHashtag("#v2.0\n")?.tag).toBe("v2.0");
  });

  it("doubled punctuation stable across contexts", () => {
    expect(findFirstHashtag("#foo..")?.tag).toBe("foo.");
    expect(findFirstHashtag("#foo.. bar")?.tag).toBe("foo.");
    expect(findFirstHashtag("Use #foo.. here")?.tag).toBe("foo.");
  });

  it("hashtag with punctuation remains stable when text reflowed", () => {
    const original = "#path.to.file";
    const afterReflow = "#path.to.file more";
    const extracted = "See #path.to.file docs";

    expect(findFirstHashtag(original)?.tag).toBe("path.to.file");
    expect(findFirstHashtag(afterReflow)?.tag).toBe("path.to.file");
    expect(findFirstHashtag(extracted)?.tag).toBe("path.to.file");
  });
});

describe("Punctuation Termination with Lookahead", () => {
  it("period followed by letter continues", () => {
    expect(findFirstHashtag("#foo.bar")?.tag).toBe("foo.bar");
    expect(findFirstHashtag("#a.b.c")?.tag).toBe("a.b.c");
    expect(findFirstHashtag("#version2.0")?.tag).toBe("version2.0");
  });

  it("period followed by space terminates", () => {
    expect(findFirstHashtag("#foo. bar")?.tag).toBe("foo");
    expect(findFirstHashtag("#tag. more")?.tag).toBe("tag");
  });

  it("period at EOI terminates", () => {
    expect(findFirstHashtag("#foo.")?.tag).toBe("foo");
    expect(findFirstHashtag("#coding.")?.tag).toBe("coding");
  });

  it("comma followed by letter continues", () => {
    expect(findFirstHashtag("#foo,bar")?.tag).toBe("foo,bar");
    expect(findFirstHashtag("#a,b,c")?.tag).toBe("a,b,c");
  });

  it("comma followed by space terminates", () => {
    expect(findFirstHashtag("#foo, bar")?.tag).toBe("foo");
  });

  it("colon followed by letter continues", () => {
    expect(findFirstHashtag("#foo:bar")?.tag).toBe("foo:bar");
    expect(findFirstHashtag("#ns:tag:sub")?.tag).toBe("ns:tag:sub");
  });

  it("colon followed by space terminates", () => {
    expect(findFirstHashtag("#foo: bar")?.tag).toBe("foo");
  });

  it("exclamation and question followed by letters continue", () => {
    expect(findFirstHashtag("#wow!factor")?.tag).toBe("wow!factor");
    expect(findFirstHashtag("#what?now")?.tag).toBe("what?now");
  });

  it("exclamation and question followed by space terminate", () => {
    expect(findFirstHashtag("#wow! great")?.tag).toBe("wow");
    expect(findFirstHashtag("#what? more")?.tag).toBe("what");
  });

  it("semicolon followed by letter continues", () => {
    expect(findFirstHashtag("#path;param")?.tag).toBe("path;param");
  });

  it("semicolon followed by space terminates", () => {
    expect(findFirstHashtag("#path; more")?.tag).toBe("path");
  });

  it("punctuation followed by emoji continues", () => {
    expect(findFirstHashtag("#foo:🎉")?.tag).toBe("foo:🎉");
    expect(findFirstHashtag("#tag.🎉")?.tag).toBe("tag.🎉");
  });

  it("punctuation followed by digit continues", () => {
    expect(findFirstHashtag("#v2.0")?.tag).toBe("v2.0");
    expect(findFirstHashtag("#item:1")?.tag).toBe("item:1");
  });
});

describe("Doubling for Explicit Termination", () => {
  it("double period terminates", () => {
    expect(findFirstHashtag("#foo..")?.tag).toBe("foo.");
    expect(findFirstHashtag("#coding.. works")?.tag).toBe("coding.");
  });

  it("double exclamation terminates", () => {
    expect(findFirstHashtag("#awesome!!")?.tag).toBe("awesome!");
    expect(findFirstHashtag("#cool!! right")?.tag).toBe("cool!");
  });

  it("double question terminates", () => {
    expect(findFirstHashtag("#really??")?.tag).toBe("really?");
    expect(findFirstHashtag("#what?? now")?.tag).toBe("what?");
  });

  it("double comma terminates", () => {
    expect(findFirstHashtag("#item,,")?.tag).toBe("item,");
    expect(findFirstHashtag("#first,, second")?.tag).toBe("first,");
  });

  it("double colon terminates", () => {
    expect(findFirstHashtag("#ns::")?.tag).toBe("ns:");
    expect(findFirstHashtag("#tag:: more")?.tag).toBe("tag:");
  });

  it("double semicolon terminates", () => {
    expect(findFirstHashtag("#path;;")?.tag).toBe("path;");
  });

  it("triple punctuation behaves as double", () => {
    expect(findFirstHashtag("#foo...")?.tag).toBe("foo.");
    expect(findFirstHashtag("#wow!!!")?.tag).toBe("wow!");
  });
});

describe("Backslash Escaping", () => {
  it("backslash-punctuation includes punctuation and continues", () => {
    expect(findFirstHashtag("#foo\\.bar")?.tag).toBe("foo.bar");
    expect(findFirstHashtag("#tag\\,more")?.tag).toBe("tag,more");
  });

  it("trailing backslash at EOI", () => {
    expect(findFirstHashtag("#tag\\")?.tag).toBe("tag");
  });

  it("backslash before space includes space and continues until next space", () => {
    expect(findFirstHashtag("#with\\ space")?.tag).toBe("with space");
    expect(findFirstHashtag("#with\\ space more")?.tag).toBe("with space");
  });

  it("backslash before angle bracket includes it", () => {
    expect(findFirstHashtag("#has\\<bracket")?.tag).toBe("has<bracket");
    expect(findFirstHashtag("#has\\>bracket")?.tag).toBe("has>bracket");
  });

  it("backslash before hash includes hash", () => {
    expect(findFirstHashtag("#foo\\#bar")?.tag).toBe("foo#bar");
  });

  it("double backslash includes single backslash", () => {
    expect(findFirstHashtag("#foo\\\\bar")?.tag).toBe("foo\\bar");
  });

  it("backslash allows including punctuation that would terminate", () => {
    expect(findFirstHashtag("#foo\\. bar")?.tag).toBe("foo.");
    expect(findFirstHashtag("#tag\\, more")?.tag).toBe("tag,");
  });
});

describe("Strong Terminators", () => {
  it("space terminates immediately", () => {
    expect(findFirstHashtag("#foo bar")?.tag).toBe("foo");
  });

  it("tab terminates immediately", () => {
    expect(findFirstHashtag("#foo\tbar")?.tag).toBe("foo");
  });

  it("newline terminates immediately", () => {
    expect(findFirstHashtag("#foo\nbar")?.tag).toBe("foo");
  });

  it("carriage return terminates immediately", () => {
    expect(findFirstHashtag("#foo\rbar")?.tag).toBe("foo");
  });

  it("control characters terminate immediately", () => {
    expect(findFirstHashtag("#foo\x00bar")?.tag).toBe("foo");
    expect(findFirstHashtag("#foo\x1Fbar")?.tag).toBe("foo");
  });
});

describe("Angle Bracket Terminators", () => {
  it("left angle terminates unwrapped", () => {
    expect(findFirstHashtag("#foo<bar")?.tag).toBe("foo");
  });

  it("right angle terminates unwrapped", () => {
    expect(findFirstHashtag("#foo>bar")?.tag).toBe("foo");
  });

  it("escaped angles included", () => {
    expect(findFirstHashtag("#foo\\<bar")?.tag).toBe("foo<bar");
    expect(findFirstHashtag("#foo\\>bar")?.tag).toBe("foo>bar");
  });
});

describe("Combined Escaping and Doubling", () => {
  it("backslash-dot includes dot, next character continues if valid", () => {
    expect(findFirstHashtag("#foo\\.bar")?.tag).toBe("foo.bar");
    expect(findFirstHashtag("#foo\\..bar")?.tag).toBe("foo..bar");
  });

  it("dot then backslash-dot: includes both dots", () => {
    expect(findFirstHashtag("#foo.\\.end")?.tag).toBe("foo..end");
  });

  it("double backslash then double dot", () => {
    expect(findFirstHashtag("#foo\\\\..bar")?.tag).toBe("foo\\.");
  });

  it("backslash-dot then double dot", () => {
    expect(findFirstHashtag("#foo\\...bar")?.tag).toBe("foo..");
  });

  it("multiple escape pairs", () => {
    expect(findFirstHashtag("#a\\.b\\.c")?.tag).toBe("a.b.c");
  });

  it("escaped backslash before doubling", () => {
    expect(findFirstHashtag("#foo\\\\!!bar")?.tag).toBe("foo\\!");
  });
});

describe("Unicode Support", () => {
  it("emoji in content", () => {
    expect(findFirstHashtag("#foo🎉bar")?.tag).toBe("foo🎉bar");
    expect(findFirstHashtag("#🎉")?.tag).toBe("🎉");
  });

  it("emoji after punctuation continues", () => {
    expect(findFirstHashtag("#foo:🎉")?.tag).toBe("foo:🎉");
    expect(findFirstHashtag("#tag.🎉")?.tag).toBe("tag.🎉");
  });

  it("CJK characters", () => {
    expect(findFirstHashtag("#日本語")?.tag).toBe("日本語");
    expect(findFirstHashtag("#tag:日本語")?.tag).toBe("tag:日本語");
  });

  it("accented characters", () => {
    expect(findFirstHashtag("#café")?.tag).toBe("café");
    expect(findFirstHashtag("#café.français")?.tag).toBe("café.français");
  });

  it("currency symbols", () => {
    expect(findFirstHashtag("#price:€50")?.tag).toBe("price:€50");
    expect(findFirstHashtag("#cost:$100")?.tag).toBe("cost:$100");
  });

  it("escaped emoji", () => {
    expect(findFirstHashtag("#tag\\🎉more")?.tag).toBe("tag🎉more");
  });

  it("surrogate pair after backslash", () => {
    const result = findFirstHashtag("#test\\🎉end");
    expect(result?.tag).toBe("test🎉end");
  });
});

describe("Wrapped Hashtag Form", () => {
  it("basic wrapped", () => {
    expect(findFirstHashtag("#<simple>")?.tag).toBe("simple");
  });

  it("wrapped with spaces", () => {
    expect(findFirstHashtag("#<my tag>")?.tag).toBe("my tag");
  });

  it("escaped right angle in wrapped", () => {
    expect(findFirstHashtag("#<foo\\>bar>")?.tag).toBe("foo>bar");
  });

  it("left angle needs no escape in wrapped", () => {
    expect(findFirstHashtag("#<<nested>")?.tag).toBe("<nested");
    expect(findFirstHashtag("#<a<b>")?.tag).toBe("a<b");
  });

  it("escaped backslash in wrapped", () => {
    expect(findFirstHashtag("#<foo\\\\bar>")?.tag).toBe("foo\\bar");
  });

  it("multiple escaped chars in wrapped", () => {
    expect(findFirstHashtag("#<a\\>b\\\\c>")?.tag).toBe("a>b\\c");
  });

  it("wrapped takes precedence over unwrapped", () => {
    const result = findFirstHashtag("#<tag> #unwrapped");
    expect(result?.type).toBe("wrapped");
    expect(result?.tag).toBe("tag");
  });
});

describe("Empty Content Rejection", () => {
  it("unwrapped: hash followed by space", () => {
    expect(findFirstHashtag("# foo")).toBeNull();
  });

  it("unwrapped: hash followed by angle", () => {
    const result = findFirstHashtag("#<");
    expect(result).toBeNull();
  });

  it("unwrapped: hash at EOI", () => {
    expect(findFirstHashtag("#")).toBeNull();
  });

  it("unwrapped: hash followed by punctuation then space", () => {
    expect(findFirstHashtag("#. foo")).toBeNull();
  });

  it("wrapped: empty content", () => {
    expect(findFirstHashtag("#<>")).toBeNull();
  });

  it("wrapped: only escaped chars that unescape to empty", () => {
    expect(findFirstHashtag("#<\\>")).toBeNull();
  });
});

describe("Escaped Hash Detection", () => {
  it("single backslash before hash escapes it", () => {
    expect(findFirstHashtag("\\#foo")).toBeNull();
  });

  it("double backslash before hash does not escape", () => {
    const result = findFirstHashtag("\\\\#foo");
    expect(result?.tag).toBe("foo");
  });

  it("triple backslash escapes hash", () => {
    expect(findFirstHashtag("\\\\\\#foo")).toBeNull();
  });

  it("quadruple backslash does not escape hash", () => {
    const result = findFirstHashtag("\\\\\\\\#foo");
    expect(result?.tag).toBe("foo");
  });
});

describe("Punctuation Interactions", () => {
  it("period followed by comma terminates at period", () => {
    expect(findFirstHashtag("#foo.,bar")?.tag).toBe("foo");
  });

  it("comma followed by period terminates at comma", () => {
    expect(findFirstHashtag("#foo,.bar")?.tag).toBe("foo");
  });

  it("exclamation followed by question terminates", () => {
    expect(findFirstHashtag("#wow!?")?.tag).toBe("wow");
  });

  it("colon followed by semicolon terminates", () => {
    expect(findFirstHashtag("#tag:;")?.tag).toBe("tag");
  });

  it("any punctuation followed by different punctuation terminates", () => {
    expect(findFirstHashtag("#a.:b")?.tag).toBe("a");
    expect(findFirstHashtag("#a,;b")?.tag).toBe("a");
    expect(findFirstHashtag("#a!.b")?.tag).toBe("a");
  });
});

describe("Multiple Tags", () => {
  it("two unwrapped tags with space", () => {
    const first = findFirstHashtag("#foo #bar");
    expect(first?.tag).toBe("foo");
  });

  it("two unwrapped tags with doubled punctuation", () => {
    const first = findFirstHashtag("#foo.. #bar");
    expect(first?.tag).toBe("foo.");
  });

  it("wrapped and unwrapped in sequence", () => {
    const first = findFirstHashtag("#<wrapped> #unwrapped");
    expect(first?.type).toBe("wrapped");
    expect(first?.tag).toBe("wrapped");
  });
});

describe("Synthesis: hashtagForContent", () => {
  it("simple content remains unwrapped", () => {
    expect(hashtagForContent("simple")).toBe("#simple");
    expect(hashtagForContent("foo123")).toBe("#foo123");
  });

  it("content with spaces forces wrapped", () => {
    expect(hashtagForContent("my tag")).toBe("#<my tag>");
  });

  it("content with angle brackets forces wrapped and escapes", () => {
    expect(hashtagForContent("a<b>c")).toBe("#<a<b\\>c>");
  });

  it("backslash escaped in unwrapped", () => {
    expect(hashtagForContent("foo\\bar")).toBe("#foo\\\\bar");
  });

  it("hash escaped in unwrapped", () => {
    expect(hashtagForContent("foo#bar")).toBe("#foo\\#bar");
  });

  it("consecutive punctuation escaped to prevent doubling", () => {
    expect(hashtagForContent("foo..bar")).toBe("#foo.\\.bar");
    expect(hashtagForContent("wow!!")).toBe("#wow!\\!");
  });

  it("single punctuation not escaped", () => {
    expect(hashtagForContent("foo.bar")).toBe("#foo.bar");
    expect(hashtagForContent("version2.0")).toBe("#version2.0");
  });

  it("wrapped form escapes only backslash and right angle", () => {
    const wrapped = hashtagForContent("a b < c > d \\ e");
    expect(wrapped).toBe("#<a b < c \\> d \\\\ e>");
  });
});

describe("Round-Trip Property", () => {
  it("simple content round-trips", () => {
    const content = "simple";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with punctuation round-trips", () => {
    const content = "foo.bar.baz";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with consecutive punctuation round-trips", () => {
    const content = "foo..bar";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with backslash round-trips", () => {
    const content = "foo\\bar";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with hash round-trips", () => {
    const content = "foo#bar";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with emoji round-trips", () => {
    const content = "foo🎉bar";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });

  it("content with spaces round-trips via wrapped", () => {
    const content = "my tag";
    const tag = hashtagForContent(content);
    const parsed = findFirstHashtag(tag);
    expect(parsed?.tag).toBe(content);
  });
});

describe("unwrappedTagRegex Compatibility", () => {
  it("finds first unwrapped tag", () => {
    const m = unwrappedTagRegex.exec("#foo bar");
    expect(m).not.toBeNull();
    expect(m![0]).toBe("#foo");
    expect(m![1]).toBe("foo");
    expect((m as any).index).toBe(0);
  });

  it("handles punctuation", () => {
    const m = unwrappedTagRegex.exec("#foo.bar");
    expect(m![1]).toBe("foo.bar");
  });

  it("handles doubling", () => {
    const m = unwrappedTagRegex.exec("#foo..");
    expect(m![1]).toBe("foo.");
  });

  it("returns null when no tag", () => {
    expect(unwrappedTagRegex.exec("no tag here")).toBeNull();
  });

  it("skips escaped hash", () => {
    expect(unwrappedTagRegex.exec("\\#foo")).toBeNull();
  });

  it("skips wrapped form", () => {
    expect(unwrappedTagRegex.exec("#<wrapped>")).toBeNull();
  });
});

describe("findHashtagWrappedTags", () => {
  it("finds multiple wrapped tags", () => {
    const tags = findHashtagWrappedTags("#<one> #<two> #<three>");
    expect(tags.length).toBe(3);
    expect(tags.map((t) => unescapeHashtagContent(t.content))).toEqual([
      "one",
      "two",
      "three",
    ]);
  });

  it("returns raw content with escapes", () => {
    const tags = findHashtagWrappedTags("#<foo\\>bar>");
    expect(tags[0].content).toBe("foo\\>bar");
    expect(unescapeHashtagContent(tags[0].content)).toBe("foo>bar");
  });

  it("ignores unwrapped tags", () => {
    const tags = findHashtagWrappedTags("#unwrapped #<wrapped>");
    expect(tags.length).toBe(1);
    expect(unescapeHashtagContent(tags[0].content)).toBe("wrapped");
  });

  it("handles escaped leading hash", () => {
    const tags = findHashtagWrappedTags("\\#<not> #<valid>");
    expect(tags.length).toBe(1);
    expect(unescapeHashtagContent(tags[0].content)).toBe("valid");
  });
});

describe("Stress Tests: Complex Scenarios", () => {
  it("long chain of punctuation and escapes", () => {
    const result = findFirstHashtag("#a.b\\.c..d");
    expect(result?.tag).toBe("a.b.c.");
  });

  it("mixed unicode and escapes", () => {
    const result = findFirstHashtag("#café\\🎉français");
    expect(result?.tag).toBe("café🎉français");
  });

  it("alternating backslashes and punctuation", () => {
    const result = findFirstHashtag("#a\\.\\.\\.b");
    expect(result?.tag).toBe("a...b");
  });

  it("quadruple punctuation", () => {
    expect(findFirstHashtag("#wow!!!!")?.tag).toBe("wow!");
  });

  it("escaped then doubled punctuation", () => {
    expect(findFirstHashtag("#tag\\...more")?.tag).toBe("tag..");
  });
});

describe("Real-World Usage Patterns", () => {
  it("version numbers in sentences", () => {
    const text =
      "Use #version2.0 for better performance. The #stable1.5 is deprecated.";
    expect(findFirstHashtag(text)?.tag).toBe("version2.0");
  });

  it("emphatic hashtags", () => {
    const text = "This is #awesome!! I love it!";
    expect(findFirstHashtag(text)?.tag).toBe("awesome!");
  });

  it("namespace tags", () => {
    const text = "Check #project:feature:docs for details.";
    expect(findFirstHashtag(text)?.tag).toBe("project:feature:docs");
  });

  it("file paths", () => {
    const text = "See #src/lib/utils.ts file.";
    expect(findFirstHashtag(text)?.tag).toBe("src/lib/utils.ts");
  });

  it("ending sentence with hashtag", () => {
    const text = "I love #coding..";
    expect(findFirstHashtag(text)?.tag).toBe("coding.");
  });

  it("list of hashtags", () => {
    const text = "#first,, #second,, #third";
    expect(findFirstHashtag(text)?.tag).toBe("first,");
  });

  it("multilingual content", () => {
    const text = "Learn #日本語.tutorial today!";
    expect(findFirstHashtag(text)?.tag).toBe("日本語.tutorial");
  });

  it("hashtag followed by period at sentence end", () => {
    const text = "I like #coding.";
    expect(findFirstHashtag(text)?.tag).toBe("coding");
  });

  it("hashtag in middle of sentence with period", () => {
    const text = "The #v2.0 release is great.";
    expect(findFirstHashtag(text)?.tag).toBe("v2.0");
  });
});

describe("Edge Cases: Punctuation at Boundaries", () => {
  it("punctuation followed by newline terminates", () => {
    expect(findFirstHashtag("#tag.\nmore")?.tag).toBe("tag");
    expect(findFirstHashtag("#tag,\nmore")?.tag).toBe("tag");
  });

  it("punctuation followed by tab terminates", () => {
    expect(findFirstHashtag("#tag.\tmore")?.tag).toBe("tag");
  });

  it("punctuation followed by angle bracket terminates", () => {
    expect(findFirstHashtag("#tag.<more")?.tag).toBe("tag");
    expect(findFirstHashtag("#tag.>more")?.tag).toBe("tag");
  });

  it("escaped punctuation followed by space terminates at space", () => {
    expect(findFirstHashtag("#tag\\. more")?.tag).toBe("tag.");
  });
});
