require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

# Core AI links Apple's coreai-models Swift Package, which needs an iOS 27
# deployment target and does not build for the iOS Simulator, so it is opt-in.
# Set APPLE_CORE_AI=1 at pod install time to link every product the native
# module uses, or list a subset in CORE_AI_PRODUCTS (comma-separated).
core_ai_products = (ENV["CORE_AI_PRODUCTS"] || "").split(",").map(&:strip).reject(&:empty?)
if core_ai_products.empty? && ENV["APPLE_CORE_AI"] == "1"
  core_ai_products = ["CoreAILM", "CoreAIDiffusion", "CoreAISegmentation", "CoreAIObjectDetection"]
end

Pod::Spec.new do |s|
  s.name         = "AppleLLM"

  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => core_ai_products.empty? ? min_ios_version_supported : "27.0" }
  s.source       = { :git => "https://github.com/callstackincubator/ai.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.exclude_files = "ios/Tests/**/*"

  install_modules_dependencies(s)

  unless core_ai_products.empty?
    spm_dependency(s,
      url: "https://github.com/apple/coreai-models",
      requirement: { kind: "upToNextMajorVersion", minimumVersion: "1.0.0" },
      products: core_ai_products
    )
  end
end
