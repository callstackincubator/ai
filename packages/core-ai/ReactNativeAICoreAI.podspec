require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "ReactNativeAICoreAI"

  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  # apple/coreai-models declares iOS 27 as its minimum platform
  s.platforms    = { :ios => "27.0" }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.exclude_files = "ios/Tests/**/*"

  install_modules_dependencies(s)

  # Core AI language models run through Foundation Models' LanguageModelSession,
  # so the prompt and transcript helpers come from @react-native-ai/apple
  s.dependency "AppleLLM"

  # Link Apple's Core AI Swift Package products to this pod's target so the
  # native module can import them. Set CORE_AI_PRODUCTS (comma-separated) at
  # pod install time to link a subset.
  products = (ENV["CORE_AI_PRODUCTS"] || "CoreAILM,CoreAIDiffusion,CoreAISegmentation,CoreAIObjectDetection")
    .split(",").map(&:strip).reject(&:empty?)

  spm_dependency(s,
    url: "https://github.com/apple/coreai-models",
    requirement: { kind: "upToNextMajorVersion", minimumVersion: "1.0.0" },
    products: products
  )
end
