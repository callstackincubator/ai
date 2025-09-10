require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-ai-mlc"
  
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "14.0" }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"
  
  # Use prebuilt static libraries shipped with the package
  s.vendored_libraries = [
    'prebuilt/ios/lib/libmlc_llm.a',
    'prebuilt/ios/lib/libmodel_iphone.a',
    'prebuilt/ios/lib/libsentencepiece.a',
    'prebuilt/ios/lib/libtokenizers_c.a',
    'prebuilt/ios/lib/libtokenizers_cpp.a',
    'prebuilt/ios/lib/libtvm_ffi_static.a',
    'prebuilt/ios/lib/libtvm_runtime.a'
  ]
  
  # Include bundle configuration
  s.resources = ['prebuilt/ios/bundle/**/*']
  
  # Compiler configuration
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/ios" "$(PODS_TARGET_SRCROOT)/prebuilt/ios/include"',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'LIBRARY_SEARCH_PATHS' => '"$(PODS_TARGET_SRCROOT)/prebuilt/ios/lib"'
  }
  
  # User target configuration to ensure static libraries are force loaded
  s.user_target_xcconfig = {
    'OTHER_LDFLAGS' => [
      '$(inherited)',
      '-ObjC',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libmlc_llm.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libtvm_runtime.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libtvm_ffi_static.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libmodel_iphone.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libsentencepiece.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libtokenizers_cpp.a"',
      '-force_load "$(PODS_ROOT)/../../../../packages/mlc/prebuilt/ios/lib/libtokenizers_c.a"'
    ].join(' ')
  }
  
  # Framework dependencies
  s.frameworks = ['Metal', 'MetalKit', 'MetalPerformanceShaders']
  s.libraries = ['c++']
  
  # React Native dependencies
  install_modules_dependencies(s)
end
