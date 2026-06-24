import {
    isId,
    isToken,
    isHash,
    isNonEmptySafeStr,
    isYearStr,
    isDateStr,
} from './generated/validators.js'
import type {
    Id,
    Token,
    Hash,
    NonEmptySafeStr,
    YearStr,
    DateStr,
} from './generated/types.js'
import { cyrb53, randomHex, randomInt, entries } from './utils.js'

export type WithId<T> = T & { id: Id }

export const randomId = (): Id => {
    const id = randomHex(8)
    if (!isId(id)) throw new Error(`randomId generated invalid id: ${id}`)
    return id
}

export const randomNewId = (existingIds: Id[]): Id => {
    let output = randomId()
    while (existingIds.includes(output)) output = randomId()
    return output
}

export const randomToken = (): Token => {
    const token = randomHex(64)
    if (!isToken(token))
        throw new Error(`randomToken generated invalid token: ${token}`)
    return token
}

export const cyrb53Hash = (str: string): Hash => {
    const [h1, h2] = cyrb53(str)
    const hash =
        h2.toString(16).padStart(8, '0') + h1.toString(16).padStart(8, '0')
    if (!isHash(hash))
        throw new Error(`cyrb53Hash generated invalid hash: ${hash}`)
    return hash
}

export const randomPassword = (): NonEmptySafeStr => {
    const LENGTH = 12
    // Excludes ambiguous characters: 0, O, o, 1, l, I, i
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    const password = Array.from(
        { length: LENGTH },
        () => chars[randomInt(0, chars.length)],
    ).join('')
    if (!isNonEmptySafeStr(password))
        throw new Error(
            `randomPassword generated invalid password: ${password}`,
        )
    return password
}

export const makeYearStr = (startYear: number): YearStr => {
    const start = (startYear % 100).toString().padStart(2, '0')
    const end = ((startYear + 1) % 100).toString().padStart(2, '0')
    const yearStr = `${start}/${end}`
    if (!isYearStr(yearStr))
        throw new Error(`makeYearStr generated invalid YearStr: ${yearStr}`)
    return yearStr
}

export const getCurrYearStr = (): YearStr => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    // August (month 7) or later means the working year started in the current calendar year.
    return makeYearStr(month >= 7 ? year : year - 1)
}

const DATE_RE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/

export const splitDateStr = (
    date: DateStr,
): { year: string; month: string; day: string } => {
    const match = date.match(DATE_RE)
    if (match == null || match.groups === undefined)
        throw new Error(`Invalid DateStr: ${date}`)
    const { year, month, day } = match.groups
    if (year === undefined || month === undefined || day === undefined)
        throw new Error(`Invalid DateStr: ${date}`)
    return { year, month, day }
}

export const makeDateStr = (
    year: string,
    month: string,
    day: string,
): DateStr => {
    const dateStr = `${year}-${month}-${day}`
    if (!isDateStr(dateStr))
        throw new Error(`makeDateStr generated invalid DateStr: ${dateStr}`)
    return dateStr
}

export const getCurrDateStr = (): DateStr => {
    const currentDate = new Date()
    const year = String(currentDate.getFullYear())
    const month = String(currentDate.getMonth() + 1).padStart(2, '0')
    const day = String(currentDate.getDate()).padStart(2, '0')
    return makeDateStr(year, month, day)
}

export const listWithId = <T>(arg: Record<Id, T>): WithId<T>[] =>
    entries(arg).map(([key, value]) => ({ ...value, id: key }))
