// Debugging tool
export const mapToStr = (map: Map<any, any>) => {
  return Object.fromEntries(
    Array.from(map, ([key, value]) => [
      key,
      JSON.parse(JSON.stringify(value, (k, v) => (typeof v === 'bigint' ? v.toString() : v))),
    ]),
  )
}