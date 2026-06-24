import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import neverthrow from '@bufferings/eslint-plugin-neverthrow'
import pluginVue from 'eslint-plugin-vue'

export default defineConfig(
    ...tseslint.configs.recommendedTypeChecked,
    ...pluginVue.configs['flat/essential'],
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
                extraFileExtensions: ['.vue'],
            },
        },
    },
    {
        files: ['**/*.vue'],
        languageOptions: {
            parserOptions: {
                parser: tseslint.parser,
            },
        },
    },
    {
        files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.vue'],
        plugins: {
            neverthrow,
        },
        rules: {
            'neverthrow/must-use-result': 'error',

            // Bans `as Type` and `<Type>x` casts except:
            //   - `as const` (type narrowing, not an unsafe cast)
            //   - `as HTML*` DOM types (necessary boundary cast for `event.target`,
            //     `Element.namedItem`, etc., which TS types loosely)
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "TSAsExpression[typeAnnotation.type='TSTypeReference'][typeAnnotation.typeName.name!=/^(const|HTML[A-Z][a-zA-Z]*)$/]",
                    message:
                        "Do not use type assertions ('as'). Use type guards or factory functions instead.",
                },
                {
                    selector:
                        "TSAsExpression:not([typeAnnotation.type='TSTypeReference'])",
                    message:
                        "Do not use type assertions ('as'). Use type guards or factory functions instead.",
                },
                {
                    selector: 'TSTypeAssertion',
                    message:
                        'Do not use angle-bracket type assertions. Use type guards or factory functions instead.',
                },
            ],

            // tseslint's no-unsafe-* family fires hundreds of false positives on
            // Pinia store access (via templates and $subscribe callbacks) because
            // tseslint resolves defineStore's return less precisely than vue-tsc.
            // vue-tsc still catches the real type errors at build time.
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-redundant-type-constituents': 'off',

            // Component file names like Alert.vue are single-word
            // by convention here. Disabling the rule rather than renaming.
            'vue/multi-word-component-names': 'off',

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    args: 'all',
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    ignoreRestSiblings: true,
                },
            ],
        },
    },
)
