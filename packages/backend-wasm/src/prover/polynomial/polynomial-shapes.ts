
export function nextPowerOfTwo(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Cannot compute power-of-two size for a non-positive value.");
  }

  let size = 1;
  while (size < value) {
    size *= 2;
  }
  return size;
}

export function checkedDomainProduct(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || left <= 0 || !Number.isSafeInteger(right) || right <= 0) {
    throw new Error(`${label} domain dimensions must be positive safe integers.`);
  }
  const product = left * right;
  if (!Number.isSafeInteger(product)) {
    throw new Error(`${label} domain size must be a safe integer.`);
  }
  return product;
}
