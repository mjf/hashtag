# Hashtag Parser

An implementation of a dual-form hashtag syntax with
position-independent parsing, intelligent punctuation handling, and dual
escaping mechanisms.

The beauty of the syntax is its simplicity and predictability.


## Formal Syntax Specification

This parser recognizes two hashtag forms within text: wrapped hashtags
delimited by angle brackets, and unwrapped hashtags with greedy matching
and explicit termination through character doubling or escaping.


### Wrapped Hashtag Form

Syntax: `#<content>`

A wrapped hashtag begins with an unescaped hash followed immediately by
a left angle bracket. The hash is unescaped when preceded by an even
number of backslashes (including zero). The content extends until the
first unescaped right angle bracket.


#### Escape Rules within Wrapped Content

* Backslash `\` followed by any character forms an escape pair

* The right angle bracket `>` must be escaped as `\>` to appear
  literally

* The backslash itself must be escaped as `\\` to appear literally

* The left angle bracket `<` requires no escaping (has no delimiter
  role)

* All other characters may appear literally without escaping

Content must be non-empty. The sequence `#<>` is rejected.


#### Examples with End-of-input

```
#<simple>           -> "simple"
#<with\>bracket>    -> "with>bracket"
#<back\\slash>      -> "back\slash"
#<<nested>          -> "<nested"
```


#### Examples with Surrounding Text

```
Use #<my tag> here.     -> "my tag"
The #<a\>b> format.     -> "a>b"
See #<<special>> data.  -> "<special"
```


### Unwrapped Hashtag Form

Syntax: `#content`

An unwrapped hashtag begins with an unescaped hash not followed by
a left angle bracket. The content extends maximally according to
character classification and lookahead rules.


#### Termination Conditions

The fundamental design principle is position independence: a hashtag's
interpretation must remain stable under text transformations (reflowing,
concatenation, insertion, extraction). This requires that termination
depends only on the local character sequence, not on distant context
like end-of-input or following whitespace.


##### Strong Terminators

* All whitespace and control characters: code points `<= 0x20` (includes
  `SP`, `HT`, `CR`, `LF`, and all C0 controls)

* Extended control characters: code points `0x7F` through `0x9F`

* Left and right angle brackets: `<` and `>` (prevent ambiguity with
  wrapped form)


##### Punctuation Characters

The characters `.`, `,`, `;`, `:`, `!` and `?` use lookahead to
determine termination:

* Single punctuation followed by strong terminator: terminates

* Single punctuation followed by another punctuation: terminates

* Single punctuation followed by angle bracket: terminates

* Single punctuation followed by end-of-input: terminates

* Single punctuation followed by other characters: included in content,
  continues

This design mirrors natural text where sentence punctuation is followed
by whitespace or end of input, while mid-word punctuation indicates
compound identifiers.


#### Doubling as Termination

When a punctuation character appears doubled, the first occurrence is
included in the hashtag content and the second acts as an explicit
termination marker. This provides a stable, position-independent way to
end hashtags with punctuation.

Character doubling as an escape mechanism creates emphasis AND
termination, which mirrors how people naturally write emphatic text.
This makes it intuitively discoverable for non-technical users.

Logical reasoning:

1. Single punctuation is context-dependent: `#foo.bar` includes the
   period because `b` is not a terminator

2. This remains stable when context changes: `#foo.bar` produces
   "foo.bar" whether at end-of-input, before space, or in middle of text

3. Doubling provides explicit termination: `#foo..bar` terminates at the
   second period, producing "foo."

4. Doubling is also stable: `#foo..` produces "foo." regardless of
   context

Historical note: Character doubling as an escape mechanism has deep
roots in computing history. FORTRAN (1950s) used `''` to represent
a single quote within string literals. SQL (since 1970s) continues
this tradition with `''` for quotes in string values. This pattern is
familiar to database developers and provides an alternative to backslash
escaping that doesn't require shifting mental models between different
syntactic contexts.


#### Backslash Escaping

Backslash provides an alternative explicit termination and inclusion
mechanism familiar to programmers and technical users.

* Backslash followed by any character forms an escape pair
* The backslash is consumed during unescaping
* The following character is included literally in content
* An escape pair always continues the hashtag (never terminates)


##### Escape Pair Handling

* `\` + punctuation: includes the punctuation literally, continues
* `\` + whitespace: includes the whitespace literally, continues
* `\` + `\`: includes a single backslash literally, continues
* `\` + `#`: includes hash literally, continues
* `\` at end-of-input: consumed, produces nothing, terminates


#### Interaction Between Doubling and Escaping

When backslash escaping and character doubling interact, the parser
processes left-to-right with escape pairs taking precedence:

```
#foo\..     -> "foo."  (includes period, next terminates)
#foo.\.     -> "foo.." (includes period, escape pair '\.' includes period)
#foo\\..    -> "foo\." (escape pair '\\' includes backslash, '..' is doubling)
#foo\...    -> "foo.." (escape pair '\.' includes period, '..' is doubling)
#foo..\.    -> "foo."  (doubling '..' terminates at second dot)
```

The key principle: Backslash always binds to the immediately following
character to form an escape pair. After consuming an escape pair, normal
rules apply to subsequent characters.


### Comprehensive Examples


#### Punctuation with Lookahead

At end-of-input:

```
#foo.bar      -> "foo.bar"
#version2.0   -> "version2.0"
#cool!        -> "cool"
#what?now     -> "what?now"
#foo:bar:baz  -> "foo:bar:baz"
```

With surrounding text:

```
Use #foo.bar here.        -> "foo.bar"
Try #version2.0 now.      -> "version2.0"
This is #cool! Right?     -> "cool"
Ask #what?now please.     -> "what?now"
See #foo:bar:baz format.  -> "foo:bar:baz"
```


#### Doubling for Explicit Termination

At end-of-input:

```
#coding..   -> "coding."
#awesome!!  -> "awesome!"
#really??   -> "really?"
#item,,     -> "item,"
```

With surrounding text:

```
I like #coding.. It works!  -> "coding."
This is #awesome!! Right?   -> "awesome!"
You mean #really?? Wow.     -> "really?"
Add #item,, then next.      -> "item,"
```


#### Backslash Escaping for Termination

At end-of-input:

```
#coding\.  -> "coding"
#tag\      -> "tag"
#foo\,bar  -> "foo,bar"
```

With surrounding text:

```
I like #coding\. It works!  -> "coding"
Use #tag\ here.             -> "tag"
Try #foo\,bar method.       -> "foo,bar"
```


#### Backslash for Including Normally-terminating Characters

At end-of-input:

```
#with\ space   -> "with space"
#has\<bracket  -> "has<bracket"
#foo\#bar      -> "foo#bar"
```

With surrounding text:

```
Use #with\ space here.     -> "with space"
The #has\<bracket format.  -> "has<bracket"
Try #foo\#bar method.      -> "foo#bar"
```


#### Combined Escaping and Doubling

At end-of-input:

```
#foo\..   -> "foo."
#foo.\.   -> "foo.."
#foo\\..  -> "foo\."
```

With surrounding text:

```
Use #foo\.. here.     -> "foo."
Try #foo.\. method.   -> "foo.."
See #foo\\.. format.  -> "foo\."
```


#### Unicode Support

At end-of-input:

```
#café.français  -> "café.français"
#foo:🎉         -> "foo:🎉"
#tag:日本語     -> "tag:日本語"
#price:€50      -> "price:€50"
```

With surrounding text:

```
Use #café.français style.  -> "café.français"
This is #foo:🎉 time!      -> "foo:🎉"
See #tag:日本語 docs.      -> "tag:日本語"
Check #price:€50 rate.     -> "price:€50"
```


## Unicode Handling

The parser operates on UTF-16 code units while treating surrogate pairs
as atomic units. A high surrogate (`U+D800` through `U+DBFF`) followed
by a low surrogate (`U+DC00` through `U+DFFF`) represents a single code
point and is processed atomically during content scanning and escape
pair recognition.


## Parsing Semantics

The parser uses leftmost matching: when multiple potential hashtags
exist, the one beginning at the earliest position is selected. At each
unescaped hash position, wrapped form takes precedence (checked first)
when the hash is followed by a left angle bracket. Empty content is
rejected in both forms.

The lookahead-based punctuation handling with explicit termination
(doubling or escaping) ensures stability: a hashtag's interpretation
never changes based on its position in text or what follows at
a distance. This is critical for text transformations like reflowing,
concatenation, and extraction.


## API


### `findFirstHashtag(input: string): FirstHashtag | null`

Returns the earliest hashtag (by index) in the input string.

Returns an object with:

* `type`: `"wrapped"` or `"unwrapped"`

* `tag`: The unescaped hashtag content

Returns `null` if no valid hashtag is found.


### `findHashtagWrappedTags(input: string): WrappedHashtag[]`

Finds all wrapped `#<...>` tags in the input string.

Returns an array of objects with:

* `start`: Starting index of the tag (at the `#`)

* `end`: Ending index (after the `>`)

* `content`: The raw (still-escaped) content


### `unescapeHashtagContent(content: string): string`

Removes escape sequences from hashtag content. Handles both wrapped and
unwrapped escaping rules by removing one backslash from each `\X` pair.


### `hashtagForContent(content: string): string`

Returns the correct hashtag syntax for given unescaped content.

* Uses unwrapped syntax if possible (no strong terminators or angle
  brackets)

* Escapes `\` and `#` in unwrapped form

* Escapes consecutive identical punctuation to prevent doubling
  interpretation

* Uses wrapped `#<...>` syntax otherwise, escaping `\` and `>`


### `unwrappedTagRegex`

A regex-like object exposing `exec()` for compatibility with legacy
code. Finds the first unwrapped hashtag and returns a match array with:

* `[0]`: The full match including `#`

* `[1]`: The raw content (still-escaped)

* `index`: The starting position
