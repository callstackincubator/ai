import '@azure/core-asynciterator-polyfill'
import './polyfills'

import { AppRegistry } from 'react-native'

import { name as appName } from './app.json'
import App from './src/App'

AppRegistry.registerComponent(appName, () => App)
