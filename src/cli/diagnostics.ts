// Copyright (C) 2026 Tencent. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export function diagnosticHost(
  ts: typeof import("typescript"),
  projectRoot: string,
): import("typescript").FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => projectRoot,
    getCanonicalFileName: (fileName) => fileName,
    getNewLine: () => ts.sys.newLine,
  };
}

export function formatCliDiagnostics(
  ts: typeof import("typescript"),
  diagnostics: readonly import("typescript").Diagnostic[],
  projectRoot: string,
): string {
  const host = diagnosticHost(ts, projectRoot);
  return process.stderr.isTTY === true
    ? ts.formatDiagnosticsWithColorAndContext(diagnostics, host)
    : ts.formatDiagnostics(diagnostics, host);
}
