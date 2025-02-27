
export interface FormattedLog {
    address: string;
    topics: {
        signature: string;
        from: string;
        to: string;
    };
    data: {
        hex: string;
        value: string;
    };
}

export function formatLogsStructured(logs: any[]): FormattedLog[] {
    return logs.map((log: any) => {
        const topics = log[1].map((topic: any) => `0x${Buffer.from(topic).toString('hex')}`);
        const dataHex = `0x${Buffer.from(log[2]).toString('hex')}`;
        
        return {
            address: `0x${Buffer.from(log[0]).toString('hex')}`,
            topics: {
                signature: topics[0],
                from: `0x${topics[1].slice(-40)}`,
                to: `0x${topics[2].slice(-40)}`
            },
            data: {
                hex: dataHex,
                value: parseInt(dataHex, 16).toString()
            }
        };
    });
}