const path = require('path')
const pak = require('../../packages/mlc/package.json')

module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    '@babel/plugin-proposal-async-generator-functions',
    [
      'module-resolver',
      {
        extensions: ['.tsx', '.ts', '.js', '.json'],
        alias: {
          [pak.name]: path.join(__dirname, '../../packages/mlc', pak.source),
        },
      },
    ],
  ],
}
