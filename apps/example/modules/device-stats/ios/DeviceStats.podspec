Pod::Spec.new do |s|
  s.name           = 'DeviceStats'
  s.version        = '1.0.0'
  s.summary        = 'Memory footprint and thermal state for the runtime benchmarks'
  s.author         = 'Callstack'
  s.homepage       = 'https://github.com/callstackincubator/ai'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
