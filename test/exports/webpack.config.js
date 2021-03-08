/* eslint-disable prefer-template */
/* eslint-disable prefer-destructuring */

process.env.NODE_ENV = process.env.NODE_ENV || 'development' // set a default NODE_ENV

const path = require('path')

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production' || process.env.NODE_ENV === 'production'

    return {
        mode: isProduction ? 'production' : 'development',
        target: 'web',
        entry: {
            commonjs: path.join(__dirname, 'commonjs.js'),
            esm: path.join(__dirname, 'esm.mjs'),
        },
        devtool: false,
        output: {
            filename: '[name].webpacked.js',
        },
        optimization: {
            minimize: false,
        },
        module: {
            rules: [
                {
                    test: /(\.jsx|\.js|\.ts)$/,
                    exclude: /(node_modules|bower_components)/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            configFile: path.resolve(__dirname, '../../.babel.config.js'),
                            babelrc: false,
                            cacheDirectory: true,
                        }
                    }
                },
            ],
        },
        resolve: {
            modules: [path.resolve('./node_modules'), path.resolve('./'), path.resolve('../../node_modules')],
            extensions: ['.json', '.js', '.mjs'],
        },
    }
}
