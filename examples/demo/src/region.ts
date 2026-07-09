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

// Each branch declares `region` with a different type. Only the active branch is
// seen by the type checker, so there is no duplicate-declaration error and
// `region` resolves to the active branch's type.
#if TEST_A
export const region: string = "hok";
export const profileName = "TEST_A" as const;
export function describeRegion(): string {
  return `Region ${region.toUpperCase()}`;
}
#elif TEST_B
export const region: number = 86;
export const profileName = "TEST_B" as const;
export function describeRegion(): string {
  return `Region #${region}`;
}
#else
#error No demo profile selected.
#endif
