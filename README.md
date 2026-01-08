# ABOUT

This library enables the identification, parsing, and generation of
hashtags within text. It defines a syntax that supports character
escaping, delimiters, and Unicode processing.

# DESCRIPTION

Two distinct hashtag formats are recognized: _unwrapped_ and _wrapped_.

## Unwrapped Format

The unwrapped format begins with a number sign (`#`) followed
immediately by properly encoded Unicode text (including _emojis_ and
_surrogate pairs_), terminating at _spaces_ or specific _punctuation
characters_.

Punctuation behavior depends on a spacing strategy. The scanner
distinguishes between _trailing_ punctuation (typically followed by a
space) and _none_ punctuation (commonly used without a trailing space).
Some systems also use "surrounding" punctuation (space before and
after), but it does not apply here because whitespace always breaks
unwrapped hashtags (unless escaped).

With _trailing_ punctuation, the idea is: if the scanner reaches one of
these punctuation characters (and it is not escaped), and the next
character is whitespace (or end-of-input), then the punctuation is
treated as _closing punctuation_: the hashtag ends _before_ the
punctuation (the punctuation is not part of the tag), but if a
non-whitespace character follows, the punctuation may remain inside the
hashtag as a continuation (e.g., `#v1.0`).

With _none_ punctuation, the idea is: you do not use "is the next
character whitespace?" as a signal, because in those writing systems the
punctuation is commonly written without a following space. So the
scanner treats the punctuation as closing under the same continuation
rule but without assuming a trailing space.

A reversed solidus (`\`) allows the inclusion of spaces, punctuation
characters, a literal less-than sign (`<`), and itself within an
unwrapped hashtag. For example, `#this\ is\ example` yields
`this is example`. Since a less-than sign following the number sign
(`#<`) initiates a wrapped hashtag, a sequence like `#<example` is not a
valid hashtag if the closing bracket is missing (it produces no match);
to include a literal less-than sign at the start, it must be escaped
(`#\<example`). In case of unwrapped hashtag format a resulting hashtag
text must contain at least one _valid_ character, so number sign
followed by space (`# `) or number sign followed by a punctuation
character and space (e.g., `#. `) are not valid unwrapped hashtags.

## Wrapped Format

The wrapped format encloses hashtag text between a less-than sign (`<`)
and a greater-than sign (`>`). This format allows spaces and special
characters within the hashtag. The less-than sign is valid without
escaping inside the brackets. The greater-than sign and the reversed
solidus must be preceded by a reversed solidus to be interpreted as
text. The less-than sign may be escaped (`\<`) and is treated as a
literal `<`; `createHashtag()` will escape `<` when producing wrapped
hashtags. Therefore, `#<<example>` is valid and equivalent to
`#<\<example>`, both producing the text `<example`. Also in case of
wrapped hashtag format a resulting hashtag text must contain at least
one _valid_ character, so `#<>` is not a valid hashtag.

Wrapped hashtags may span multiple lines. Line breaks (`\n`, `\r`, or
`\r\n`) in wrapped hashtags are normalized to a single space character,
and any horizontal whitespace immediately following the line break is
ignored.

# SPECIFICATION

## Normative Grammar

This ABNF grammar is structural and normative and **MUST** be
implemented together with the normative semantic rules (see APPENDIX B).

```abnf
hashtag                  = wrapped-hashtag
                         / unwrapped-hashtag

unwrapped-hashtag        = unescaped-hash unwrapped-text
                         ; see APPENDIX B.4

unwrapped-text           = 1*unwrapped-char

unwrapped-char           = escape-pair
                         / punctuation-continuation
                         / unwrapped-regular-char

escape-pair              = backslash non-linebreak
                         ; a backslash followed by a line break terminates the hashtag.

punctuation-continuation = punctuation-char non-terminator
                         ; see APPENDIX B.3

unwrapped-regular-char   = non-terminator

non-terminator           = scalar
                         - strong-terminator
                         - hash-sign
                         - backslash
                         - punctuation-char

wrapped-hashtag          = unescaped-hash lt-sign wrapped-text gt-sign
                         ; see APPENDIX B.4

wrapped-text             = 1*wrapped-char

wrapped-char             = escape-any
                         / wrapped-regular-char

escape-any               = backslash scalar

wrapped-regular-char     = scalar
                         - gt-sign
                         - backslash

punctuation-char         = punctuation-trailing ; see APPENDIX A.2
                         / punctuation-none     ; ditto
```

## Normative Semantic Rules

See APPENDIX B.

# IMPLEMENTATION

The parser functions as a deterministic linear-time scanner. It
traverses the input in a single pass, utilizing a finite state machine
(FSM) to handle delimiter detection and Unicode surrogate pairs. The
scanner state exhibits a time complexity of _O(n)_ and auxiliary space
complexity of _O(1)_. Returned values allocate proportionally to the
number and size of matches.

The syntax exceeds the capabilities of standard regular expressions.
Determining if a delimiter is escaped requires tracking the parity (even
or odd count) of preceding backslashes, a task finite automata cannot
perform. This parity check is used to determine whether a `#` is
escaped; individual escape sequences apply only to the immediately
following character (they do not "span" beyond that character).
Furthermore, the grammar requires conditional lookahead to validate
punctuation characters within unwrapped tags.

Unwrapped hashtags treat certain punctuation characters as closing only
when the punctuation is encountered (and is not escaped) and the next
character is whitespace (or EOI); this matches common spacing rules for
Latin, Cyrillic, Greek, Hebrew, Indic scripts, Arabic, Persian, Urdu,
Armenian, Ethiopic, and Georgian (e.g., `#tag, ` yields `tag`, but
`#v1.0` keeps the `.` because it is followed by `0`). For scripts where
punctuation is commonly written without a trailing space (Chinese,
Japanese, Korean and Tibetan), the parser must not rely on trailing
whitespace; those punctuation characters are treated as closing under
the same continuation rule without assuming a trailing space.

# INTERFACE

## `PunctuationStrategyCode`

```typescript
type PunctuationStrategyCode = 0 | 1;
```

Controls how a punctuation code point behaves in unwrapped hashtags:

- `0` = trailing
- `1` = none

## `PunctuationStrategyCodeConfig`

```typescript
type PunctuationStrategyCodeConfig = Record<number, PunctuationStrategyCode>;
```

## `punctuationStrategyCode`

```typescript
const punctuationStrategyCode: PunctuationStrategyCodeConfig;
```

## `HashtagType`

```typescript
type HashtagType = 'unwrapped' | 'wrapped';
```

## `HashtagMatch`

```typescript
type HashtagMatch = {
  type: HashtagType;
  start: number;
  end: number;
  raw: string;
  rawText: string;
  text: string;
};
```

Represents a parsed hashtag in a source string.

- `start` and `end` are UTF-16 indices, with `end` being exclusive.
- `raw` is the full matched token, including the prefix and wrappers.
- `rawText` is the escaped payload (no wrappers).
- `text` is the unescaped payload. For wrapped hashtags, line breaks are
  normalized to a single space and any following horizontal whitespace
  is ignored.

Malformed surrogate code units are rejected inside hashtags.

## `hashtagPattern`

```typescript
type HashtagPatternOptions = {
  type?: HashtagType | 'any';
  global?: boolean;
  sticky?: boolean;
  capture?: 'rawText' | 'text';
};

type HashtagPattern = {
  source: string;
  flags: string;
  lastIndex: number;

  exec(input: string): RegExpExecArray | null;
  test(input: string): boolean;
  reset(): void;

  execMatch(input: string): HashtagMatch | null;
  matchAll(input: string): IterableIterator<RegExpExecArray>;
  matchAllMatches(input: string): IterableIterator<HashtagMatch>;
};

function hashtagPattern(options?: HashtagPatternOptions): HashtagPattern;
```

Creates a RegExp-like matcher.

- `global` defaults to `false`, matching JavaScript `RegExp` behavior.
- If `type` is `'any'`, `exec()` returns `[full, payload, type]`.
- If `type` is `'wrapped'` or `'unwrapped'`, `exec()` returns
  `[full, payload]`.
- `payload` is `rawText` by default; set `capture: 'text'` to capture
  the unescaped text instead.
- If `sticky` is `true`, a match is accepted only at `lastIndex`.
- `lastIndex` is coerced to a non-negative integer. Values greater than
  the input length behave like JavaScript `RegExp`: `exec()` returns
  `null` and, if `global` or `sticky` is enabled, resets `lastIndex` to
  `0`.

If `global` or `sticky` is enabled, a failed `exec()` resets `lastIndex`
to `0`.

## Built-in patterns

```typescript
const hashtag: HashtagPattern;
const wrappedHashtag: HashtagPattern;
const unwrappedHashtag: HashtagPattern;
```

These are equivalent to:

```typescript
hashtagPattern({ type: 'any' });
hashtagPattern({ type: 'wrapped' });
hashtagPattern({ type: 'unwrapped' });
```

## Typed helpers

```typescript
type FindOptions = {
  type?: HashtagType | 'any';
  fromIndex?: number;
};

function findFirstHashtag(
  input: string,
  options?: FindOptions,
): HashtagMatch | null;

function findAllHashtags(
  input: string,
  options?: FindOptions,
): HashtagMatch[];

function iterateHashtags(
  input: string,
  options?: FindOptions,
): IterableIterator<HashtagMatch>;
```

These helpers operate as a thin layer on top of `hashtagPattern` with
`global: true` and use `fromIndex` to initialize the scan position.
`fromIndex` is coerced to a non-negative integer.

## `createHashtag`

```typescript
function createHashtag(text: string): string
```

Generates a hashtag string from the provided text, automatically
selecting the wrapped or unwrapped format based on the content. If the
input contains malformed surrogate code units, an empty string is
returned.

```typescript
createHashtag("hello world");
createHashtag("simple");
```

## `unescapeHashtagText`

```typescript
function unescapeHashtagText(text: string): string
```

Removes escape backslashes from a raw hashtag payload, returning the
clean text content.

```typescript
unescapeHashtagText("foo\\ bar");
```

# APPENDIX A

## A.1 Core Character Classes

```abnf
hash-sign         = "#"
backslash         = "\"
lt-sign           = "<"
gt-sign           = ">"

unescaped-hash    = hash-sign

linebreak         = CR
                  / LF

h-wsp             = SP
                  / HTAB

ascii-ctl         = CTL

c1-ctl            = %x80-9F

strong-terminator = ascii-ctl
                  / SP
                  / c1-ctl

non-linebreak     = scalar - linebreak

scalar            = %x00-D7FF
                  / %xE000-10FFFF
                  ; Unicode scalar values (surrogates excluded)
```

## A.2 Punctuation Character Classes

Punctuation treated as closing only when followed by
`strong-terminator`, `punctuation-char`, or `end-of-input`; otherwise it
may continue.

```abnf
punctuation-trailing = "."    ; FULL STOP
                     / ","    ; COMMA
                     / "!"    ; EXCLAMATION MARK
                     / "?"    ; QUESTION MARK
                     / ";"    ; SEMICOLON
                     / ":"    ; COLON
                     / %x00B7 ; MIDDLE DOT
                     / %x0964 ; DEVANAGARI DANDA
                     / %x0965 ; DEVANAGARI DOUBLE DANDA
                     / %x060C ; ARABIC COMMA
                     / %x061B ; ARABIC SEMICOLON
                     / %x061F ; ARABIC QUESTION MARK
                     / %x06D4 ; ARABIC FULL STOP
                     / %x0589 ; ARMENIAN FULL STOP
                     / %x055B ; ARMENIAN MODIFIER LETTER LEFT HALF RING
                     / %x055C ; ARMENIAN EXCLAMATION MARK
                     / %x055E ; ARMENIAN QUESTION MARK
                     / %x1361 ; ETHIOPIC WORDSPACE
                     / %x1362 ; ETHIOPIC FULL STOP
                     / %x1363 ; ETHIOPIC COMMA
                     / %x1364 ; ETHIOPIC SEMICOLON
                     / %x1365 ; ETHIOPIC COLON
                     / %x10FB ; GEORGIAN PARAGRAPH SEPARATOR
```

Punctuation treated as closing without relying on trailing whitespace.

```abnf
punctuation-none = %x0F0D ; TIBETAN MARK SHAD
                 / %x0F0E ; TIBETAN MARK NYIS SHAD
                 / %x3002 ; IDEOGRAPHIC FULL STOP
                 / %x3001 ; IDEOGRAPHIC COMMA
                 / %xFF0C ; FULLWIDTH COMMA
                 / %xFF1F ; FULLWIDTH QUESTION MARK
                 / %xFF01 ; FULLWIDTH EXCLAMATION MARK
                 / %xFF1B ; FULLWIDTH SEMICOLON
                 / %xFF1A ; FULLWIDTH COLON
                 / %x30FB ; KATAKANA MIDDLE DOT
                 / %xFF0E ; FULLWIDTH FULL STOP
```

# APPENDIX B

Normative semantic rules that are normative and **MUST** be applied in
addition to the normative grammar.

## B.1 Hash Parity Rule

A `#` begins a hashtag only if it is preceded by an even number of `\`
code points immediately adjacent to it (including zero).

## B.2 Wrapped Closing Rule

In wrapped hashtags, an unescaped `>` closes the wrapped text. An
escaped `\>` is literal payload.

## B.3 Punctuation Lookahead Rule

For `punctuation-trailing` code points, the punctuation is treated as
closing iff the next code point is a `strong-terminator` or another
`punctuation-char` or end-of-input. Otherwise the punctuation may remain
inside the hashtag as a continuation.

For `punctuation-none` code points, the punctuation is always treated as
closing.

## B.4 Format Disambiguation Rule

After an `unescaped-hash`, if the next code point is an unescaped
`lt-sign`, the hashtag **MUST** be parsed as a wrapped hashtag;
otherwise it **MUST** be parsed as an unwrapped hashtag.

A missing closing `gt-sign` makes the wrapped hashtag invalid (no
match).
