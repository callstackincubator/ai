require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-ai-ncnn-wrapper"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => "13.0" }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}", "cpp/**/*.{h,cpp}"
  s.exclude_files = "ios/build/**/*"

  s.header_mappings_dir = "."
  s.public_header_files = "cpp/**/*.h", "ios/**/*.h"

  ncnn_ios = File.join(__dir__, "vendor", "ncnn-ios")
  if File.directory?(ncnn_ios)
    s.vendored_frameworks = [
      "vendor/ncnn-ios/ncnn.xcframework",
      "vendor/ncnn-ios/glslang.xcframework",
      "vendor/ncnn-ios/openmp.xcframework",
      "vendor/ncnn-ios/vulkan.xcframework"
    ].select { |f| File.directory?(File.join(__dir__, f)) }
  end
  
  # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
  # See https://github.com/facebook/react-native/blob/main/scripts/react_native_pods.rb#L197-L202
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
    s.dependency "React-RCTFabric"
    s.dependency "React-Codegen"
    s.dependency "RCT-Folly"
    s.dependency "RCTRequired"
    s.dependency "RCTTypeSafety"
    s.dependency "ReactCommon/turbomodule/core"
    s.dependency "React-jsi"
    s.dependency "React-callinvoker"
  end
  
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++20",
    "CLANG_CXX_LIBRARY" => "libc++",
    "DEFINES_MODULE" => "YES",
    "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/Headers/Private/React-Core\" \"$(PODS_ROOT)/Headers/Public/React-Core\" \"$(PODS_ROOT)/Headers/Private/ReactCommon\" \"$(PODS_ROOT)/Headers/Public/ReactCommon\"",
    "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -DNCNN_VULKAN=1"
  }
end