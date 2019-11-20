// adapted from create-react-app
module.exports = function BabelConfig(api) {
    if (api.caller(({ name }) => name === 'babel-jest')) {
        // magic NODE_ENV to test when using babel-jest
        // e.g. calling jest via npx on command-line
        process.env.NODE_ENV = 'test'
    }
    return {
        presets: [
            ['@babel/preset-env',
                api.env('test')
                    ? {
                        useBuiltIns: 'usage',
                        corejs: 3,
                        targets: {
                            node: 'current',
                        },
                    } : {
                        useBuiltIns: 'usage',
                        modules: false,
                        corejs: 3,
                        targets: [
                            '> 1.5%',
                            'Opera >= 58',
                            'Safari >= 12',
                            'Edge >= 75',
                            'Firefox ESR',
                            'not dead',
                            'not ie <= 11',
                            'not ie_mob <= 11',
                        ],
                    },
            ],
        ],
        plugins: [
            '@babel/plugin-transform-destructuring',
            ['@babel/plugin-proposal-class-properties', {
                loose: true,
            }],
            ['@babel/plugin-proposal-object-rest-spread', {
                useBuiltIns: true,
            }],
            ['@babel/plugin-transform-runtime', {
                corejs: false,
                helpers: true,
                regenerator: false,
                useESModules: api.env(['development', 'production']),
            }],
        ].filter(Boolean),
    }
}

