"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Common = void 0;
const util_1 = require("@ethereumjs/util");
const eventemitter3_1 = require("eventemitter3");
const crc_js_1 = require("./crc.js");
const eips_js_1 = require("./eips.js");
const enums_js_1 = require("./enums.js");
const hardforks_js_1 = require("./hardforks.js");
/**
 * Common class to access chain and hardfork parameters and to provide
 * a unified and shared view on the network and hardfork state.
 *
 * Use the {@link Common.custom} static constructor for creating simple
 * custom chain {@link Common} objects (more complete custom chain setups
 * can be created via the main constructor).
 */
class Common {
    constructor(opts) {
        this._eips = [];
        this._paramsCache = {};
        this._activatedEIPsCache = [];
        this.events = new eventemitter3_1.EventEmitter();
        this._chainParams = JSON.parse(JSON.stringify(opts.chain)); // copy
        this.DEFAULT_HARDFORK = this._chainParams.defaultHardfork ?? enums_js_1.Hardfork.Cancun;
        // Assign hardfork changes in the sequence of the applied hardforks
        this.HARDFORK_CHANGES = this.hardforks().map((hf) => [
            hf.name,
            hardforks_js_1.hardforksDict[hf.name] ??
                (this._chainParams.customHardforks && this._chainParams.customHardforks[hf.name]),
        ]);
        this._hardfork = this.DEFAULT_HARDFORK;
        this._params = opts.params ? JSON.parse(JSON.stringify(opts.params)) : {}; // copy
        if (opts.hardfork !== undefined) {
            this.setHardfork(opts.hardfork);
        }
        if (opts.eips) {
            this.setEIPs(opts.eips);
        }
        this.customCrypto = opts.customCrypto ?? {};
        if (Object.keys(this._paramsCache).length === 0) {
            this._buildParamsCache();
            this._buildActivatedEIPsCache();
        }
    }
    /**
     * Update the internal Common EIP params set. Existing values
     * will get preserved unless there is a new value for a parameter
     * provided with params.
     *
     * Example Format:
     *
     * ```ts
     * {
     *   1559: {
     *     initialBaseFee: 1000000000,
     *   }
     * }
     * ```
     *
     * @param params
     */
    updateParams(params) {
        for (const [eip, paramsConfig] of Object.entries(params)) {
            if (!(eip in this._params)) {
                this._params[eip] = JSON.parse(JSON.stringify(paramsConfig)); // copy
            }
            else {
                this._params[eip] = JSON.parse(JSON.stringify({ ...this._params[eip], ...params[eip] })); // copy
            }
        }
        this._buildParamsCache();
    }
    /**
     * Fully resets the internal Common EIP params set with the values provided.
     *
     * Example Format:
     *
     * ```ts
     * {
     *   1559: {
     *     initialBaseFee: 1000000000,
     *   }
     * }
     * ```
     *
     * @param params
     */
    resetParams(params) {
        this._params = JSON.parse(JSON.stringify(params)); // copy
        this._buildParamsCache();
    }
    /**
     * Sets the hardfork to get params for
     * @param hardfork String identifier (e.g. 'byzantium') or {@link Hardfork} enum
     */
    setHardfork(hardfork) {
        let existing = false;
        for (const hfChanges of this.HARDFORK_CHANGES) {
            if (hfChanges[0] === hardfork) {
                if (this._hardfork !== hardfork) {
                    this._hardfork = hardfork;
                    this._buildParamsCache();
                    this._buildActivatedEIPsCache();
                    this.events.emit('hardforkChanged', hardfork);
                }
                existing = true;
            }
        }
        if (!existing) {
            throw new Error(`Hardfork with name ${hardfork} not supported`);
        }
    }
    /**
     * Returns the hardfork either based on block number (older HFs) or
     * timestamp (Shanghai upwards).
     *
     * @param Opts Block number or timestamp
     * @returns The name of the HF
     */
    getHardforkBy(opts) {
        const blockNumber = (0, util_1.toType)(opts.blockNumber, util_1.TypeOutput.BigInt);
        const timestamp = (0, util_1.toType)(opts.timestamp, util_1.TypeOutput.BigInt);
        // Filter out hardforks with no block number, no timestamp (i.e. unapplied hardforks)
        const hfs = this.hardforks().filter((hf) => hf.block !== null || hf.timestamp !== undefined);
        // Find the first hardfork that has a block number greater than `blockNumber`
        // If timestamp is not provided, it also skips timestamps hardforks to continue
        // discovering/checking number hardforks.
        let hfIndex = hfs.findIndex((hf) => (blockNumber !== undefined && hf.block !== null && BigInt(hf.block) > blockNumber) ||
            (timestamp !== undefined && hf.timestamp !== undefined && BigInt(hf.timestamp) > timestamp));
        if (hfIndex === -1) {
            // all hardforks apply, set hfIndex to the last one as that's the candidate
            hfIndex = hfs.length;
        }
        else if (hfIndex === 0) {
            // cannot have a case where a block number is before all applied hardforks
            // since the chain has to start with a hardfork
            throw Error('Must have at least one hardfork at block 0');
        }
        // If timestamp is not provided, we need to rollback to the last hf with block
        if (timestamp === undefined) {
            const stepBack = hfs
                .slice(0, hfIndex)
                .reverse()
                .findIndex((hf) => hf.block !== null);
            hfIndex = hfIndex - stepBack;
        }
        // Move hfIndex one back to arrive at candidate hardfork
        hfIndex = hfIndex - 1;
        const hfStartIndex = hfIndex;
        // Move the hfIndex to the end of the hardforks that might be scheduled on the same block/timestamp
        // This won't anyway be the case with Merge hfs
        for (; hfIndex < hfs.length - 1; hfIndex++) {
            // break out if hfIndex + 1 is not scheduled at hfIndex
            if (hfs[hfIndex].block !== hfs[hfIndex + 1].block ||
                hfs[hfIndex].timestamp !== hfs[hfIndex + 1].timestamp) {
                break;
            }
        }
        if (timestamp !== undefined) {
            const minTimeStamp = hfs
                .slice(0, hfStartIndex)
                .reduce((acc, hf) => Math.max(Number(hf.timestamp ?? '0'), acc), 0);
            if (minTimeStamp > timestamp) {
                throw Error(`Maximum HF determined by timestamp is lower than the block number HF`);
            }
            const maxTimeStamp = hfs
                .slice(hfIndex + 1)
                .reduce((acc, hf) => Math.min(Number(hf.timestamp ?? timestamp), acc), Number(timestamp));
            if (maxTimeStamp < timestamp) {
                throw Error(`Maximum HF determined by block number is lower than timestamp HF`);
            }
        }
        const hardfork = hfs[hfIndex];
        return hardfork.name;
    }
    /**
     * Sets a new hardfork either based on block number (older HFs) or
     * timestamp (Shanghai upwards).
     *
     * @param Opts Block number or timestamp
     * @returns The name of the HF set
     */
    setHardforkBy(opts) {
        const hardfork = this.getHardforkBy(opts);
        this.setHardfork(hardfork);
        return hardfork;
    }
    /**
     * Internal helper function, returns the params for the given hardfork for the chain set
     * @param hardfork Hardfork name
     * @returns Dictionary with hardfork params or null if hardfork not on chain
     */
    _getHardfork(hardfork) {
        const hfs = this.hardforks();
        for (const hf of hfs) {
            if (hf['name'] === hardfork)
                return hf;
        }
        return null;
    }
    /**
     * Sets the active EIPs
     * @param eips
     */
    setEIPs(eips = []) {
        for (const eip of eips) {
            if (!(eip in eips_js_1.eipsDict)) {
                throw new Error(`${eip} not supported`);
            }
            const minHF = this.gteHardfork(eips_js_1.eipsDict[eip]['minimumHardfork']);
            if (!minHF) {
                throw new Error(`${eip} cannot be activated on hardfork ${this.hardfork()}, minimumHardfork: ${minHF}`);
            }
        }
        this._eips = eips;
        this._buildParamsCache();
        this._buildActivatedEIPsCache();
        for (const eip of eips) {
            if (eips_js_1.eipsDict[eip].requiredEIPs !== undefined) {
                for (const elem of eips_js_1.eipsDict[eip].requiredEIPs) {
                    if (!(eips.includes(elem) || this.isActivatedEIP(elem))) {
                        throw new Error(`${eip} requires EIP ${elem}, but is not included in the EIP list`);
                    }
                }
            }
        }
    }
    /**
     * Internal helper for _buildParamsCache()
     */
    _mergeWithParamsCache(params) {
        this._paramsCache = {
            ...this._paramsCache,
            ...params,
        };
    }
    /**
     * Build up a cache for all parameter values for the current HF and all activated EIPs
     */
    _buildParamsCache() {
        this._paramsCache = {};
        // Iterate through all hardforks up to hardfork set
        const hardfork = this.hardfork();
        for (const hfChanges of this.HARDFORK_CHANGES) {
            // EIP-referencing HF config (e.g. for berlin)
            if ('eips' in hfChanges[1]) {
                const hfEIPs = hfChanges[1]['eips'];
                for (const eip of hfEIPs) {
                    this._mergeWithParamsCache(this._params[eip] ?? {});
                }
            }
            // Parameter-inlining HF config (e.g. for istanbul)
            this._mergeWithParamsCache(hfChanges[1].params ?? {});
            if (hfChanges[0] === hardfork)
                break;
        }
        // Iterate through all additionally activated EIPs
        for (const eip of this._eips) {
            this._mergeWithParamsCache(this._params[eip] ?? {});
        }
    }
    _buildActivatedEIPsCache() {
        this._activatedEIPsCache = [];
        for (const [name, hf] of this.HARDFORK_CHANGES) {
            if (this.gteHardfork(name) && 'eips' in hf) {
                this._activatedEIPsCache = this._activatedEIPsCache.concat(hf['eips']);
            }
        }
        this._activatedEIPsCache = this._activatedEIPsCache.concat(this._eips);
    }
    /**
     * Returns a parameter for the current chain setup
     *
     * If the parameter is present in an EIP, the EIP always takes precedence.
     * Otherwise the parameter is taken from the latest applied HF with
     * a change on the respective parameter.
     *
     * @param name Parameter name (e.g. 'minGasLimit')
     * @returns The value requested (throws if not found)
     */
    param(name) {
        // TODO: consider the case that different active EIPs
        // can change the same parameter
        if (!(name in this._paramsCache)) {
            throw new Error(`Missing parameter value for ${name}`);
        }
        const value = this._paramsCache[name];
        return BigInt(value ?? 0);
    }
    /**
     * Returns the parameter corresponding to a hardfork
     * @param name Parameter name (e.g. 'minGasLimit')
     * @param hardfork Hardfork name
     * @returns The value requested (throws if not found)
     */
    paramByHardfork(name, hardfork) {
        let value;
        for (const hfChanges of this.HARDFORK_CHANGES) {
            // EIP-referencing HF config (e.g. for berlin)
            if ('eips' in hfChanges[1]) {
                const hfEIPs = hfChanges[1]['eips'];
                for (const eip of hfEIPs) {
                    const eipParams = this._params[eip];
                    const eipValue = eipParams?.[name];
                    if (eipValue !== undefined) {
                        value = eipValue;
                    }
                }
                // Parameter-inlining HF config (e.g. for istanbul)
            }
            else {
                const hfValue = hfChanges[1].params?.[name];
                if (hfValue !== undefined) {
                    value = hfValue;
                }
            }
            if (hfChanges[0] === hardfork)
                break;
        }
        if (value === undefined) {
            throw new Error(`Missing parameter value for ${name}`);
        }
        return BigInt(value ?? 0);
    }
    /**
     * Returns a parameter corresponding to an EIP
     * @param name Parameter name (e.g. 'minGasLimit' for 'gasConfig' topic)
     * @param eip Number of the EIP
     * @returns The value requested (throws if not found)
     */
    paramByEIP(name, eip) {
        if (!(eip in eips_js_1.eipsDict)) {
            throw new Error(`${eip} not supported`);
        }
        const eipParams = this._params[eip];
        if (eipParams?.[name] === undefined) {
            throw new Error(`Missing parameter value for ${name}`);
        }
        const value = eipParams[name];
        return BigInt(value ?? 0);
    }
    /**
     * Returns a parameter for the hardfork active on block number or
     * optional provided total difficulty (Merge HF)
     * @param name Parameter name
     * @param blockNumber Block number
     *    * @returns The value requested or `BigInt(0)` if not found
     */
    paramByBlock(name, blockNumber, timestamp) {
        const hardfork = this.getHardforkBy({ blockNumber, timestamp });
        return this.paramByHardfork(name, hardfork);
    }
    /**
     * Checks if an EIP is activated by either being included in the EIPs
     * manually passed in with the {@link CommonOpts.eips} or in a
     * hardfork currently being active
     *
     * Note: this method only works for EIPs being supported
     * by the {@link CommonOpts.eips} constructor option
     * @param eip
     */
    isActivatedEIP(eip) {
        if (this._activatedEIPsCache.includes(eip)) {
            return true;
        }
        return false;
    }
    /**
     * Checks if set or provided hardfork is active on block number
     * @param hardfork Hardfork name or null (for HF set)
     * @param blockNumber
     * @returns True if HF is active on block number
     */
    hardforkIsActiveOnBlock(hardfork, blockNumber) {
        blockNumber = (0, util_1.toType)(blockNumber, util_1.TypeOutput.BigInt);
        hardfork = hardfork ?? this._hardfork;
        const hfBlock = this.hardforkBlock(hardfork);
        if (typeof hfBlock === 'bigint' && hfBlock !== util_1.BIGINT_0 && blockNumber >= hfBlock) {
            return true;
        }
        return false;
    }
    /**
     * Alias to hardforkIsActiveOnBlock when hardfork is set
     * @param blockNumber
     * @returns True if HF is active on block number
     */
    activeOnBlock(blockNumber) {
        return this.hardforkIsActiveOnBlock(null, blockNumber);
    }
    /**
     * Sequence based check if given or set HF1 is greater than or equal HF2
     * @param hardfork1 Hardfork name or null (if set)
     * @param hardfork2 Hardfork name
     * @param opts Hardfork options
     * @returns True if HF1 gte HF2
     */
    hardforkGteHardfork(hardfork1, hardfork2) {
        hardfork1 = hardfork1 ?? this._hardfork;
        const hardforks = this.hardforks();
        let posHf1 = -1, posHf2 = -1;
        let index = 0;
        for (const hf of hardforks) {
            if (hf['name'] === hardfork1)
                posHf1 = index;
            if (hf['name'] === hardfork2)
                posHf2 = index;
            index += 1;
        }
        return posHf1 >= posHf2 && posHf2 !== -1;
    }
    /**
     * Alias to hardforkGteHardfork when hardfork is set
     * @param hardfork Hardfork name
     * @returns True if hardfork set is greater than hardfork provided
     */
    gteHardfork(hardfork) {
        return this.hardforkGteHardfork(null, hardfork);
    }
    /**
     * Returns the hardfork change block for hardfork provided or set
     * @param hardfork Hardfork name, optional if HF set
     * @returns Block number or null if unscheduled
     */
    hardforkBlock(hardfork) {
        hardfork = hardfork ?? this._hardfork;
        const block = this._getHardfork(hardfork)?.['block'];
        if (block === undefined || block === null) {
            return null;
        }
        return BigInt(block);
    }
    hardforkTimestamp(hardfork) {
        hardfork = hardfork ?? this._hardfork;
        const timestamp = this._getHardfork(hardfork)?.['timestamp'];
        if (timestamp === undefined || timestamp === null) {
            return null;
        }
        return BigInt(timestamp);
    }
    /**
     * Returns the hardfork change block for eip
     * @param eip EIP number
     * @returns Block number or null if unscheduled
     */
    eipBlock(eip) {
        for (const hfChanges of this.HARDFORK_CHANGES) {
            const hf = hfChanges[1];
            if ('eips' in hf) {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (hf['eips'].includes(eip)) {
                    return this.hardforkBlock(hfChanges[0]);
                }
            }
        }
        return null;
    }
    /**
     * Returns the scheduled timestamp of the EIP (if scheduled and scheduled by timestamp)
     * @param eip EIP number
     * @returns Scheduled timestamp. If this EIP is unscheduled, or the EIP is scheduled by block number, then it returns `null`.
     */
    eipTimestamp(eip) {
        for (const hfChanges of this.HARDFORK_CHANGES) {
            const hf = hfChanges[1];
            if ('eips' in hf) {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                if (hf['eips'].includes(eip)) {
                    return this.hardforkTimestamp(hfChanges[0]);
                }
            }
        }
        return null;
    }
    /**
     * Returns the change block for the next hardfork after the hardfork provided or set
     * @param hardfork Hardfork name, optional if HF set
     * @returns Block timestamp, number or null if not available
     */
    nextHardforkBlockOrTimestamp(hardfork) {
        hardfork = hardfork ?? this._hardfork;
        const hfs = this.hardforks();
        let hfIndex = hfs.findIndex((hf) => hf.name === hardfork);
        // If the current hardfork is merge, go one behind as merge hf is not part of these
        // calcs even if the merge hf block is set
        if (hardfork === enums_js_1.Hardfork.Paris) {
            hfIndex -= 1;
        }
        // Hardfork not found
        if (hfIndex < 0) {
            return null;
        }
        let currHfTimeOrBlock = hfs[hfIndex].timestamp ?? hfs[hfIndex].block;
        currHfTimeOrBlock =
            currHfTimeOrBlock !== null && currHfTimeOrBlock !== undefined
                ? Number(currHfTimeOrBlock)
                : null;
        const nextHf = hfs.slice(hfIndex + 1).find((hf) => {
            let hfTimeOrBlock = hf.timestamp ?? hf.block;
            hfTimeOrBlock =
                hfTimeOrBlock !== null && hfTimeOrBlock !== undefined ? Number(hfTimeOrBlock) : null;
            return (hf.name !== enums_js_1.Hardfork.Paris &&
                hfTimeOrBlock !== null &&
                hfTimeOrBlock !== undefined &&
                hfTimeOrBlock !== currHfTimeOrBlock);
        });
        // If no next hf found with valid block or timestamp return null
        if (nextHf === undefined) {
            return null;
        }
        const nextHfBlock = nextHf.timestamp ?? nextHf.block;
        if (nextHfBlock === null || nextHfBlock === undefined) {
            return null;
        }
        return BigInt(nextHfBlock);
    }
    /**
     * Internal helper function to calculate a fork hash
     * @param hardfork Hardfork name
     * @param genesisHash Genesis block hash of the chain
     * @returns Fork hash as hex string
     */
    _calcForkHash(hardfork, genesisHash) {
        let hfBytes = new Uint8Array(0);
        let prevBlockOrTime = 0;
        for (const hf of this.hardforks()) {
            const { block, timestamp, name } = hf;
            // Timestamp to be used for timestamp based hfs even if we may bundle
            // block number with them retrospectively
            let blockOrTime = timestamp ?? block;
            blockOrTime = blockOrTime !== null ? Number(blockOrTime) : null;
            // Skip for chainstart (0), not applied HFs (null) and
            // when already applied on same blockOrTime HFs
            // and on the merge since forkhash doesn't change on merge hf
            if (typeof blockOrTime === 'number' &&
                blockOrTime !== 0 &&
                blockOrTime !== prevBlockOrTime &&
                name !== enums_js_1.Hardfork.Paris) {
                const hfBlockBytes = (0, util_1.hexToBytes)(`0x${blockOrTime.toString(16).padStart(16, '0')}`);
                hfBytes = (0, util_1.concatBytes)(hfBytes, hfBlockBytes);
                prevBlockOrTime = blockOrTime;
            }
            if (hf.name === hardfork)
                break;
        }
        const inputBytes = (0, util_1.concatBytes)(genesisHash, hfBytes);
        // CRC32 delivers result as signed (negative) 32-bit integer,
        // convert to hex string
        const forkhash = (0, util_1.bytesToHex)((0, util_1.intToBytes)((0, crc_js_1.crc32)(inputBytes) >>> 0));
        return forkhash;
    }
    /**
     * Returns an eth/64 compliant fork hash (EIP-2124)
     * @param hardfork Hardfork name, optional if HF set
     * @param genesisHash Genesis block hash of the network, optional if already defined and not needed to be calculated
     */
    forkHash(hardfork, genesisHash) {
        hardfork = hardfork ?? this._hardfork;
        const data = this._getHardfork(hardfork);
        if (data === null || (data?.block === null && data?.timestamp === undefined)) {
            const msg = 'No fork hash calculation possible for future hardfork';
            throw new Error(msg);
        }
        if (data?.forkHash !== null && data?.forkHash !== undefined) {
            return data.forkHash;
        }
        if (!genesisHash)
            throw new Error('genesisHash required for forkHash calculation');
        return this._calcForkHash(hardfork, genesisHash);
    }
    /**
     *
     * @param forkHash Fork hash as a hex string
     * @returns Array with hardfork data (name, block, forkHash)
     */
    hardforkForForkHash(forkHash) {
        const resArray = this.hardforks().filter((hf) => {
            return hf.forkHash === forkHash;
        });
        return resArray.length >= 1 ? resArray[resArray.length - 1] : null;
    }
    /**
     * Sets any missing forkHashes on the passed-in {@link Common} instance
     * @param common The {@link Common} to set the forkHashes for
     * @param genesisHash The genesis block hash
     */
    setForkHashes(genesisHash) {
        for (const hf of this.hardforks()) {
            const blockOrTime = hf.timestamp ?? hf.block;
            if ((hf.forkHash === null || hf.forkHash === undefined) &&
                blockOrTime !== null &&
                blockOrTime !== undefined) {
                hf.forkHash = this.forkHash(hf.name, genesisHash);
            }
        }
    }
    /**
     * Returns the Genesis parameters of the current chain
     * @returns Genesis dictionary
     */
    genesis() {
        return this._chainParams.genesis;
    }
    /**
     * Returns the hardforks for current chain
     * @returns {Array} Array with arrays of hardforks
     */
    hardforks() {
        const hfs = this._chainParams.hardforks;
        if (this._chainParams.customHardforks !== undefined) {
            this._chainParams.customHardforks;
        }
        return hfs;
    }
    /**
     * Returns bootstrap nodes for the current chain
     * @returns {Dictionary} Dict with bootstrap nodes
     */
    bootstrapNodes() {
        return this._chainParams.bootstrapNodes;
    }
    /**
     * Returns DNS networks for the current chain
     * @returns {String[]} Array of DNS ENR urls
     */
    dnsNetworks() {
        return this._chainParams.dnsNetworks;
    }
    /**
     * Returns the hardfork set
     * @returns Hardfork name
     */
    hardfork() {
        return this._hardfork;
    }
    /**
     * Returns the Id of current chain
     * @returns chain Id
     */
    chainId() {
        return BigInt(this._chainParams.chainId);
    }
    /**
     * Returns the name of current chain
     * @returns chain name (lower case)
     */
    chainName() {
        return this._chainParams.name;
    }
    /**
     * Returns the additionally activated EIPs
     * (by using the `eips` constructor option)
     * @returns List of EIPs
     */
    eips() {
        return this._eips;
    }
    /**
     * Returns the consensus type of the network
     * Possible values: "pow"|"poa"|"pos"
     *
     * Note: This value can update along a Hardfork.
     */
    consensusType() {
        const hardfork = this.hardfork();
        let value;
        for (const hfChanges of this.HARDFORK_CHANGES) {
            if ('consensus' in hfChanges[1]) {
                value = hfChanges[1]['consensus']['type'];
            }
            if (hfChanges[0] === hardfork)
                break;
        }
        return value ?? this._chainParams['consensus']['type'];
    }
    /**
     * Returns the concrete consensus implementation
     * algorithm or protocol for the network
     * e.g. "ethash" for "pow" consensus type,
     * "clique" for "poa" consensus type or
     * "casper" for "pos" consensus type.
     *
     * Note: This value can update along a Hardfork.
     */
    consensusAlgorithm() {
        const hardfork = this.hardfork();
        let value;
        for (const hfChanges of this.HARDFORK_CHANGES) {
            if ('consensus' in hfChanges[1]) {
                value = hfChanges[1]['consensus']['algorithm'];
            }
            if (hfChanges[0] === hardfork)
                break;
        }
        return value ?? this._chainParams['consensus']['algorithm'];
    }
    /**
     * Returns a dictionary with consensus configuration
     * parameters based on the consensus algorithm
     *
     * Expected returns (parameters must be present in
     * the respective chain JSON files):
     *
     * ethash: empty object
     * clique: period, epoch
     * casper: empty object
     *
     * Note: This value can update along a Hardfork.
     */
    consensusConfig() {
        const hardfork = this.hardfork();
        let value;
        for (const hfChanges of this.HARDFORK_CHANGES) {
            if ('consensus' in hfChanges[1]) {
                // The config parameter is named after the respective consensus algorithm
                const config = hfChanges[1];
                const algorithm = config['consensus']['algorithm'];
                value = config['consensus'][algorithm];
            }
            if (hfChanges[0] === hardfork)
                break;
        }
        return (value ?? this._chainParams['consensus'][this.consensusAlgorithm()] ?? {});
    }
    /**
     * Returns a deep copy of this {@link Common} instance.
     */
    copy() {
        const copy = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
        copy.events = new eventemitter3_1.EventEmitter();
        return copy;
    }
}
exports.Common = Common;
//# sourceMappingURL=common.js.map