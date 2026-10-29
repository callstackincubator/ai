// Harness runs its own entry point instead of the app's index.js, so the web
// streams Expo adds before the entry point and the app's polyfills load here
import 'expo/virtual/streams'
import '../apps/example/polyfills'
