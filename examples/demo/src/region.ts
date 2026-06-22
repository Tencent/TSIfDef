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
