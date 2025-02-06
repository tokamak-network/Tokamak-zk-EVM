interface StateVariable {
    name: string;
    type: string;
    visibility: string;
}

class StorageLayoutAnalyzer {
    private parseStateVariables(sourceCode: string): StateVariable[] {
        const variables: StateVariable[] = [];
        
        // 프록시 패턴의 특수 슬롯 확인
        const proxySlots = this.parseProxySlots(sourceCode);
        if (proxySlots.length > 0) {
            return proxySlots;
        }
        
        // 기존 컨트랙트 분석 로직
        const contractRegex = /contract\s+(\w+)(?:\s+is\s+([^{]+))?\s*{([^}]+)}/g;
        
        // 상속 관계를 저장할 맵
        const inheritanceMap = new Map<string, string[]>();
        const contractVariables = new Map<string, StateVariable[]>();
        
        let match;
        while ((match = contractRegex.exec(sourceCode)) !== null) {
            const [_, contractName, inheritance, contractBody] = match;
            
            // 상속 관계 파싱
            const parents = inheritance 
                ? inheritance.split(',').map(s => s.trim()) 
                : [];
            inheritanceMap.set(contractName, parents);
            
            // 상태 변수 파싱
            const stateVars = this.parseContractStateVariables(contractBody);
            contractVariables.set(contractName, stateVars);
        }
        
        // 상속 순서대로 변수 결합
        const orderedVariables = this.combineVariablesInOrder(
            inheritanceMap, 
            contractVariables
        );
        
        return orderedVariables;
    }
    
    private parseProxySlots(sourceCode: string): StateVariable[] {
        const variables: StateVariable[] = [];
        
        // 프록시 상수 슬롯 정의 찾기
        const slotRegex = /bytes32\s+(?:private\s+)?constant\s+(\w+)_SLOT\s*=\s*(?:0x[\da-fA-F]+|keccak256\([^)]+\))/g;
        
        let match;
        while ((match = slotRegex.exec(sourceCode)) !== null) {
            const [_, slotName] = match;
            variables.push({
                name: slotName.toLowerCase(),
                type: 'address',
                visibility: 'private'
            });
        }
        
        // AdminUpgradeabilityProxy 패턴 확인
        if (sourceCode.includes('AdminUpgradeabilityProxy') || sourceCode.includes('TransparentUpgradeableProxy')) {
            if (!variables.find(v => v.name === 'implementation')) {
                variables.push({
                    name: 'implementation',
                    type: 'address',
                    visibility: 'private'
                });
            }
            if (!variables.find(v => v.name === 'admin')) {
                variables.push({
                    name: 'admin',
                    type: 'address',
                    visibility: 'private'
                });
            }
        }
        
        return variables;
    }
    
    private parseContractStateVariables(contractBody: string): StateVariable[] {
        const variables: StateVariable[] = [];
        
        // 상태 변수 선언을 찾는 정규식 개선
        const stateVarRegex = /\s*(mapping\s*\([^=>]+\s*=>\s*(?:mapping\s*\([^=>]+\s*=>\s*[^;)]+\)|[^;)]+)\)|[\w\[\]\.]+)\s+(private|public|internal|external)?\s+(\w+)\s*;/gm;
        
        // assembly 블록에서 sload/sstore 패턴 찾기
        const assemblyRegex = /assembly\s*{[^}]*sload\s*\(([^)]+)\)[^}]*}/g;
        const sloadRegex = /sload\s*\(([^)]+)\)/g;
        
        // 변수 선언 순서대로 파싱
        let match;
        while ((match = stateVarRegex.exec(contractBody)) !== null) {
            const [_, type, visibility, name] = match;
            variables.push({
                name,
                type: type.trim(),
                visibility: visibility?.trim() || 'internal'
            });
        }
        
        // assembly 블록에서 슬롯 접근 찾기
        while ((match = assemblyRegex.exec(contractBody)) !== null) {
            const assemblyBlock = match[0];
            let sloadMatch;
            while ((sloadMatch = sloadRegex.exec(assemblyBlock)) !== null) {
                const slotIdentifier = sloadMatch[1].trim();
                if (!variables.find(v => v.name === slotIdentifier)) {
                    variables.push({
                        name: slotIdentifier,
                        type: 'unknown',
                        visibility: 'private'
                    });
                }
            }
        }

        // 매핑 변수 선언이 없는 경우 함수를 통해 확인
        const functionRegex = /function\s+(\w+)\s*\((.*?)\)\s*(?:external|public|private|internal)?\s*(?:view|pure)?\s*returns\s*\((.*?)\)/g;
        const foundMappings = new Set(variables.map(v => v.name));
        
        while ((match = functionRegex.exec(contractBody)) !== null) {
            const [_, functionName, params, returns] = match;
            
            // balanceOf 함수를 통해 _balances 매핑 확인
            if (functionName === 'balanceOf' && !foundMappings.has('_balances')) {
                // 함수 구현부를 찾아 실제 매핑 이름 확인
                const funcBodyRegex = new RegExp(`${functionName}[^{]*{([^}]*)}`, 'g');
                const funcBody = funcBodyRegex.exec(contractBody)?.[1] || '';
                
                // return _balances[account] 패턴 찾기
                const returnRegex = /return\s+(\w+)\[/;
                const mappingName = funcBody.match(returnRegex)?.[1] || '_balances';
                
                variables.push({
                    name: mappingName,
                    type: 'mapping(address => uint256)',
                    visibility: 'private'
                });
            }
            
            // allowance 함수를 통해 _allowances 매핑 확인
            if (functionName === 'allowance' && !foundMappings.has('_allowances')) {
                const funcBodyRegex = new RegExp(`${functionName}[^{]*{([^}]*)}`, 'g');
                const funcBody = funcBodyRegex.exec(contractBody)?.[1] || '';
                
                const returnRegex = /return\s+(\w+)\[/;
                const mappingName = funcBody.match(returnRegex)?.[1] || '_allowances';
                
                variables.push({
                    name: mappingName,
                    type: 'mapping(address => mapping(address => uint256))',
                    visibility: 'private'
                });
            }
        }
        
        return variables;
    }
    
    private combineVariablesInOrder(
        inheritanceMap: Map<string, string[]>,
        contractVariables: Map<string, StateVariable[]>
    ): StateVariable[] {
        const visited = new Set<string>();
        const result: StateVariable[] = [];
        
        // DFS로 상속 트리 순회
        const visit = (contractName: string) => {
            if (visited.has(contractName)) return;
            
            const parents = inheritanceMap.get(contractName) || [];
            // 부모 먼저 방문
            for (const parent of parents) {
                visit(parent);
            }
            
            // 현재 컨트랙트의 변수 추가
            const vars = contractVariables.get(contractName) || [];
            result.push(...vars);
            
            visited.add(contractName);
        };
        
        // 모든 컨트랙트에 대해 순회
        for (const contractName of inheritanceMap.keys()) {
            visit(contractName);
        }
        
        return result;
    }

    private calculateStorageSlot(variables: StateVariable[]): Map<string, number> {
        const storageLayout = new Map<string, number>();
        let currentSlot = 0;

        // 소스 코드에서 나타난 순서대로 슬롯 할당
        for (const variable of variables) {
            storageLayout.set(variable.name, currentSlot);
            currentSlot++;
        }

        return storageLayout;
    }

    public analyzeStorageLayout(sourceCode: string): Map<string, number> {
        const variables = this.parseStateVariables(sourceCode);
        return this.calculateStorageSlot(variables);
    }

    // 디버깅 및 검증을 위한 메소드
    public printStorageLayout(sourceCode: string): void {
        const variables = this.parseStateVariables(sourceCode);
        console.log('Found state variables:');
        variables.forEach(v => {
            console.log(`Name: ${v.name}, Type: ${v.type}, Visibility: ${v.visibility}`);
        });

        const layout = this.calculateStorageSlot(variables);
        console.log('\nStorage layout:');
        layout.forEach((slot, name) => {
            console.log(`${name}: slot ${slot}`);
        });
    }
}

async function main() {
    const etherscanApiKey = ""

    const analyzer = new StorageLayoutAnalyzer();
    //TON
        // const contractAddress = '0x2be5e8c109e2197d077d13a82daead6a9b3433c5';
        //USDT
        const contractAddress = "0xdAC17F958D2ee523a2206206994597C13D831ec7"
        //USDC proxy
        // const contractAddress = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
        //USDC implementation
        // const contractAddress = "0x43506849d7c04f9138d1a2050bbf3a0c054402dd"
        //SHIB
        // const contractAddress = "0x95ad61b0a150d79219dcf64e1e6cc01f0b64c4ce"
    
    const response = await fetch(
        `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${etherscanApiKey}`
    );
    const result = await response.json();
    
    // API 응답 확인 및 소스 코드 추출
    if (result.status !== "1" || !result.result || !result.result[0]) {
        console.error("Failed to fetch source code from Etherscan");
        console.error("API Response:", result);
        return;
    }

    let sourceCode = result.result[0].SourceCode;
    
    // 소스 코드가 JSON 형식으로 인코딩된 경우 처리
    if (sourceCode.startsWith('{')) {
        try {
            const parsed = JSON.parse(sourceCode);
            // 다중 파일 컨트랙트의 경우
            if (parsed.sources) {
                // 모든 소스 파일의 내용을 하나로 합침
                sourceCode = Object.values(parsed.sources)
                    .map((source: any) => source.content)
                    .join('\n');
            }
        } catch (e) {
            console.error("Failed to parse source code JSON:", e);
            return;
        }
    }

    if (!sourceCode) {
        console.error("No source code found");
        return;
    }

    analyzer.printStorageLayout(sourceCode);
}

main().catch(console.error);