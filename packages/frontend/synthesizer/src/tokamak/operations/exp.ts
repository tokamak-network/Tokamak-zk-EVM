import { BIGINT_1 } from '@synthesizer-libs/util';

import type { Synthesizer } from '../core/synthesizer/index.js';
import type { DataPt } from '../types/index.js';

/**
 * Places the necessary subcircuits to perform exponentiation (a^b) by squaring.
 * @param synthesizer The synthesizer instance.
 * @param inPts An array containing the base (a) and exponent (b) as DataPts.
 * @returns The DataPt representing the result of the exponentiation.
 */

