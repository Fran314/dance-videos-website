import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
    isId,
    isToken,
    isHash,
    isSafeStr,
    isNonEmptySafeStr,
    isYearStr,
    isDateStr,
    isUser,
    isUsers,
    isPublicUser,
    isVideo,
    isCourseSummary,
    isCourse,
    isCourses,
    isSelfUser,
    isAddUserParams,
    isCourseIdParams,
    isCourseVideoParams,
    isHashParams,
    isUploadChunkParams,
    isLoginBody,
    isAddUserBody,
    isAddCourseBody,
    isAddVideoBody,
    isUpdateVideoBody,
    isInitUploadBody,
    isInitUploadResponse,
    isFinalizeUploadResponse,
} from '../dist/generated/validators.js'

const ok = (fn, value) =>
    assert.equal(fn(value), true, `expected valid: ${JSON.stringify(value)}`)
const fail = (fn, value) =>
    assert.equal(fn(value), false, `expected invalid: ${JSON.stringify(value)}`)

const ID = 'ab12cd34'
const TOKEN = 'a'.repeat(64)
const HASH = 'b'.repeat(16)
const VIDEO = {
    date: '2024-01-15',
    label: 'intro',
    uploadTimestamp: 0,
    status: 'converted',
    conversionProgress: 1,
    originalCodec: 'h264',
    convertedCodec: 'h264',
}
const COURSE_SUMMARY = { displayName: 'Swing', year: '24/25' }
const COURSE = { ...COURSE_SUMMARY, videos: { [ID]: VIDEO } }

describe('Id', () => {
    it('accepts 8 lowercase hex chars', () => ok(isId, 'ab12cd34'))
    it('accepts all-digit hex', () => ok(isId, '00000000'))
    it('rejects 7 chars', () => fail(isId, 'ab12cd3'))
    it('rejects 9 chars', () => fail(isId, 'ab12cd345'))
    it('rejects uppercase', () => fail(isId, 'AB12CD34'))
    it('rejects non-hex', () => fail(isId, 'zb12cd34'))
    it('rejects non-string', () => fail(isId, 42))
})

describe('Token', () => {
    it('accepts 64 lowercase hex chars', () => ok(isToken, TOKEN))
    it('rejects 63 chars', () => fail(isToken, TOKEN.slice(1)))
    it('rejects 65 chars', () => fail(isToken, TOKEN + 'a'))
    it('rejects uppercase', () => fail(isToken, TOKEN.toUpperCase()))
})

describe('Hash', () => {
    it('accepts 16 lowercase hex chars', () => ok(isHash, HASH))
    it('rejects 15 chars', () => fail(isHash, HASH.slice(1)))
    it('rejects 17 chars', () => fail(isHash, HASH + 'a'))
})

describe('SafeStr', () => {
    it('accepts empty string', () => ok(isSafeStr, ''))
    it('accepts normal string', () => ok(isSafeStr, 'hello world'))
    it('accepts 255-char string', () => ok(isSafeStr, 'a'.repeat(255)))
    it('rejects 256-char string', () => fail(isSafeStr, 'a'.repeat(256)))
    it('rejects non-string', () => fail(isSafeStr, 42))
    it('rejects __proto__', () => fail(isSafeStr, '__proto__'))
})

describe('NonEmptySafeStr', () => {
    it('accepts non-empty string', () => ok(isNonEmptySafeStr, 'alice'))
    it('rejects empty string', () => fail(isNonEmptySafeStr, ''))
    it('rejects 256-char string', () =>
        fail(isNonEmptySafeStr, 'a'.repeat(256)))
    it('rejects constructor', () => fail(isNonEmptySafeStr, 'constructor'))
})

describe('YearStr', () => {
    it('accepts matching pattern', () => ok(isYearStr, '24/25'))
    it('accepts 99/00', () => ok(isYearStr, '99/00'))
    it('rejects 4-digit years', () => fail(isYearStr, '2024/2025'))
    it('rejects wrong separator', () => fail(isYearStr, '24-25'))
    it('rejects non-string', () => fail(isYearStr, 2425))
    it('rejects non-modular pair', () => fail(isYearStr, '99/99'))
})

describe('DateStr', () => {
    it('accepts valid date format', () => ok(isDateStr, '2024-01-15'))
    it('rejects missing day', () => fail(isDateStr, '2024-01'))
    it('rejects wrong separator', () => fail(isDateStr, '2024/01/15'))
    it('rejects non-string', () => fail(isDateStr, 20240115))
})

describe('Video', () => {
    it('accepts valid video', () => ok(isVideo, VIDEO))
    it('rejects missing status', () =>
        fail(isVideo, { ...VIDEO, status: undefined }))
    it('rejects invalid status enum', () =>
        fail(isVideo, { ...VIDEO, status: 'unknown' }))
    it('rejects string uploadTimestamp', () =>
        fail(isVideo, { ...VIDEO, uploadTimestamp: '0' }))
})

describe('CourseSummary', () => {
    it('accepts valid summary', () => ok(isCourseSummary, COURSE_SUMMARY))
    it('rejects empty displayName', () =>
        fail(isCourseSummary, { displayName: '', year: '24/25' }))
    it('rejects missing year', () =>
        fail(isCourseSummary, { displayName: 'Swing' }))
})

describe('Course', () => {
    it('accepts valid course', () => ok(isCourse, COURSE))
    it('accepts course with no videos', () =>
        ok(isCourse, { ...COURSE_SUMMARY, videos: {} }))
    it('rejects invalid video key (propertyNames check)', () =>
        fail(isCourse, { ...COURSE_SUMMARY, videos: { 'not-an-id': VIDEO } }))
    it('rejects missing videos', () => fail(isCourse, COURSE_SUMMARY))
})

describe('Courses (propertyNames must be Id)', () => {
    it('accepts valid courses map', () => ok(isCourses, { [ID]: COURSE }))
    it('accepts empty map', () => ok(isCourses, {}))
    it('rejects non-Id key', () => fail(isCourses, { 'not-an-id': COURSE }))
    it('rejects key that is too short', () => fail(isCourses, { ab12: COURSE }))
})

describe('User', () => {
    const USER = { password: 'secret', admin: false, courses: [ID] }
    it('accepts valid user', () => ok(isUser, USER))
    it('rejects empty password', () => fail(isUser, { ...USER, password: '' }))
    it('rejects non-boolean admin', () =>
        fail(isUser, { ...USER, admin: 'true' }))
    it('rejects non-Id in courses array', () =>
        fail(isUser, { ...USER, courses: ['bad'] }))
})

describe('Users (propertyNames must be NonEmptySafeStr)', () => {
    const USER = { password: 'secret', admin: false, courses: [] }
    it('accepts valid users map', () => ok(isUsers, { alice: USER }))
    it('accepts empty map', () => ok(isUsers, {}))
    it('rejects empty string key', () => fail(isUsers, { '': USER }))
    it('rejects too-long key', () => fail(isUsers, { ['a'.repeat(256)]: USER }))
})

describe('PublicUser', () => {
    it('accepts valid public user', () =>
        ok(isPublicUser, { admin: true, courses: [ID] }))
    it('rejects missing courses', () => fail(isPublicUser, { admin: true }))
})

describe('SelfUser (courses propertyNames must be Id)', () => {
    const SELF = {
        username: 'alice',
        admin: false,
        courses: { [ID]: COURSE_SUMMARY },
    }
    it('accepts valid self user', () => ok(isSelfUser, SELF))
    it('rejects non-Id course key', () =>
        fail(isSelfUser, { ...SELF, courses: { 'bad-key': COURSE_SUMMARY } }))
    it('rejects empty username', () =>
        fail(isSelfUser, { ...SELF, username: '' }))
    it('rejects non-boolean admin', () =>
        fail(isSelfUser, { ...SELF, admin: 1 }))
})

describe('AddUserParams', () => {
    it('accepts valid params', () => ok(isAddUserParams, { username: 'alice' }))
    it('rejects empty username', () => fail(isAddUserParams, { username: '' }))
    it('rejects missing username', () => fail(isAddUserParams, {}))
    it('rejects Object.prototype-key username', () =>
        fail(isAddUserParams, { username: 'constructor' }))
})

describe('CourseIdParams', () => {
    it('accepts valid params', () => ok(isCourseIdParams, { courseId: ID }))
    it('rejects non-Id courseId', () =>
        fail(isCourseIdParams, { courseId: 'bad' }))
})

describe('CourseVideoParams', () => {
    it('accepts valid params', () =>
        ok(isCourseVideoParams, { courseId: ID, videoId: ID }))
    it('rejects non-Id videoId', () =>
        fail(isCourseVideoParams, { courseId: ID, videoId: 'bad' }))
    it('rejects missing videoId', () =>
        fail(isCourseVideoParams, { courseId: ID }))
})

describe('HashParams', () => {
    it('accepts valid params', () => ok(isHashParams, { hash: HASH }))
    it('rejects non-Hash hash', () => fail(isHashParams, { hash: 'bad' }))
})

describe('UploadChunkParams', () => {
    it('accepts valid params', () =>
        ok(isUploadChunkParams, { hash: HASH, idx: '0' }))
    it('rejects missing idx', () => fail(isUploadChunkParams, { hash: HASH }))
    it('rejects non-Hash hash', () =>
        fail(isUploadChunkParams, { hash: 'bad', idx: '0' }))
})

describe('LoginBody', () => {
    it('accepts valid body', () =>
        ok(isLoginBody, { username: 'alice', password: 'secret' }))
    it('rejects empty username', () =>
        fail(isLoginBody, { username: '', password: 'secret' }))
    it('rejects missing password', () =>
        fail(isLoginBody, { username: 'alice' }))
})

describe('AddUserBody', () => {
    it('accepts valid body', () =>
        ok(isAddUserBody, { password: 'pw', admin: false, courses: [ID] }))
    it('rejects empty password', () =>
        fail(isAddUserBody, { password: '', admin: false, courses: [] }))
    it('rejects string admin', () =>
        fail(isAddUserBody, { password: 'pw', admin: 'false', courses: [] }))
    it('rejects non-Id in courses', () =>
        fail(isAddUserBody, { password: 'pw', admin: false, courses: ['bad'] }))
})

describe('AddCourseBody', () => {
    it('accepts valid body', () =>
        ok(isAddCourseBody, { displayName: 'Swing', year: '24/25' }))
    it('rejects empty displayName', () =>
        fail(isAddCourseBody, { displayName: '', year: '24/25' }))
    it('rejects invalid year format', () =>
        fail(isAddCourseBody, { displayName: 'Swing', year: '2024' }))
    it('rejects non-modular nested year', () =>
        fail(isAddCourseBody, { displayName: 'Swing', year: '99/99' }))
})

describe('AddVideoBody', () => {
    it('accepts valid body', () =>
        ok(isAddVideoBody, { date: '2024-01-15', label: 'intro', file: TOKEN }))
    it('rejects invalid date', () =>
        fail(isAddVideoBody, {
            date: 'not-a-date',
            label: 'intro',
            file: TOKEN,
        }))
    it('rejects non-Token file', () =>
        fail(isAddVideoBody, {
            date: '2024-01-15',
            label: 'intro',
            file: 'bad',
        }))
})

describe('UpdateVideoBody', () => {
    it('accepts valid body', () =>
        ok(isUpdateVideoBody, { date: '2024-01-15', label: 'intro' }))
    it('rejects missing label', () =>
        fail(isUpdateVideoBody, { date: '2024-01-15' }))
})

describe('InitUploadBody', () => {
    it('accepts positive integer', () => ok(isInitUploadBody, { size: 1 }))
    it('accepts large size', () => ok(isInitUploadBody, { size: 5242880 }))
    it('rejects zero', () => fail(isInitUploadBody, { size: 0 }))
    it('rejects negative', () => fail(isInitUploadBody, { size: -1 }))
    it('rejects float', () => fail(isInitUploadBody, { size: 1.5 }))
})

describe('InitUploadResponse', () => {
    it('accepts array of integers', () => ok(isInitUploadResponse, [0, 1, 2]))
    it('accepts empty array', () => ok(isInitUploadResponse, []))
    it('rejects array with float', () => fail(isInitUploadResponse, [0, 1.5]))
    it('rejects non-array', () => fail(isInitUploadResponse, 42))
})

describe('FinalizeUploadResponse', () => {
    it('accepts valid response', () =>
        ok(isFinalizeUploadResponse, { token: TOKEN }))
    it('rejects non-Token token', () =>
        fail(isFinalizeUploadResponse, { token: 'bad' }))
    it('rejects missing token', () => fail(isFinalizeUploadResponse, {}))
})
