export const PORT = process.env.PORT || 3000

export const VERBOSE_LOG = process.env.VERBOSE_LOG === 'true'
export const LOG_PATH = process.env.LOG_PATH || 'logs'
export const TEMP_PATH = process.env.TEMP_PATH || 'temp'
export const DATA_PATH = process.env.DATA_PATH || 'data'
export const STORAGE_PATH = process.env.STORAGE_PATH || 'storage'
export const BRANDING_PATH = process.env.BRANDING_PATH

export const IS_PRODUCTION = process.env.NODE_ENV === 'production'
export const DIST_DIR = process.env.DIST_DIR
