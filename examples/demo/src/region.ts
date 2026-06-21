// Each branch declares `region` with a different type. Only the active branch is
// seen by the type checker, so there is no duplicate-declaration error and
// `region` resolves to the active branch's type.
#if HOK
export const region: string = "hok";
export function describeRegion(): string {
  return `Region ${region.toUpperCase()}`;
}
#elif DOMESTIC
export const region: number = 86;
export function describeRegion(): string {
  return `Region #${region}`;
}
#else
#error No region profile selected.
#endif
