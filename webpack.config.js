/* global __dirname, require, module*/

const webpack = require('webpack')
const UglifyJsPlugin = require('uglifyjs-webpack-plugin')
const path = require('path')
const env = require('yargs').argv.env // use --env with webpack 2
const target = require('yargs').argv.target // use --env with webpack 2
const pkg = require('./package.json')

let libraryName = pkg.name

let plugins = []
let outputFile =  libraryName + '.' + target

if (env === 'prod') {
    plugins.push(new UglifyJsPlugin())
    outputFile += '.min.js'
} else {
    outputFile += '.js'
}

// Config which is common to both web and node builds
const config = {
    entry: __dirname + '/src/index.js',
    devtool: 'source-map',
    target: target,
    output: {
        path: __dirname + '/dist',
        filename: outputFile,
        library: {
            root: 'StreamrClient',
            amd: libraryName,
            commonjs: libraryName
        },
        libraryTarget: 'umd',
        umdNamedDefine: true
    },
    module: {
        rules: [
            {
                test: /(\.jsx|\.js)$/,
                loader: 'babel-loader',
                exclude: /(node_modules|bower_components)/
            },
            {
                test: /(\.jsx|\.js)$/,
                loader: 'eslint-loader',
                exclude: /node_modules/
            }
        ]
    },
    resolve: {
        modules: [path.resolve('./node_modules'), path.resolve('./src')],
        extensions: ['.json', '.js']
    },
    plugins: plugins
}

module.exports = config
