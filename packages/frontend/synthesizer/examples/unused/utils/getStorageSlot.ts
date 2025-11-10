interface StorageItem {
    astId: number;
    contract: string;
    label: string;
    offset: number;
    slot: string;
    type: string;
}

interface StorageLayout {
    storageLayout: {
        storage: StorageItem[];
        types: {
            [key: string]: {
                encoding: string;
                label: string;
                numberOfBytes: string;
                key?: string;
                value?: string;
            };
        };
    };
}

export function getStorageSlot(storageLayout: StorageLayout, labelToFind: string) {
        const item = storageLayout.storageLayout.storage.find(item => item.label === labelToFind);
        if (!item) throw new Error(`Storage slot not found for ${labelToFind}`);
        return item.slot;
    };