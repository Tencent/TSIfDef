# TSIfDef 规范

Language file: [`README.md`](./README.md)

这个目录定义 TSIfDef 的可移植行为。它不依赖 CLI、编辑器扩展、语言服务或某一种
编译器实现。

不同实现可以采用不同的内部结构，但对这里的测试用例应产生相同的可观察结果：

- 识别出相同的指令；
- 得到相同的激活和未激活行；
- 生成相同的投影源码；
- 返回相同的诊断码和诊断范围；
- 对 Profile 给出相同的校验结果。

诊断文案可以由各实现自行决定。

## 目录结构

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

- `schema/` 描述测试文件格式。
- `cases/` 覆盖指令扫描、表达式计算、诊断和源码投影。
- `profiles/` 覆盖 Profile 解析和校验。

这些文件只作为测试数据使用，运行时代码不需要加载这个目录。

## Profile

Profile 是一个由宏名称组成的 JSON 数组：

```json
[
  "UNITY_EDITOR",
  "UNITY_EDITOR_WIN"
]
```

规则：

- 顶层必须是数组；
- 每一项必须是字符串，并匹配
  `[A-Za-z_][A-Za-z0-9_]*`；
- 允许出现重复名称，读取后按同一个定义处理；
- Profile 中存在的名称表示该宏已定义；
- Profile 中不存在的名称表示该宏未定义；
- `defined(NAME)` 判断 `NAME` 是否存在。

JSON 文档开头允许带 UTF-8 BOM。

## 指令

指令必须从物理行的第一个非空白字符开始：

```text
#if EXPRESSION
#elif EXPRESSION
#else
#endif
#error MESSAGE
```

`#` 前允许出现：

- 空格；
- 水平 Tab；
- 垂直 Tab；
- 换页符；
- BOM。

`#if` 和 `#elif` 会计算表达式。`#else` 和 `#endif` 不接受参数。激活状态下的
`#error` 产生 `active-error` 诊断，未激活状态下的 `#error` 不产生该诊断。

看起来像指令但名称未知的行产生 `unknown-directive` 诊断，并按指令行进行投影。

字符串、模板字符串的文本部分、注释和正则表达式中的相似文本都属于普通源码。
模板字符串的 `${...}` 部分按源码扫描。

TypeScript 私有字段、私有方法和私有品牌检查不是指令：

```ts
class Example {
  #value = 1;
  #method() {}

  hasValue(object: object): boolean {
    return #value in object;
  }
}
```

## 表达式

表达式语法：

```text
EXPRESSION :=
    NAME
  | defined(NAME)
  | !EXPRESSION
  | EXPRESSION && EXPRESSION
  | EXPRESSION || EXPRESSION
  | (EXPRESSION)
```

运算符优先级从高到低：

```text
!
&&
||
```

直接使用宏名称时，已定义为 `true`，未定义为 `false`。

## 条件块

条件块可以嵌套。

在一组 `#if` / `#elif` / `#else` 分支中，只有第一个满足条件的分支会被激活。
未激活父分支中的子分支始终保持未激活。

下面这些结构错误使用稳定的诊断码：

- `unmatched-elif`；
- `unmatched-else`；
- `unmatched-endif`；
- `elif-after-else`；
- `duplicate-else`；
- `unterminated-if`。

## 投影

在解析投影源码前，所有指令行和未激活源码范围都会被替换为空白字符。

投影必须保持：

- UTF-8 字节长度；
- UTF-16 code unit 长度；
- 每一个换行符的位置；
- 原始文件路径。

非换行字符按下面的规则替换：

| 原字符的 UTF-8 宽度 | 原字符的 UTF-16 宽度 | 替换内容 |
|---:|---:|---|
| 1 字节 | 1 code unit | `U+0020` |
| 2 字节 | 1 code unit | `U+00A0` |
| 3 字节 | 1 code unit | `U+3000` |
| 4 字节 | 2 code units | `U+00A0 U+00A0` |

`\r` 和 `\n` 原样保留。

这样可以让使用字节偏移的编译器和使用 UTF-16 位置的编辑器继续与原始源码对齐。

## 源码测试用例

每个 `cases/*.json` 文件都是一个独立的一致性用例：

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

`lineStates` 有三个取值：

- `active`：投影后与原行完全相同；
- `inactive`：整行投影为空白；
- `directive`：该行是指令，整行投影为空白。

诊断位置使用从零开始的 UTF-16 行列：

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

测试文件不保存预期诊断文案。各实现可以使用符合自身运行环境的文案。

## Profile 测试用例

每个 `profiles/*.json` 文件包含原始 Profile 文本，以及下面两种预期结果之一：

- 合法 Profile 使用 `expectedDefines`；
- 非法 Profile 使用 `expectedError`。

稳定的 Profile 错误码包括：

- `config-read-failed`；
- `config-invalid-json`；
- `config-invalid-shape`；
- `config-invalid-name`。

`config-read-failed` 属于运行时约定，但当前测试数据不会嵌入文件系统读取行为。

## 执行一致性测试

一致性测试程序应完成以下步骤：

1. 检查测试文件版本；
2. 根据 `sourceLines`、`lineEnding`、`trailingNewline` 和 `bom` 还原源码；
3. 使用 `defines` 计算结果；
4. 比较投影源码、指令、行状态和诊断；
5. 检查 UTF-8 与 UTF-16 长度不变；
6. 使用实现自身的 Profile 解析器执行全部 Profile 用例。

当前公共格式版本是 `1`。遇到不支持的版本时，不应继续静默解析。
