import { ethers } from 'ethers';

interface ContractMetadata {
    address: string;
    network: string;
    abi: any;
    sourceCode: string;
    bytecode: string;
    compilerVersion: string;
    optimizationUsed: boolean;
    constructorArguments?: string;
}

interface StorageLayout {
    slots: StorageSlot[];
    types: Record<string, StorageType>;
}

interface StorageSlot {
    name: string;
    type: string;
    slot: number;
    offset: number;
}

interface StorageType {
    encoding: string;
    label: string;
    numberOfBytes: string;
    base?: string;
    members?: StorageSlot[];
}

class ContractAnalyzer {
    private etherscanApiKey: string;
    private cache: Map<string, ContractMetadata>;

    constructor(etherscanApiKey: string) {
        this.etherscanApiKey = etherscanApiKey;
        this.cache = new Map();
    }

    async analyze(contractAddress: string, network: string = 'mainnet'): Promise<ContractMetadata> {
        // Check cache first
        const cacheKey = `${network}:${contractAddress}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        try {
            // Fetch all necessary data in parallel
            const [sourceCodeData, abiData, bytecodeData] = await Promise.all([
                this.getContractSourceCode(contractAddress, network),
                this.getContractABI(contractAddress, network),
                this.getContractBytecode(contractAddress, network)
            ]);

            const metadata: ContractMetadata = {
                address: contractAddress,
                network,
                abi: abiData,
                sourceCode: sourceCodeData.SourceCode,
                bytecode: bytecodeData,
                compilerVersion: sourceCodeData.CompilerVersion,
                optimizationUsed: sourceCodeData.OptimizationUsed === '1',
                constructorArguments: sourceCodeData.ConstructorArguments
            };

            // Cache the results
            this.cache.set(cacheKey, metadata);
            return metadata;
        } catch (error) {
            console.error('Error analyzing contract:', error);
            throw error;
        }
    }

    private async getContractSourceCode(contractAddress: string, network: string): Promise<any> {
        const baseURL = this.getEtherscanBaseURL(network);
        const response = await fetch(
            `${baseURL}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${this.etherscanApiKey}`
        );
        const data = await response.json();
        
        if (data.status !== '1' || !data.result[0]) {
            throw new Error(`Failed to fetch source code: ${data.message || 'Unknown error'}`);
        }

        return data.result[0];
    }

    private async getContractABI(contractAddress: string, network: string): Promise<any> {
        const baseURL = this.getEtherscanBaseURL(network);
        const response = await fetch(
            `${baseURL}?module=contract&action=getabi&address=${contractAddress}&apikey=${this.etherscanApiKey}`
        );
        const data = await response.json();

        if (data.status !== '1') {
            throw new Error(`Failed to fetch ABI: ${data.message}`);
        }

        return JSON.parse(data.result);
    }

    private async getContractBytecode(contractAddress: string, network: string): Promise<string> {
        const provider = this.getProvider(network);
        const bytecode = await provider.getCode(contractAddress);
        
        if (bytecode === '0x') {
            throw new Error('Contract not found or has no bytecode');
        }

        return bytecode;
    }

    private getEtherscanBaseURL(network: string): string {
        return network === 'mainnet'
            ? 'https://api.etherscan.io/api'
            : `https://api-${network}.etherscan.io/api`;
    }

    private getProvider(network: string): ethers.Provider {
        // 실제 구현에서는 네트워크별 RPC URL 설정 필요
        const rpcUrl = network === 'mainnet'
            ? `https://eth-mainnet.g.alchemy.com/v2/`
            : `https://eth-${network}.g.alchemy.com/v2/YOUR-API-KEY`;
        
        return new ethers.JsonRpcProvider(rpcUrl);
    }

    // Storage layout analysis methods
    async analyzeStorageLayout(metadata: ContractMetadata): Promise<StorageLayout> {
        const sourceCode = metadata.sourceCode;
        const slots: StorageSlot[] = [];
        const types: Record<string, StorageType> = {};
        
        // 상속 관계와 매핑을 고려한 변수 순서 분석
        const storageVars = this.extractStorageVariables(sourceCode);
        let currentSlot = 0;
        
        for (const variable of storageVars) {
            const [slot, offset, typeInfo] = this.calculateSlotAndOffset(variable.type, currentSlot);
            
            slots.push({
                name: variable.name,
                type: variable.type,
                slot,
                offset
            });
            
            types[variable.type] = typeInfo;
            currentSlot = slot + 1;
        }
        
        return { slots, types };
    }

    private extractStorageVariables(sourceCode: string): Array<{ name: string; type: string }> {
        const variables: Array<{ name: string; type: string }> = [];
        
        // 매핑 찾기 - 접근 제어자와 상속된 변수들도 포함
        const mappingRegex = /(?:override\s+)?(?:public|private|internal)?\s*mapping\s*\(([^==>]*?)=>\s*([^;{]*?)\)\s+(?:private\s+)?(\w+)\s*;/g;
        let match;
        
        while ((match = mappingRegex.exec(sourceCode)) !== null) {
            const keyType = match[1].trim();
            const valueType = match[2].trim();
            const name = match[3];
            
            if (!this.isKeyword(name)) {
                variables.push({
                    name,
                    type: `mapping(${keyType} => ${valueType})`
                });
            }
        }

        // 일반 상태 변수 찾기
        const stateVarRegex = /(?:^|\n)\s*([\w\.]+(?:\s*\[\s*\])?)\s+(?:public|private|internal)?\s+(\w+)\s*;/gm;
        
        while ((match = stateVarRegex.exec(sourceCode)) !== null) {
            if (match[0].includes('function') || match[0].includes('mapping') || 
                match[0].includes('return') || match[0].includes('require')) {
                continue;
            }
            
            const type = match[1].trim();
            const name = match[2];
            
            if (!this.isKeyword(name) && !variables.some(v => v.name === name)) {
                variables.push({ name, type });
            }
        }

        return variables;
    }

    private isKeyword(name: string): boolean {
        const keywords = ['return', 'true', 'false', '0', '1', 'function', 'require'];
        return keywords.includes(name);
    }

    private calculateSlotAndOffset(type: string, currentSlot: number): [number, number, StorageType] {
        // 매핑은 항상 새로운 슬롯에서 시작
        if (type.startsWith('mapping')) {
            const baseType = type.match(/mapping\s*\([^==>]*?=>\s*([^;{]*?)\)/)?.[1]?.trim() || 'unknown';
            return [currentSlot, 0, {
                encoding: 'mapping',
                label: type,
                numberOfBytes: '32',
                base: baseType
            }];
        }

        const typeMap: Record<string, StorageType> = {
            'address': {
                encoding: 'inplace',
                label: 'address',
                numberOfBytes: '20'
            },
            'uint256': {
                encoding: 'inplace',
                label: 'uint256',
                numberOfBytes: '32'
            },
            'uint8': {
                encoding: 'inplace',
                label: 'uint8',
                numberOfBytes: '1'
            },
            'bool': {
                encoding: 'inplace',
                label: 'bool',
                numberOfBytes: '1'
            },
            'string': {
                encoding: 'bytes',
                label: 'string',
                numberOfBytes: '32'
            }
        };

        // 사용자 정의 타입 (예: Roles.Role, SeigManagerI)
        if (type.includes('.') || !typeMap[type]) {
            return [currentSlot, 0, {
                encoding: 'inplace',
                label: type,
                numberOfBytes: '32'
            }];
        }

        return [currentSlot, 0, typeMap[type]];
    }

}

// Usage example
async function main() {
    const analyzer = new ContractAnalyzer('');
    
    try {
        const contractAddress = '0x6982508145454ce325ddbe47a25d4ec3d2311933';
        const metadata = await analyzer.analyze(contractAddress, 'mainnet');
        console.log('Contract Metadata:', metadata);

        // Analyze storage layout
        const storageLayout = await analyzer.analyzeStorageLayout(metadata);
        console.log('Storage Layout:', storageLayout);
    } catch (error) {
        console.error('Analysis failed:', error);
    }
}

main();

export { ContractAnalyzer, ContractMetadata, StorageLayout };