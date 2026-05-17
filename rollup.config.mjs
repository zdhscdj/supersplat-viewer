import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default [{
    input: 'src/index.js',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        resolve(),
        copy({
            targets: [{
                src: 'src/index.html',
                dest: 'dist',
                transform: (contents) => {
                    return contents.toString().replace('<base href="">', `<base href="${process.env.BASE_HREF ?? ''}">`);
                }
            }, {
                src: 'src/index.css',
                dest: 'dist'
            }, {
                src: 'src/tools/index.html',
                dest: 'dist/tools'
            }, {
                src: 'src/tools/tool.css',
                dest: 'dist/tools'
            }, {
                src: 'src/tools/tool.js',
                dest: 'dist/tools'
            }, {
                src: 'src/tools/modules',
                dest: 'dist/tools'
            }]
        })
    ]
}];
