require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Dynamically resolve the package path using Node.js
resolved_path = `node -p "require.resolve('@react-native-ai/mlc/package.json')"`.chomp
if $?.success?
  package_path = File.dirname(resolved_path)
else
  raise "Failed to resolve package path for react-native-ai-mlc. Make sure Node.js is available and the package is installed."
end

Pod::Spec.new do |s|
  s.name         = "react-native-ai-mlc"
  
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "14.0" }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  
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
    'OTHER_LDFLAGS[sdk=iphoneos*]' => [
      '$(inherited)',
      '-ObjC',
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libmodel_iphone.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libmlc_llm.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libtvm_runtime.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libtvm_ffi_static.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libsentencepiece.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libtokenizers_cpp.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphone/libtokenizers_c.a\""
    ].join(' '),
    'OTHER_LDFLAGS[sdk=iphonesimulator*]' => [
      '$(inherited)',
      '-ObjC',
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libmodel_iphone.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libmlc_llm.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libtvm_runtime.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libtvm_ffi_static.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libsentencepiece.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libtokenizers_cpp.a\"",
      "-force_load \"#{package_path}/prebuilt/ios/lib_iphonesim/libtokenizers_c.a\""
    ].join(' '),
  }
  
  # Framework dependencies
  s.frameworks = ['Metal', 'MetalKit', 'MetalPerformanceShaders']
  s.libraries = ['c++']
  
  # React Native dependencies
  install_modules_dependencies(s)
end
