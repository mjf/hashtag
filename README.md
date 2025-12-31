# ABOUT

This library enables the identification, parsing, and generation of
hashtags within text. It defines a syntax that supports character
escaping, delimiters, and Unicode processing.

# DESCRIPTION

Two distinct hashtag formats are recognized: _unwrapped_ and _wrapped_.
The unwrapped format begins with a number sign (`#`) followed
immediately by properly encoded Unicode text (including _emojis_ and
_surrogate pairs_), terminating at _spaces_ or specific _punctuation
characters_: full stop (`.`), comma (`,`), semicolon (`;`), colon (`:`),
exclamation mark (`!`), and question mark (`?`). Punctuation characters
are treated as part of the hashtag only if they are followed by a
character that is neither a space nor another punctuation character.
Therefore, `#v1.0` is a valid hashtag producing `v1.0`.

A reversed solidus (`\`) allows the inclusion of spaces, punctuation
characters, a literal less-than sign (`<`), and itself within an
unwrapped hashtag. For example, `#this\ is\ example` yields
`this is example`. Since a less-than sign following the number sign
(`#<`) initiates a wrapped hashtag, a sequence like `#<example` results
in an error if the closing bracket is missing; to include a literal
less-than sign at the start, it must be escaped (`#\<example`). In case
of unwrapped hashtag format a resulting hashtag text must contain at
least one _valid_ character, so number sign followed by space (`# `) or
number sign followed by a punctuation character and space (e.g., `#. `)
are not valid unwrapped hashtags.

The wrapped format encloses hashtag text between a less-than sign (`<`)
and a greater-than sign (`>`). This format allows spaces and special
characters within the hashtag. The less-than sign is valid without
escaping inside the brackets, but the greater-than sign and the reversed
solidus must be preceded by a reversed solidus to be interpreted as
text. Therefore, `#<<example>` is valid and equivalent to
`#<\<example>`, both producing the text `<example`. Also in case of
wrapped hashtag format a resulting hashtag text must contain at least
one _valid_ character, so `#<>` is not a valid hashtag.

# GRAMMAR

```abnf
unwrapped-hashtag  = unescaped-hash unwrapped-text
                   ; hash must NOT be followed by an unescaped "<"

unwrapped-text     = 1*unwrapped-char

unwrapped-char     = escape-pair / punct-continuation / regular-char

escape-pair        = BACKSLASH ANY
                   ; allows spaces, punctuation, HASH, BACKSLASH, "<"
                   ; always continues, never terminates

punct-continuation = PUNCT non-terminator
                   ; punctuation followed by continuing character

regular-char       = %x22 / %x24-2B / %x2D / %x2F-39 / %x3D
                   / %x3C-3E / %x40-10FFFF
                   ; excludes: STRONG, HASH, PUNCT, BACKSLASH
                   ; Note: < and > are valid characters in unwrapped form

non-terminator     = regular-char
                   ; any character that doesn't terminate
```

```abnf
wrapped-hashtag = unescaped-hash "<" wrapped-text ">"

wrapped-text    = 1*wrapped-char

wrapped-char    = escape-pair / regular-char

escape-pair     = BACKSLASH ANY
                ; specifically allows escaping ">" and BACKSLASH
                ; < does not need to be escaped

regular-char    = %x00-3D / %x3F-5B / %x5D-10FFFF
                ; any character except ">" and BACKSLASH
```

```abnf
; Shared Core Definitions
unescaped-hash = "#"
               ; preceded by even number of backslashes (including zero)

STRONG         = %x00-20 / %x7F-9F
               ; whitespace, control characters, DEL, C1 controls

PUNCT          = "." / "," / ";" / ":" / "!" / "?"

HASH           = "#"

BACKSLASH      = "\"

ANY            = %x00-10FFFF
```

# IMPLEMENTATION

The parser functions as a deterministic linear-time scanner. It
traverses the input in a single pass, utilizing a _finite state machine_
(FSM) to handle delimiter detection and Unicode surrogate pairs. The
algorithm exhibits a time complexity of _O(n)_ and auxiliary space
complexity of _O(1)_.

The syntax exceeds the capabilities of standard regular expressions.
Determining if a delimiter is escaped requires tracking the parity (even
or odd count) of preceding backslashes, a task finite automata cannot
perform. Furthermore, the grammar requires conditional lookahead to
validate punctuation characters within unwrapped tags.

# API

## `Hashtag`

```typescript
type Hashtag =
  | { type: HashtagType.Wrapped; text: string }
  | { type: HashtagType.Unwrapped; text: string };
```

Represents a parsed hashtag containing the format type and the processed
text content.

```typescript
const tag: Hashtag = { type: HashtagType.Unwrapped, text: "example" };
```

## `HashtagType`

```typescript
enum HashtagType {
  Unwrapped = 'unwrapped',
  Wrapped   = 'wrapped',
}
```

Enumeration distinguishing between the two supported hashtag formats.

```typescript
const type = HashtagType.Wrapped;
```

## `WrappedHashtag`

```typescript
type WrappedHashtag = {
  start: number;
  end: number;
  text: string;
};
```

Represents a wrapped hashtag found within a source string, including the
start and end indices of the raw match and the processed text content.

```typescript
const match: WrappedHashtag = { start: 0, end: 9, text: "example" };
```

## `createHashtag`

```typescript
function createHashtag(text: string): string
```

Generates a hashtag string from the provided text, automatically
selecting the wrapped or unwrapped format based on the content.

```typescript
createHashtag("hello world");
createHashtag("simple");
```

## `findHashtag`

```typescript
function findHashtag(input: string): Hashtag | null
```

Parses the input string and returns the first valid hashtag found, or
`null` if none exists.

```typescript
findHashtag("Check #example.");
```

## `findWrappedHashtags`

```typescript
function findWrappedHashtags(input: string): WrappedHashtag[]
```

Scans the input string and returns an array of all wrapped hashtags,
including their positional indices in the original text.

```typescript
findWrappedHashtags("#<one> and #<two>");
```

## `unescapeHashtagText`

```typescript
function unescapeHashtagText(text: string): string
```

Removes escape backslashes from a raw hashtag string, returning the
clean text content.

```typescript
unescapeHashtagText("foo\\ bar");
```

## `hashtagRegExp`

```typescript
const hashtagRegExp: {
  lastIndex: number;
  exec(input: string): Array<string> & { index?: number } | null;
  reset(): void;
}
```

A regular expression-like object that matches both wrapped and unwrapped
hashtags, providing `exec`, `lastIndex`, and `reset` methods.

```typescript
const match = hashtagRegExp.exec("Text #example");
```

## `unwrappedHashtagRegExp`

```typescript
const unwrappedHashtagRegExp: {
  lastIndex: number;
  exec(input: string): Array<string> & { index?: number } | null;
  reset(): void;
}
```

A regular expression-like object that matches only unwrapped hashtags.

```typescript
const match = unwrappedHashtagRegExp.exec("This is #tag");
```

## `wrappedHashtagRegExp`

```typescript
const wrappedHashtagRegExp: {
  lastIndex: number;
  exec(input: string): Array<string> & { index?: number } | null;
  reset(): void;
}
```

A regular expression-like object that matches only wrapped hashtags.

```typescript
const match = wrappedHashtagRegExp.exec("This is #<tag>");
```

# LICENSE

MIT
