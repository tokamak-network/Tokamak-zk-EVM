import { ethers } from 'ethers';

async function getContractBytecode(contractAddress: string, network: string = 'mainnet') {
    // Etherscan API key 필요
    const ETHERSCAN_API_KEY = '';
    
        
    // 네트워크별 API URL
    const baseURL = network === 'mainnet'
        ? 'https://api.etherscan.io/api'
        : `https://api-${network}.etherscan.io/api`;

    try {
        // const response = await fetch(
        //    `${baseURL}?module=contract&action=getabi&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`
        // );
        const response = await fetch(
           `${baseURL}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${ETHERSCAN_API_KEY}`
        );
       
        const data = await response.json();
        console.log("data", data);
        
        if (data.status === '1' && data.result) {
            return data.result;
        } else {
            throw new Error(`Failed to fetch bytecode: ${data.message}`);
        }
    } catch (error) {
        console.error('Error fetching contract bytecode:', error);
        throw error;
    }
}

// async function getContractBytecode(contractAddress: string, network: string = 'mainnet') {
//     // RPC URL 설정
//     const rpcUrl = network === 'mainnet'
//         ? ''  
//         : `https://eth-${network}.g.alchemy.com/v2/YOUR-API-KEY`;
    
//     try {
//         const provider = new ethers.JsonRpcProvider(rpcUrl);
//         const bytecode = await provider.getCode(contractAddress);
        
//         if (bytecode === '0x') {
//             throw new Error('Contract not found');
//         }
        
//         return bytecode;
//     } catch (error) {
//         console.error('Error fetching contract bytecode:', error);
//         throw error;
//     }
// }

// 사용 예시
const contractAddress = '0x123...'; // 컨트랙트 주소
const bytecode = await getContractBytecode("0x2be5e8c109e2197d077d13a82daead6a9b3433c5", 'mainnet');

async function main() {
    const bytecode = await getContractBytecode("0x2be5e8c109e2197d077d13a82daead6a9b3433c5", 'mainnet');
    console.log('bytecode', bytecode);
}

main();
