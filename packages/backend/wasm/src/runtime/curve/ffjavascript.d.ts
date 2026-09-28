declare module "ffjavascript" {
  export function getCurveFromName(
    name: string,
    singleThread?: boolean,
    plugins?: unknown,
  ): Promise<unknown>;
}
