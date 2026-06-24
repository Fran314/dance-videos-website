export const isRecord = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== 'object') return false
    if (value === null) return false
    if (Array.isArray(value)) return false
    const proto: unknown = Object.getPrototypeOf(value)
    if (proto !== Object.prototype && proto !== null) return false
    return true
}

// Cast is safe: keys of Record<T, R> are always T at runtime. TypeScript widens to string by design
export const entries = <T extends string, R>(value: Record<T, R>): [T, R][] => {
    // eslint-disable-next-line no-restricted-syntax
    return Object.entries(value) as [T, R][]
}
export const keys = <T extends string>(value: Record<T, unknown>): T[] => {
    // eslint-disable-next-line no-restricted-syntax
    return Object.keys(value) as T[]
}

export const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    if (bytes < 0) return `-${formatBytes(-bytes)}`
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    const value = bytes / Math.pow(1024, i)
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)}${units[i]}`
}

export const cyrb53 = (str: string, seed = 0): [number, number] => {
    let h1 = 0xdeadbeef ^ seed
    let h2 = 0x41c6ce57 ^ seed
    for (let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i)
        h1 = Math.imul(h1 ^ ch, 2654435761)
        h2 = Math.imul(h2 ^ ch, 1597334677)
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
    return [h1 >>> 0, h2 >>> 0]
}

export const detRandInt = (seed: string): number => {
    const [h1, h2] = cyrb53(seed)
    // max value: (2^21 - 1) * 2^32 + (2^32 - 1) = 2^53 - 1 = Number.MAX_SAFE_INTEGER
    return (h2 >>> 11) * 0x100000000 + h1
}

export const randomInt = (min: number, max: number): number => {
    const range = max - min
    const byteCount = Math.ceil(Math.log2(range) / 8) || 1
    const maxValid = Math.floor(256 ** byteCount / range) * range
    // rejection sampling to avoid modulo bias
    let value: number
    do {
        const bytes = crypto.getRandomValues(new Uint8Array(byteCount))
        value = bytes.reduce((acc, b) => acc * 256 + b, 0)
    } while (value >= maxValid)
    return min + (value % range)
}

export const randomHex = (n: number): string => {
    const bytes = crypto.getRandomValues(new Uint8Array(Math.ceil(n / 2)))
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, n)
}
