import fs from 'node:fs'
import yaml from 'yaml'
import Ajv from 'ajv/dist/2020.js'
import { _ } from 'ajv/dist/compile/codegen/index.js'
import addFormats from 'ajv-formats'
import standaloneCode from 'ajv/dist/standalone/index.js'
import * as esbuild from 'esbuild'

const spec = yaml.parse(fs.readFileSync('openapi.yaml', 'utf8'))
const schemas = spec.components.schemas

// strict: false is required because the registered document contains
// 'components' which is not a JSON Schema keyword.
const ajv = new Ajv({
    code: { source: true, esm: true },
    allErrors: true,
    strict: false,
})
addFormats(ajv)

// Custom keywords for the two rules that JSON Schema cannot express. They are
// 'code' keywords (the only kind, besides 'macro', that survives standalone
// codegen) so the check is inlined into the bundled validator. Both are marked
// in openapi.yaml via the matching x- vendor extensions.
ajv.addKeyword({
    keyword: 'x-protoExclude',
    type: 'string',
    schemaType: 'boolean',
    code(cxt) {
        cxt.fail(_`${cxt.data} in Object.prototype`)
    },
})
ajv.addKeyword({
    keyword: 'x-yearModular',
    type: 'string',
    schemaType: 'boolean',
    // Assumes the pattern keyword already constrained the shape to NN/NN.
    code(cxt) {
        cxt.pass(
            _`(parseInt(${cxt.data}.slice(0,2),10)+1)%100===parseInt(${cxt.data}.slice(3,5),10)`,
        )
    },
})

// Wrap schemas under components so $ref: '#/components/schemas/X' resolves
// via JSON pointer within this document.
ajv.addSchema({ components: { schemas } }, 'spec')

const refs = Object.fromEntries(
    Object.keys(schemas).map(name => [
        `is${name}`,
        `spec#/components/schemas/${name}`,
    ]),
)

const rawCode = standaloneCode(ajv, refs)

// ajv standalone emits CJS require() for runtime helpers (e.g. ucs2length)
// even when esm: true. Bundle with esbuild to inline all dependencies,
// producing a self-contained ESM file with no runtime dependency on ajv.
// This is the canonical approach per ajv docs: https://ajv.js.org/standalone.html
const bundled = await esbuild.build({
    stdin: {
        contents: rawCode,
        loader: 'js',
        resolveDir: process.cwd(),
    },
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    write: false,
    legalComments: 'none',
})

const FILE_HEADER = `/*\n * GENERATED FILE, DO NOT EDIT.\n * Source of truth: shared/openapi.yaml\n * Regenerate with: npm run generate -w shared\n */\n\n`
const EXPORT_HEADER = '// generated, do not edit, read header at top of file\n'

const bundledCode = bundled.outputFiles[0].text
// esbuild emits a single export block at the end of the bundle. Annotate it.
const annotatedExports = bundledCode.replace(
    /^export\s*\{/m,
    EXPORT_HEADER + 'export {',
)

// The runtime .js is a build artifact: it belongs in dist/, where consumers
// resolve it via the package's import path. Keeping it out of src/ avoids
// confusing source-level tools (eslint, tsc project service) that walk src/.
fs.mkdirSync('dist/generated', { recursive: true })
const jsContent = FILE_HEADER + annotatedExports
fs.writeFileSync('dist/generated/validators.js', jsContent)

// .d.ts goes in src/generated/ so tsc can resolve types when compiling src/,
// and is also copied into dist/generated/ so external consumers (backend,
// frontend) can resolve types against the published dist/ tree.
// CRITICAL: validators are typed as TS type guards over branded types
// (`data is User`, with User using branded Id/NonEmptySafeStr fields). This
// means parsers narrow directly to branded types with no casts at the trust
// boundary, and downstream code keeps full nominal type safety.
const schemaNames = Object.keys(schemas)
const dtsImport = `import type {\n    ${schemaNames.join(',\n    ')},\n} from './types.js'\n\n`

const dtsBody = schemaNames
    .map(
        name =>
            `${EXPORT_HEADER}export declare const is${name}: ((data: unknown) => data is ${name}) & { errors: unknown[] | null }`,
    )
    .join('\n')
const dtsContent = FILE_HEADER + dtsImport + dtsBody + '\n'
fs.mkdirSync('src/generated', { recursive: true })
fs.writeFileSync('src/generated/validators.d.ts', dtsContent)
fs.writeFileSync('dist/generated/validators.d.ts', dtsContent)
