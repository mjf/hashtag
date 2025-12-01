# Hashtag Parser

Implementation of a dual-form hashtag syntax with position-independent
parsing, intelligent punctuation handling, and backslash escaping.

## Formal Syntax Specification

This parser recognizes two hashtag forms: wrapped hashtags delimited by
angle brackets (`#<content>`), and unwrapped hashtags (`#content`) with
intelligent punctuation handling based on lookahead analysis.

### Wrapped Hashtag Form

**Syntax:** `#<content>`

A wrapped hashtag begins with an unescaped hash (`#`) followed
immediately by a left angle bracket (`<`). The hash is unescaped when
preceded by an even number of backslashes (including zero). The content
extends until the first unescaped right angle bracket (`>`).

#### Escape rules within wrapped content

- Backslash (`\`) followed by any character forms an escape pair
- The backslash is consumed during unescaping, and the following
  character is included literally
- The right angle bracket (`>`) must be escaped as `\>` to appear
  literally
- The backslash itself must be escaped as `\\` to appear literally
- The left angle bracket (`<`) should be escaped as `\<` for clarity
  (not strictly required for parsing)
- All other characters may appear literally without escaping

Content must be non-empty. The sequence `#<>` is rejected.

#### Examples

```
#<simple>           → "simple"
#<with\>bracket>    → "with>bracket"
#<back\\slash>      → "back\slash"
#<<nested>          → "<nested"
#<\<escaped>        → "<escaped"
```

With surrounding text:

```
Use #<my tag> here.     → "my tag"
The #<a\>b> format.     → "a>b"
See #<<special>> data.  → "<special"
```

### Unwrapped Hashtag Form

**Syntax:** `#content`

An unwrapped hashtag begins with an unescaped hash not followed by
a left angle bracket. The content extends maximally according to
character classification and lookahead rules.

#### Termination Conditions

The fundamental design principle is **position independence**:
a hashtag's interpretation must remain stable under text transformations
(reflowing, concatenation, insertion, extraction). Termination depends
only on the local character sequence, not on distant context.

##### Strong Terminators (immediate, unconditional)

- Whitespace and control characters: code points `≤ 0x20` (includes
  SPACE, TAB, CR, LF, and all C0 controls)

- Extended control characters: code points `0x7F` through `0x9F` (DEL
  and C1 controls)

- Left and right angle brackets: `<` and `>` (prevent ambiguity with
  wrapped form)

- Hash character: `#` (marks potential start of next hashtag)

##### Punctuation Characters (lookahead-based termination)

The characters `.`, `,`, `;`, `:`, `!`, `?` use lookahead to determine
termination:

- Punctuation followed by strong terminator → **terminates**
- Punctuation followed by another punctuation → **terminates**
- Punctuation followed by angle bracket → **terminates**
- Punctuation at end-of-input → **terminates**
- Punctuation followed by other characters → **included, continues**

This design mirrors natural text where sentence punctuation is followed
by whitespace or end of input, while mid-word punctuation (e.g.,
`version2.0`, `foo:bar`) indicates compound identifiers.

#### Backslash Escaping

Backslash provides explicit control over character inclusion and termination:

- Backslash followed by any character forms an escape pair
- The backslash is consumed during unescaping
- The following character is included literally in content
- An escape pair always continues the hashtag (never terminates)

##### Escape pair handling

- `\` + punctuation → includes the punctuation literally, continues
- `\` + whitespace → includes the whitespace literally, continues
- `\` + `\` → includes a single backslash literally, continues
- `\` + `#` → includes hash literally, continues
- `\` + `<` or `>` → includes angle bracket literally, continues
- `\` at end-of-input → consumed, produces nothing, terminates

#### Examples

##### Punctuation with lookahead

```
#foo.bar            → "foo.bar"
#version2.0         → "version2.0"
#cool!              → "cool"            (! at EOI terminates)
#what?now           → "what?now"
#foo:bar:baz        → "foo:bar:baz"
```

With surrounding text:

```
Use #foo.bar here.            → "foo.bar"
Try #version2.0 now.          → "version2.0"
This is #cool! Right?         → "cool"
Ask #what?now please.         → "what?now"
See #foo:bar:baz format.      → "foo:bar:baz"
```

##### Backslash escaping

```
#foo\,bar           → "foo,bar"        (comma included via escape)
#with\ space        → "with space"     (space included via escape)
#has\<bracket       → "has<bracket"    (angle bracket included)
#foo\#bar           → "foo#bar"        (hash included)
#foo\\bar           → "foo\bar"        (backslash included)
#tag\.              → "tag"            (backslash consumed at EOI)
```

With surrounding text:

```
Use #with\ space here.        → "with space"
The #has\<bracket format.     → "has<bracket"
Try #foo\#bar method.         → "foo#bar"
See #foo\\bar usage.          → "foo\bar"
```

##### Punctuation termination

```
#tag,               → "tag"            (comma at EOI terminates)
#tag!               → "tag"            (exclamation at EOI terminates)
#foo, bar           → "foo"            (comma before space terminates)
#foo. bar           → "foo"            (period before space terminates)
#foo!!              → "foo"            (first ! terminates before second !)
```

##### Unicode support

```
#café.français      → "café.français"
#foo:🎉             → "foo:🎉"
#tag:日本語         → "tag:日本語"
#price:€50          → "price:€50"
```

With surrounding text:

```
Use #café.français style.     → "café.français"
This is #foo:🎉 time!         → "foo:🎉"
See #tag:日本語 docs.         → "tag:日本語"
Check #price:€50 rate.        → "price:€50"
```

## Unicode Handling

The parser operates on UTF-16 code units while treating surrogate pairs
as atomic units. A high surrogate (U+D800 through U+DBFF) followed by
a low surrogate (U+DC00 through U+DFFF) represents a single code point
and is processed atomically during content scanning and escape pair
recognition.

## Parsing Semantics

The parser uses leftmost matching: when multiple potential hashtags
exist, the one beginning at the earliest position is selected. At each
unescaped hash position, wrapped form takes precedence (checked first)
when the hash is followed by a left angle bracket. Empty content is
rejected in both forms.

The lookahead-based punctuation handling ensures stability: a hashtag's
interpretation never changes based on its position in text or what
follows at a distance. This is critical for text transformations like
reflowing, concatenation, and extraction.

## API

### `findFirstHashtag(input: string): FirstHashtag | null`

Returns the earliest hashtag (by index) in the input string.

Returns an object with:

- `type`: `"wrapped"` or `"unwrapped"`
- `tag`: The unescaped hashtag content

Returns `null` if no valid hashtag is found.

**Example:**

```typescript
findFirstHashtag("Check out #version2.0 today!");
// → { type: "unwrapped", tag: "version2.0" }

findFirstHashtag("Use #<my tag> here");
// → { type: "wrapped", tag: "my tag" }
```

### `findHashtagWrappedTags(input: string): WrappedHashtag[]`

Finds all wrapped `#<...>` tags in the input string.

Returns an array of objects with:

- `start`: Starting index of the tag (at the `#`)
- `end`: Ending index (after the `>`)
- `content`: The raw (still-escaped) content

**Example:**

```typescript
findHashtagWrappedTags("See #<tag1> and #<tag2>");
// → [
//     { start: 4, end: 11, content: "tag1" },
//     { start: 16, end: 23, content: "tag2" }
//    ]
```

### `unescapeHashtagContent(content: string): string`

Removes escape sequences from hashtag content. Handles both wrapped and unwrapped escaping rules by removing one backslash from each `\X` pair.

**Example:**

```typescript
unescapeHashtagContent("foo\\#bar"); // → "foo#bar"
unescapeHashtagContent("foo\\>bar"); // → "foo>bar"
unescapeHashtagContent("foo\\\\bar"); // → "foo\bar"
```

### `hashtagForContent(content: string): string`

Returns the correct hashtag syntax for given unescaped content.

- Uses unwrapped syntax if possible (no strong terminators or angle brackets)
- Escapes `\` and `#` in unwrapped form
- Uses wrapped `#<...>` syntax otherwise
- Escapes `\`, `>`, and `<` in wrapped form

**Example:**

```typescript
hashtagForContent("simple"); // → "#simple"
hashtagForContent("foo#bar"); // → "#foo\\#bar"
hashtagForContent("my tag"); // → "#<my tag>"
hashtagForContent("a<b>c"); // → "#<a\\<b\\>c>"
```

### `unwrappedTagRegex`

A regex-like object exposing `exec()` for compatibility with legacy code. Finds the first unwrapped hashtag and returns a match array with:

- `[0]`: The full match including `#`
- `[1]`: The raw content (still-escaped)
- `index`: The starting position

**Example:**

```typescript
const match = unwrappedTagRegex.exec("text #foo bar");
// match[0] → "#foo"
// match[1] → "foo"
// match.index → 5
```
