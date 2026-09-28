import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolvePrivateStateAppDir } from '../scripts/private-state-anvil-fixture.ts';

const packageRoot = path.resolve(__dirname, '..', '..');
const originalAppDir = process.env.PRIVATE_STATE_APP_DIR;

afterEach(() => {
  if (originalAppDir === undefined) {
    delete process.env.PRIVATE_STATE_APP_DIR;
  } else {
    process.env.PRIVATE_STATE_APP_DIR = originalAppDir;
  }
});

describe('private-state Anvil fixture resolver', () => {
  it('uses the explicit application override', () => {
    process.env.PRIVATE_STATE_APP_DIR = '/tmp/private-state-fixture';

    expect(resolvePrivateStateAppDir(packageRoot)).toBe('/tmp/private-state-fixture');
  });

  it('uses the sibling contracts checkout by default', () => {
    delete process.env.PRIVATE_STATE_APP_DIR;

    expect(resolvePrivateStateAppDir(packageRoot)).toBe(
      path.resolve(
        packageRoot,
        '..', '..', '..', '..', '..',
        'Tokamak-zk-EVM-contracts',
        'packages',
        'apps',
        'private-state',
      ),
    );
  });
});
