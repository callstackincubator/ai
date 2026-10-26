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

  # Link the Apple coreai-models Swift Package products to this pod's target so
  # the native module can import them. Each task the module implements needs
  # one product. To link a subset, list the tasks (comma-separated) in
  # CORE_AI_TASKS at pod install time, or in the Expo config plugin's tasks
  # option, which writes coreAI.tasks to Podfile.properties.json.
  task_products = {
    "language" => "CoreAILM",
    "diffusion" => "CoreAIDiffusion",
    "segmentation" => "CoreAISegmentation",
    "object-detection" => "CoreAIObjectDetection",
    "asr" => "CoreAISpeech",

    "video-segmentation" => "CoreAIVideoSegmentation",
    "video-diffusion" => "CoreAIVideoDiffusion",
  }
  tasks = ENV["CORE_AI_TASKS"]
  if tasks.nil? && defined?(Pod::Config)
    podfile_properties_path = File.join(Pod::Config.instance.installation_root.to_s, "Podfile.properties.json")
    if File.exist?(podfile_properties_path)
      tasks = JSON.parse(File.read(podfile_properties_path))["coreAI.tasks"]
    end
  end
  tasks = tasks.nil? ? task_products.keys : tasks.split(",").map(&:strip).reject(&:empty?)
  unknown_tasks = tasks - task_products.keys
  if tasks.empty? || !unknown_tasks.empty?
    raise "[ReactNativeAICoreAI] Core AI tasks must be some of #{task_products.keys.join(", ")}, got: #{tasks.join(", ")}"
  end
  products = tasks.map { |task| task_products[task] }.uniq

  spm_dependency(s,
    url: "https://github.com/apple/coreai-models",
    requirement: { kind: "upToNextMajorVersion", minimumVersion: "1.0.0" },
    products: products
  )
end
