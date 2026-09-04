# TSIfDef Specification

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

This directory defines the portable behavior of TSIfDef. It is independent of
the CLI, editor extension, language service, and any particular compiler
implementation.

An implementation can use any internal architecture, but it should produce the
same observable result for the fixtures in this directory:

- the same directives;
- the same active and inactive lines;
- the same projected source;
- the same diagnostic codes and ranges;
- the same Profile validation result.

Diagnostic wording is implementation-defined.

## Directory layout

```text
spec/
├─ README.md
├─ README.zh-CN.md
├─ schema/
│  ├─ case.schema.json
│  └─ profile-case.schema.json
├─ cases/
│  └─ *.json
└─ profiles/
   └─ *.json
```

- `schema/` describes the fixture formats.
- `cases/` covers directive scanning, expression evaluation, diagnostics, and
  source projection.
- `profiles/` covers Profile parsing and validation.

The fixtures are test data. Runtime code does not need to load this directory.

## Profile

A Profile is a JSON array of macro names:

```json
[
  "UNITY_EDITOR",
  "UNITY_EDITOR_WIN"
]
```

Rules:

- the top-level value must be an array;
- every item must be a string matching
  `[A-Za-z_][A-Za-z0-9_]*`;
- duplicate names are allowed and are treated as one definition;
- a name present in the Profile is defined;
- a name absent from the Profile is not defined;
- `defined(NAME)` checks whether `NAME` is present.

A UTF-8 BOM before the JSON document is allowed.

## Directives

A directive starts at the first non-whitespace character of a physical line:

```text
#if EXPRESSION
#elif EXPRESSION
#else
#endif
#error MESSAGE
```

The following characters are allowed before `#`:

- space;
- horizontal Tab;
- vertical Tab;
- form feed;
- BOM.

`#if` and `#elif` evaluate an expression. `#else` and `#endif` do not accept an
argument. An active `#error` produces an `active-error` diagnostic; an inactive
`#error` does not.

Unknown directive-looking lines produce an `unknown-directive` diagnostic and
are projected like directive lines.

Directive-like text inside strings, the text portion of template strings,
comments, or regular-expression literals is ordinary source text. The
`${...}` portion of a template string is scanned as source code.

TypeScript private fields, private methods, and private-brand checks are not
directives:

```ts
class Example {
  #value = 1;
  #method() {}

  hasValue(object: object): boolean {
    return #value in object;
  }
}
```

## Expressions

The expression grammar is:

```text
EXPRESSION :=
    NAME
  | defined(NAME)
  | !EXPRESSION
  | EXPRESSION && EXPRESSION
  | EXPRESSION || EXPRESSION
  | (EXPRESSION)
```

Operator precedence, from highest to lowest:

```text
!
&&
||
```

A bare macro name evaluates to `true` when it is defined and `false` when it is
not defined.

## Conditional blocks

Conditional blocks may be nested.

For an `#if` / `#elif` / `#else` chain, only the first matching branch is
active. A branch inside an inactive parent remains inactive.

The following structural errors have stable diagnostic codes:

- `unmatched-elif`;
- `unmatched-else`;
- `unmatched-endif`;
- `elif-after-else`;
- `duplicate-else`;
- `unterminated-if`.

## Projection

Directive lines and inactive source ranges are replaced with whitespace before
the projected source is parsed.

Projection must preserve:

- UTF-8 byte length;
- UTF-16 code-unit length;
- the position of every line ending;
- the original file path.

Use these replacements for non-line-ending characters:

| Original UTF-8 width | Original UTF-16 width | Replacement |
|---:|---:|---|
| 1 byte | 1 code unit | `U+0020` |
| 2 bytes | 1 code unit | `U+00A0` |
| 3 bytes | 1 code unit | `U+3000` |
| 4 bytes | 2 code units | `U+00A0 U+00A0` |

`\r` and `\n` are preserved unchanged.

These rules keep byte-based compiler offsets and UTF-16 editor positions
aligned with the original source.

## Source fixtures

Each `cases/*.json` file is one independent conformance case:

```json
{
  "version": 1,
  "name": "basic-if-else",
  "lineEnding": "lf",
  "trailingNewline": true,
  "bom": false,
  "defines": ["EDITOR"],
  "sourceLines": [
    "#if EDITOR",
    "const value = 1;",
    "#endif"
  ],
  "lineStates": [
    "directive",
    "active",
    "directive"
  ],
  "directives": [
    {
      "kind": "if",
      "line": 0,
      "argument": "EDITOR"
    },
    {
      "kind": "endif",
      "line": 2,
      "argument": ""
    }
  ],
  "diagnostics": []
}
```

`lineStates` has three values:

- `active`: the projected line is identical to the original line;
- `inactive`: the line is projected to whitespace;
- `directive`: the line is a directive and is projected to whitespace.

Diagnostic positions are zero-based UTF-16 line and character positions:

```json
{
  "code": "active-error",
  "start": {
    "line": 1,
    "character": 7
  },
  "end": {
    "line": 1,
    "character": 35
  }
}
```

The expected diagnostic message is intentionally not stored. Implementations
may use wording that matches their host environment.

## Profile fixtures

Each `profiles/*.json` file contains the raw Profile text and exactly one
expected result:

- `expectedDefines` for a valid Profile;
- `expectedError` for an invalid Profile.

The stable Profile error codes are:

- `config-read-failed`;
- `config-invalid-json`;
- `config-invalid-shape`;
- `config-invalid-name`.

`config-read-failed` is part of the runtime contract but is not represented by
a fixture that embeds file-system behavior.

## Running conformance tests

A conformance runner should:

1. validate the fixture version;
2. rebuild the source using `sourceLines`, `lineEnding`, `trailingNewline`, and
   `bom`;
3. evaluate it using `defines`;
4. compare the projected source, directives, line states, and diagnostics;
5. verify both UTF-8 and UTF-16 length invariants;
6. run all Profile fixtures through the implementation's Profile parser.

Fixture format version `1` is the current public contract. A runner should not
silently interpret an unsupported version.
