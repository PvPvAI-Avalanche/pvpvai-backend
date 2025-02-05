// src/utils/sortObjectKeys.ts
export function sortObjectKeys(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }

    const sortedObj: { [key: string]: any } = {};
    Object.keys(obj)
        .sort()
        .forEach((key) => {
            sortedObj[key] = sortObjectKeys(obj[key]);
        });

    return sortedObj;
} 