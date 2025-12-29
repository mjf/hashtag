# Hashtag Parser

TypeScript implementation of a dual-form hashtag syntax with
position-independent parsing, intelligent punctuation handling, and
backslash escaping.

## Syntax Overview

This parser recognizes two hashtag forms: **wrapped** (`#<content>`) and
**unwrapped** (`#content`). Both forms support backslash escaping for
precise control over content boundaries.

### Wrapped Form: `#<content>`

Wrapped hashtags use angle bracket delimiters for content that contains
whitespace, control characters, or angle brackets.

**ABNF Grammar:**

```abnf
wrapped-hashtag = unescaped-hash "<" wrapped-content ">"
unescaped-hash  = "#"
                ; preceded by even number of backslashes (including zero)
wrapped-content = 1*wrapped-char
wrapped-char    = escape-pair / regular-char
escape-pair     = "\" ANY
regular-char    = %x00-3D / %x3F-5B / %x5D-10FFFF
                ; any character except ">" and "\" (must be escaped)
ANY             = %x00-10FFFF
```

**Escaping rules:**

- Backslash (`\`) followed by any character forms an escape pair
- The backslash is consumed; the following character appears literally
  in unescaped content
- Must escape: `\` as `\\`, `<` as `\<`, and `>` as `\>`

**Examples:**

| Example            | Yields         |
| ------------------ | -------------- |
| `#<simple>`        | `simple`       |
| `#<with\>bracket>` | `with>bracket` |
| `#<back\\slash>`   | `back\slash`   |
| `#<<nested>`       | `<nested`      |
| `#<\<escaped>`     | `<escaped`     |

With surrounding text:

| Example                  | Yields     |
| ------------------------ | ---------- |
| `Use #<my tag> here.`    | `my tag`   |
| `The #<a\>b> format.`    | `a>b`      |
| `See #<<special>> data.` | `<special` |

### Unwrapped Form: `#content`

Unwrapped hashtags provide a compact syntax for identifiers, avoiding
delimiters when content contains no problematic characters.

**ABNF Grammar:**

```abnf
unwrapped-hashtag  = unescaped-hash unwrapped-content
unescaped-hash     = "#"
                   ; where preceded by even number of backslashes
                   ; and not followed by "<"
unwrapped-content  = 1*unwrapped-char
unwrapped-char     = escape-pair / punct-continuation / regular-char
escape-pair        = "\" ANY
                   ; always continues, never terminates
punct-continuation = PUNCT non-terminator
                   ; punctuation followed by continuing character
regular-char       = %x22 / %x24-2B / %x2D / %x2F-39 / %x3D
                   / %x3C-3E / %x40-10FFFF
                   ; excludes: STRONG, HASH, PUNCT, BACKSLASH
                   ; Note: < and > are valid characters in unwrapped form

PUNCT              = "." / "," / ";" / ":" / "!" / "?"
STRONG             = %x00-20 / %x7F-9F
                   ; whitespace, control characters, DEL, C1 controls
non-terminator     = regular-char
                   ; any character that doesn't terminate
```

**Termination rules:**

Content extends maximally until encountering:

1. **Strong terminators** (immediate, unconditional):
   - Whitespace and control characters (code points ≤ `0x20`: SPACE,
     TAB, CR, LF, all C0 controls)
   - Extended control characters (`0x7F`–`0x9F`: DEL and C1 controls)
   - Hash character (`#`)
   - _(Note: Angle brackets `<` and `>` are valid content characters in
     the unwrapped form and do not terminate the tag. They only trigger
     the wrapped form if they immediately follow the `#`.)_

2. **Punctuation** (`.`, `,`, `;`, `:`, `!`, `?`) with lookahead:
   - Terminates if followed by: strong terminator, another punctuation,
     or end-of-input
   - Continues if followed by other characters (regular characters)

This lookahead design mirrors natural language: sentence-ending
punctuation appears before whitespace or EOI, while mid-identifier
punctuation (as in `version2.0`, `foo:bar`) indicates compound
identifiers.

**Backslash escaping:**

- `\` followed by any character forms an escape pair
- The backslash is consumed; the following character appears literally
- Escape pairs always continue the hashtag (never terminate)
- Trailing `\` at end-of-input: consumed, produces nothing

**Examples:**

Punctuation with lookahead:

| Example        | Yields        | Remark                         |
| -------------- | ------------- | ------------------------------ |
| `#foo.bar`     | `foo.bar`     | period continues before 'b'    |
| `#version2.0`  | `version2.0`  | period continues before '0'    |
| `#cool!`       | `cool`        | exclamation at EOI terminates  |
| `#what?now`    | `what?now`    | question continues before 'n'  |
| `#foo:bar:baz` | `foo:bar:baz` | colons continue before letters |

With surrounding text:

| Example                    | Yields        |
| -------------------------- | ------------- |
| `Use #foo.bar here.`       | `foo.bar`     |
| `Try #version2.0 now.`     | `version2.0`  |
| `This is #cool! Right?`    | `cool`        |
| `Ask #what?now please.`    | `what?now`    |
| `See #foo:bar:baz format.` | `foo:bar:baz` |

Backslash escaping:

| Example         | Yields        | Remark                    |
| --------------- | ------------- | ------------------------- |
| `#foo\,bar`     | `foo,bar`     | comma included via escape |
| `#with\ space`  | `with space`  | space included via escape |
| `#has\<bracket` | `has<bracket` | angle bracket included    |
| `#foo\#bar`     | `foo#bar`     | hash included             |
| `#foo\\bar`     | `foo\bar`     | backslash included        |
| `#tag\.`        | `tag`         | backslash consumed at EOI |

With surrounding text:

| Example                     | Yields        |
| --------------------------- | ------------- |
| `Use #with\ space here.`    | `with space`  |
| `The #has\<bracket format.` | `has<bracket` |
| `Try #foo\#bar method.`     | `foo#bar`     |
| `See #foo\\bar usage.`      | `foo\bar`     |

Punctuation termination:

| Example     | Yields | Remark                             |
| ----------- | ------ | ---------------------------------- |
| `#tag,`     | `tag`  | comma at EOI terminates            |
| `#tag!`     | `tag`  | exclamation at EOI terminates      |
| `#foo, bar` | `foo`  | comma before space terminates      |
| `#foo. bar` | `foo`  | period before space terminates     |
| `#foo!!`    | `foo`  | first ! terminates before second ! |

Unicode support:

| Example          | Yields          |
| ---------------- | --------------- |
| `#café.français` | `café.français` |
| `#tag:Příliš`    | `tag:Příliš`    |
| `#price:€50`     | `price:€50`     |

With surrounding text:

| Example                     | Yields          |
| --------------------------- | --------------- |
| `Use #café.français style.` | `café.français` |
| `See #tag:Příliš docs.`     | `tag:Příliš`    |
| `Check #price:€50 rate.`    | `price:€50`     |

Angle brackets in unwrapped form:

| Example    | Yields    | Remark                          |
| ---------- | --------- | ------------------------------- |
| `#foo<bar` | `foo<bar` | angle bracket is regular char   |
| `#tag>a<b` | `tag>a<b` | multiple angle brackets allowed |

## Parsing Semantics

**Position Independence:** The unwrapped form's termination depends only
on local character sequences, not on absolute position or distant
context. A hashtag's interpretation remains stable under text
transformations (reflowing, concatenation, insertion, extraction).

**Leftmost Matching:** When multiple potential hashtags exist, the
parser selects the one beginning at the earliest position. At each
unescaped hash, wrapped form takes precedence if the hash is followed by
`<`.

**Escape State:** A hash character at position `i` is unescaped when
preceded by an even number of backslashes (including zero). Escape state
alternates with each consecutive backslash.

**Unicode Handling:** The parser operates on UTF-16 code units while
treating surrogate pairs atomically. A high surrogate (U+D800–U+DBFF)
followed by a low surrogate (U+DC00–U+DFFF) represents a single code
point and is processed as an indivisible unit.

**Empty Content:** Both forms reject empty content. `#<>` and a lone `#`
are invalid.

## API

### `findFirstHashtag(input: string): FirstHashtag | null`

Returns the earliest hashtag (by position) in the input string.

**Returns:**

- `{ type: 'wrapped', tag: string }` for wrapped hashtags
- `{ type: 'unwrapped', tag: string }` for unwrapped hashtags
- `null` if no valid hashtag found

The `tag` field contains unescaped content.

**Example:**

```typescript
findFirstHashtag('Check out #version2.0 today!');
// yields { type: 'unwrapped', tag: 'version2.0' }

findFirstHashtag('Use #<my tag> here');
// yields { type: 'wrapped', tag: 'my tag' }

findFirstHashtag('No tags here');
// yields null
```

### `findHashtagWrappedTags(input: string): WrappedHashtag[]`

Finds all wrapped `#<...>` tags in the input string.

**Returns:** Array of objects with:

- `start`: Starting index (at the `#`)
- `end`: Ending index (after the `>`)
- `content`: Raw (still-escaped) content

**Example:**

```typescript
findHashtagWrappedTags('See #<tag1> and #<tag2>');
// yields [
//   { start:  4, end: 11, content: 'tag1' },
//   { start: 16, end: 23, content: 'tag2' }
// ]
```

### `unescapeHashtagContent(content: string): string`

Removes escape sequences from hashtag content by processing each `\X`
pair as the literal character `X`.

**Algorithm:**

- `\X` yields `X` (backslash consumed, X included)
- `\` at end-of-input yields removed
- Other characters yield unchanged

**Example:**

```typescript
unescapeHashtagContent('foo\\#bar');  // yields `foo#bar`
unescapeHashtagContent('foo\\>bar');  // yields `foo>bar`
unescapeHashtagContent('foo\\\\bar'); // yields `foo\bar`
unescapeHashtagContent('foo\\');      // yields `foo`
```

### `hashtagForContent(content: string): string`

Synthesizes the correct hashtag syntax for given unescaped content.

**Algorithm:**

1. If content contains no whitespace or control characters:
   - Use unwrapped syntax `#content`
   - Escape `\` as `\\` and `#` as `\#`
   - **Edge Case:** If the content starts with `<`, escape it as `\<` to
     prevent the parser from interpreting it as a wrapped tag.
2. Otherwise:
   - Use wrapped syntax `#<content>`
   - Escape `\` as `\\`, `<` as `\<`, and `>` as `\>`

**Example:**

```typescript
hashtagForContent('simple');  // yields `#simple`
hashtagForContent('foo#bar'); // yields `#foo\\#bar`
hashtagForContent('my tag');  // yields `#<my tag>`
hashtagForContent('a<b>c');   // yields `#a<b>c`
hashtagForContent('<start');  // yields `#\<start>`
```

**Roundtrip Property:** For any content `c`:
`parse(hashtagForContent(c))` recovers `c`.

### `unwrappedTagRegex`

Regex-compatible object exposing `exec()` for finding the first
unwrapped hashtag.

**Returns:** Match array with:

- `[0]`: Full match including `#`
- `[1]`: Raw (still-escaped) content
- `index`: Starting position

**Example:**

```typescript
const match = unwrappedTagRegex.exec('text #foo bar');
// match[0] yields `#foo`
// match[1] yields `foo`
// match.index yields 5
```

## Usage Examples

```typescript
import { findFirstHashtag, hashtagForContent } from './hashtag.ts';

// Find hashtags in text
const result = findFirstHashtag('Check out #version2.0 today!');
console.log(result?.tag); // `version2.0`

// Handle punctuation
const emphatic = findFirstHashtag('This is #awesome! Right?');
console.log(emphatic?.tag); // `awesome`

// Escape for synthesis
const tag = hashtagForContent('foo.bar');
console.log(tag); // `#foo.bar`

const tagWithSpace = hashtagForContent('my tag');
console.log(tagWithSpace); // `#<my tag>`

// Escaped characters
const escaped = findFirstHashtag('#foo\\#bar');
console.log(escaped?.tag); // `foo#bar`
```

## Testing

```bash
deno test
```

## Design Principles

1. Hashtag interpretation is stable under text transformations
2. Mid-identifier punctuation (`.`, `:`) is allowed; sentence
   punctuation terminates
3. Backslash escaping provides precise control when needed
4. Full Unicode support with proper surrogate pair handling
5. Clear distinction between wrapped and unwrapped forms
6. Unique parse for any input via leftmost greedy matching

## License

MIT
