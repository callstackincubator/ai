require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Check for MLC-LLM directory
mlc_source_dir = if ENV['MLC_LLM_SOURCE_DIR'] && Dir.exist?(ENV['MLC_LLM_SOURCE_DIR'])
  ENV['MLC_LLM_SOURCE_DIR']
else
  raise "❌ MLC-LLM directory not found! Please set MLC_LLM_SOURCE_DIR environment variable pointing to your MLC-LLM repository"
end

puts "✅ Using MLC-LLM from: #{mlc_source_dir}"

folly_compiler_flags = '-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1 -Wno-comma -Wno-shorten-64-to-32'

Pod::Spec.new do |s|
  s.name         = "react-native-ai"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm}"

  # Define and validate MLC-LLM header paths
  mlc_header_paths = [
    File.join(mlc_source_dir, '3rdparty', 'tvm', 'include'),
    File.join(mlc_source_dir, '3rdparty', 'tvm', '3rdparty', 'dmlc-core', 'include'),
    File.join(mlc_source_dir, '3rdparty', 'tvm', '3rdparty', 'dlpack', 'include')
  ]

  mlc_header_paths.each do |path|
    unless Dir.exist?(path)
      raise "❌ Required MLC-LLM header directory not found: #{path}"
    end
  end

  s.subspec 'MLCEngineObjC' do |ss|
    ss.source_files = 'ios/**/*.{h,m,mm,swift}'
    ss.private_header_files = 'ios/ObjC/Private/*.h'
    ss.pod_target_xcconfig = {
      'HEADER_SEARCH_PATHS' => mlc_header_paths
    }
  end

  # Use install_modules_dependencies helper to install the dependencies if React Native version >=0.71.0.
  # See https://github.com/facebook/react-native/blob/febf6b7f33fdb4904669f99d795eba4c0f95d7bf/scripts/cocoapods/new_architecture.rb#L79.
  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"

    # Don't install the dependencies when we run `pod install` in the old architecture.
    if ENV['RCT_NEW_ARCH_ENABLED'] == '1' then
      s.compiler_flags = folly_compiler_flags + " -DRCT_NEW_ARCH_ENABLED=1"
      s.pod_target_xcconfig    = {
          "HEADER_SEARCH_PATHS" => "\"$(PODS_ROOT)/boost\"",
          "OTHER_CPLUSPLUSFLAGS" => "-DFOLLY_NO_CONFIG -DFOLLY_MOBILE=1 -DFOLLY_USE_LIBCPP=1",
          "CLANG_CXX_LANGUAGE_STANDARD" => "c++17"
      }
      s.dependency "React-Codegen"
      s.dependency "RCT-Folly"
      s.dependency "RCTRequired"
      s.dependency "RCTTypeSafety"
      s.dependency "ReactCommon/turbomodule/core"
    end
  end
end
