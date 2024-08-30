import autoExternal from 'rollup-plugin-auto-external';
import babel from 'rollup-plugin-babel';
import nodeResolve from 'rollup-plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { dts } from 'rollup-plugin-dts';

import pkg from './package.json' assert { type: "json" };

const extensions = ['.ts'];

export default [{
    input: 'src/index.ts',
    output: [
        {
            file: 'dist/cjs/easy-template-x.cjs',
            format: 'cjs'
        },
        {
            file: 'dist/es/easy-template-x.mjs',
            format: 'es'
        }
    ],
    plugins: [
        autoExternal(),
        nodeResolve({
            extensions
        }),
        replace({
            // replace options
            preventAssignment: true,

            // keywords:
            EASY_VERSION: JSON.stringify(pkg.version)
        }),
        babel({
            extensions,
        })
    ]
}, {
    input: "./dist/types/index.d.ts",
    output: [
        { file: "dist/es/easy-template-x.d.ts", format: "es" },
        { file: "dist/cjs/easy-template-x.d.ts", format: "cjs" }
    ],
    plugins: [dts()],
},];
