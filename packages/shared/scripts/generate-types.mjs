import fs from 'node:fs'
import yaml from 'yaml'

const spec = yaml.parse(fs.readFileSync('openapi.yaml', 'utf8'))
const schemas = spec.components.schemas

// Schemas marked x-brand in the spec emit a nominal brand: TS cannot express
// their pattern/length, so without this they would collapse to plain `string`
// and lose nominal safety. Everywhere else they are referenced by name via $ref.
const BRAND = 'string & { readonly __brand: unique symbol }'

const refName = ref => ref.replace('#/components/schemas/', '')

const tsType = schema => {
    if (schema.$ref) return refName(schema.$ref)
    if (schema.allOf) return schema.allOf.map(tsType).join(' & ')
    if (schema.enum) return schema.enum.map(v => typeof v === 'string' ? `'${v}'` : JSON.stringify(v)).join(' | ')
    switch (schema.type) {
        case 'array':
            return `${tsType(schema.items)}[]`
        case 'object': {
            if (schema.additionalProperties) {
                const key = schema.propertyNames ? tsType(schema.propertyNames) : 'string'
                return `Record<${key}, ${tsType(schema.additionalProperties)}>`
            }
            const required = new Set(schema.required ?? [])
            const props = Object.entries(schema.properties ?? {}).map(
                ([name, prop]) => `${name}${required.has(name) ? '' : '?'}: ${tsType(prop)}`
            )
            return `{ ${props.join('; ')} }`
        }
        case 'string':
            return 'string'
        case 'number':
        case 'integer':
            return 'number'
        case 'boolean':
            return 'boolean'
        default:
            throw new Error(`Unsupported schema construct: ${JSON.stringify(schema)}`)
    }
}

const FILE_HEADER = `/*\n * GENERATED FILE, DO NOT EDIT.\n * Source of truth: shared/openapi.yaml\n * Regenerate with: npm run generate -w shared\n */\n\n`

const body = Object.entries(schemas)
    .map(([name, schema]) => `export type ${name} = ${schema['x-brand'] ? BRAND : tsType(schema)}`)
    .join('\n')
const content = FILE_HEADER + body + '\n'

// Written to src/generated/ so tsc resolves the types when compiling src/, and
// copied into dist/generated/ so external consumers resolve them against dist/.
// Type-only: no runtime .js is emitted (all imports of these are `import type`).
fs.mkdirSync('src/generated', { recursive: true })
fs.mkdirSync('dist/generated', { recursive: true })
fs.writeFileSync('src/generated/types.d.ts', content)
fs.writeFileSync('dist/generated/types.d.ts', content)
