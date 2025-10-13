#import <React/RCTEventEmitter.h>
#import <ReactCommon/RCTTurboModule.h>

#import <jsi/jsi.h>
#import <NativeMLCEngine/NativeMLCEngine.h>

#import "LLMEngine.h"

@interface MLCEngine : NativeMLCEngineSpecBase <NativeMLCEngineSpec>

@property(nonatomic, strong) LLMEngine* engine;
@property(nonatomic, strong) NSURL* bundleURL;
@property(nonatomic, strong) NSDictionary* cachedAppConfig;
@property(nonatomic, strong) NSArray* cachedModelList;

@end

using namespace facebook;

@implementation MLCEngine

+ (NSString *)moduleName {
  return @"MLCEngine";
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _engine = [[LLMEngine alloc] init];
    
    // Get the Documents directory path for downloaded models
    NSArray* paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString* documentsDirectory = [paths firstObject];
    _bundleURL = [NSURL fileURLWithPath:[documentsDirectory stringByAppendingPathComponent:@"bundle"]];
    
    // Create bundle directory if it doesn't exist (for downloaded models)
    NSError* dirError;
    [[NSFileManager defaultManager] createDirectoryAtPath:[_bundleURL path] withIntermediateDirectories:YES attributes:nil error:&dirError];
    if (dirError) {
      NSLog(@"Error creating bundle directory: %@", dirError);
    }
  }
  return self;
}

// Lazy getter for app config with caching - read directly from bundle
- (NSDictionary*)getAppConfig {
  if (_cachedAppConfig) {
    return _cachedAppConfig;
  }
  
  // Read config from main bundle resources
  NSBundle* bundle = [NSBundle mainBundle];
  NSString* configPath = [bundle pathForResource:@"mlc-app-config" ofType:@"json"];
  
  if (!configPath) {
    NSLog(@"Failed to find mlc-chat-config.json in bundle");
    return nil;
  }
  
  NSData* jsonData = [NSData dataWithContentsOfFile:configPath];
  if (!jsonData) {
    NSLog(@"Failed to read app config from: %@", configPath);
    return nil;
  }
  
  NSError* error;
  NSDictionary* jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
  
  if (error) {
    NSLog(@"Error parsing app config JSON: %@", error);
    return nil;
  }
  
  if (![jsonDict isKindOfClass:[NSDictionary class]]) {
    NSLog(@"Invalid app config format");
    return nil;
  }
  
  _cachedAppConfig = jsonDict;
  
  return _cachedAppConfig;
}

// Get cached model list
- (NSArray*)getModelList {
  if (_cachedModelList) {
    return _cachedModelList;
  }
  NSDictionary* appConfig = [self getAppConfig];
  if (appConfig) {
    _cachedModelList = appConfig[@"model_list"];
  }
  return _cachedModelList;
}

// Find model by ID with caching
- (NSDictionary*)findModelById:(NSString*)modelId {
  NSArray* modelList = [self getModelList];
  for (NSDictionary* model in modelList) {
    if ([model[@"model_id"] isEqualToString:modelId]) {
      return model;
    }
  }
  return nil;
}


- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeMLCEngineSpecJSI>(params);
}

// Helper method to build complete request with messages and options
- (NSDictionary*)buildRequestWithMessages:(NSArray*)messages options:(const JS::NativeMLCEngine::GenerationOptions &)options {
  NSMutableDictionary *request = [@{@"messages": messages, @"stream": @(YES)} mutableCopy];
  
  if (options.temperature().has_value()) {
    request[@"temperature"] = @(options.temperature().value());
  }
  if (options.maxTokens().has_value()) {
    request[@"max_tokens"] = @(options.maxTokens().value());
  }
  if (options.topP().has_value()) {
    request[@"top_p"] = @(options.topP().value());
  }
  if (options.topK().has_value()) {
    request[@"top_k"] = @(options.topK().value());
  }
  if (options.responseFormat().has_value()) {
    auto responseFormat = options.responseFormat().value();
    NSMutableDictionary *responseFormatDict = [NSMutableDictionary dictionary];
    if (responseFormat.type()) {
      responseFormatDict[@"type"] = responseFormat.type();
    }
    if (responseFormat.schema()) {
      responseFormatDict[@"schema"] = responseFormat.schema();
    }
    request[@"response_format"] = responseFormatDict;
  }
  if (options.tools()) {
    request[@"tools"] = options.tools();
  }
  if (options.toolChoice()) {
    request[@"tool_choice"] = options.toolChoice();
  }
  
  return request;
}

- (void)generateText:(NSArray<NSDictionary*>*)messages
             options:(JS::NativeMLCEngine::GenerationOptions &)options
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  NSDictionary *request = [self buildRequestWithMessages:messages options:options];
  
  NSMutableString* accumulatedContent = [NSMutableString new];
  NSMutableArray* accumulatedToolCalls = [NSMutableArray new];
  
  __block NSString* finalFinishReason = nil;
  __block NSString* finalRole = nil;
  
  [self.engine chatCompletionWithMessages:messages
                                  options:request
                               completion:^(NSDictionary* response) {
    if (response[@"usage"]) {
      resolve(@{
        @"role": finalRole,
        @"content": accumulatedContent,
        @"tool_calls": accumulatedToolCalls,
        @"finish_reason": finalFinishReason,
        @"usage": response[@"usage"],
      });
      return;
    }
    
    NSDictionary* choice = response[@"choices"][0];
    if (choice) {
      NSDictionary* delta = choice[@"delta"];
      if (delta[@"content"]) {
        [accumulatedContent appendString:delta[@"content"]];
      }
      if (delta[@"role"]) {
        finalRole = delta[@"role"];
      }
      if (delta[@"tool_calls"]) {
        [accumulatedToolCalls addObjectsFromArray:delta[@"tool_calls"]];
      }
      if (choice[@"finish_reason"]) {
        finalFinishReason = choice[@"finish_reason"];
      }
    }
  }];
}

- (void)streamText:(NSArray<NSDictionary*>*)messages
           options:(JS::NativeMLCEngine::GenerationOptions &)options
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
  
  NSDictionary *request = [self buildRequestWithMessages:messages options:options];
  
  __block NSString* finalFinishReason = nil;
  
  @try {
    NSString *requestId = [self.engine chatCompletionWithMessages:messages
                                                          options:request
                                                       completion:^(NSDictionary* response) {
      if (response[@"usage"]) {
        [self emitOnChatComplete:@{
          @"usage": response[@"usage"],
          @"finish_reason": finalFinishReason
        }];
        return;
      }
      
      NSDictionary* choice = response[@"choices"][0];
      if (choice[@"finish_reason"]) {
        finalFinishReason = choice[@"finish_reason"];
      }
      
      [self emitOnChatUpdate:choice];
    }];
    
    resolve(requestId);
  } @catch (NSException* exception) {
    reject(@"MLCEngine", exception.reason, nil);
    return;
  }
}

- (void)getModel:(NSString*)name
         resolve:(RCTPromiseResolveBlock)resolve
          reject:(RCTPromiseRejectBlock)reject {
  NSDictionary* modelConfig = [self findModelById:name];
  if (!modelConfig) {
    reject(@"MLCEngine", @"Didn't find the model", nil);
    return;
  }
  resolve(modelConfig);
}

- (void)getModels:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject {
  resolve([self getModelList]);
}

- (void)prepareModel:(NSString*)modelId
             resolve:(RCTPromiseResolveBlock)resolve
              reject:(RCTPromiseRejectBlock)reject {
  @try {
    NSDictionary* modelRecord = [self findModelById:modelId];
    if (!modelRecord) {
      reject(@"MLCEngine", @"There's no record for requested model", nil);
      return;
    }
    
    NSString* modelLib = modelRecord[@"model_lib"];
    if (!modelLib) {
      reject(@"MLCEngine", @"Invalid model config - missing required fields", nil);
      return;
    }
    
    NSURL* modelLocalURL = [self.bundleURL URLByAppendingPathComponent:modelId];
    if (!modelLocalURL) {
      reject(@"MLCEngine", @"Failed to construct model path", nil);
      return;
    }
    
    NSString* modelLocalPath = [modelLocalURL path];
    
    BOOL isDirectory;
    if (![[NSFileManager defaultManager] fileExistsAtPath:modelLocalPath isDirectory:&isDirectory] || !isDirectory) {
      reject(@"MLCEngine", [NSString stringWithFormat:@"Model directory not found at path: %@", modelLocalPath], nil);
      return;
    }
    
    [self.engine reloadWithModelPath:modelLocalPath modelLib:modelLib];
    
    resolve([NSString stringWithFormat:@"Model prepared: %@", modelId]);
  } @catch (NSException* exception) {
    reject(@"MLCEngine", exception.reason, nil);
  }
}

- (NSDictionary*)readModelConfig:(NSString*)modelId error:(NSError**)error {
  NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelId];
  NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];
  
  NSData* jsonData = [NSData dataWithContentsOfURL:modelConfigURL];
  if (!jsonData) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine" code:1 userInfo:@{NSLocalizedDescriptionKey : @"Model config not found - may need to download first"}];
    }
    return nil;
  }
  
  return [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:error];
}

- (BOOL)downloadFile:(NSString*)modelUrl filename:(NSString*)filename toURL:(NSURL*)destURL error:(NSError**)error {
  NSString* urlString = [NSString stringWithFormat:@"%@/resolve/main/%@", modelUrl, filename];
  NSURL* url = [NSURL URLWithString:urlString];
  
  NSData* fileData = [NSData dataWithContentsOfURL:url];
  if (!fileData) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine"
                                   code:2
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to download %@", filename]}];
    }
    return NO;
  }
  
  if (![fileData writeToURL:destURL atomically:YES]) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine"
                                   code:6
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to write %@", filename]}];
    }
    return NO;
  }
  
  return YES;
}

// Download all model files with percentage updates
- (void)downloadModelFiles:(NSDictionary*)modelRecord
                  progress:(void (^)(double percentage))progressCallback
                     error:(NSError**)error {
  NSString* modelId = modelRecord[@"model_id"];
  NSString* modelUrl = modelRecord[@"model_url"];
  
  if (!modelId || !modelUrl) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine" code:3 userInfo:@{NSLocalizedDescriptionKey : @"Missing required model record fields"}];
    }
    return;
  }
  
  // Check if config already exists
  NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelId];
  NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];
  NSURL* ndarrayCacheURL = [modelDirURL URLByAppendingPathComponent:@"ndarray-cache.json"];
  
  if (!modelDirURL || !modelConfigURL) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine" code:4 userInfo:@{NSLocalizedDescriptionKey : @"Failed to construct config URLs"}];
    }
    return;
  }
  
  // Create model directory if it doesn't exist
  NSError* dirError;
  [[NSFileManager defaultManager] createDirectoryAtPath:[modelDirURL path] withIntermediateDirectories:YES attributes:nil error:&dirError];
  if (dirError) {
    *error = dirError;
    return;
  }
  
  // Download and save ndarray-cache if it doesn't exist
  if (![[NSFileManager defaultManager] fileExistsAtPath:[ndarrayCacheURL path]]) {
    if (![self downloadFile:modelUrl filename:@"ndarray-cache.json" toURL:ndarrayCacheURL error:error]) {
      return;
    }
  }
  
  // Read and parse ndarray cache
  NSData* ndarrayCacheData = [NSData dataWithContentsOfURL:ndarrayCacheURL];
  if (!ndarrayCacheData) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine" code:2 userInfo:@{NSLocalizedDescriptionKey : @"Failed to read ndarray cache"}];
    }
    return;
  }
  
  NSError* ndarrayCacheJsonError;
  NSDictionary* ndarrayCache = [NSJSONSerialization JSONObjectWithData:ndarrayCacheData options:0 error:&ndarrayCacheJsonError];
  if (ndarrayCacheJsonError) {
    *error = ndarrayCacheJsonError;
    return;
  }

  // Download and save model config if it doesn't exist
  if (![[NSFileManager defaultManager] fileExistsAtPath:[modelConfigURL path]]) {
    if (![self downloadFile:modelUrl filename:@"mlc-chat-config.json" toURL:modelConfigURL error:error]) {
      return;
    }
  }

  // Read and parse model config
  NSData* modelConfigData = [NSData dataWithContentsOfURL:modelConfigURL];
  if (!modelConfigData) {
    if (error) {
      *error = [NSError errorWithDomain:@"MLCEngine" code:2 userInfo:@{NSLocalizedDescriptionKey : @"Failed to read model config"}];
    }
    return;
  }
  
  NSError* modelConfigJsonError;
  NSDictionary* modelConfig = [NSJSONSerialization JSONObjectWithData:modelConfigData options:0 error:&modelConfigJsonError];
  if (modelConfigJsonError) {
    *error = modelConfigJsonError;
    return;
  }
  
  // Create unified list of files to download
  NSMutableArray* filesToDownload = [NSMutableArray new];
  
  // Add parameter files from ndarray cache
  NSArray* records = ndarrayCache[@"records"];
  if ([records isKindOfClass:[NSArray class]]) {
    for (NSDictionary* record in records) {
      NSString* dataPath = record[@"dataPath"];
      if (dataPath) {
        NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:dataPath];
        if (![[NSFileManager defaultManager] fileExistsAtPath:[fileURL path]]) {
          [filesToDownload addObject:dataPath];
        }
      }
    }
  }
  
  // Add tokenizer files
  NSArray* tokenizerFiles = modelConfig[@"tokenizer_files"];
  if ([tokenizerFiles isKindOfClass:[NSArray class]]) {
    for (NSString* filename in tokenizerFiles) {
      NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:filename];
      if (![[NSFileManager defaultManager] fileExistsAtPath:[fileURL path]]) {
        [filesToDownload addObject:filename];
      }
    }
  }
  
  // Download all files with progress tracking
  NSInteger totalFiles = filesToDownload.count;
  for (NSInteger i = 0; i < totalFiles; i++) {
    NSString* filename = filesToDownload[i];
    NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:filename];
    
    // Download the file first
    if (![self downloadFile:modelUrl filename:filename toURL:fileURL error:error]) {
      return;
    }
    
    // Calculate and emit progress after successful download
    double percentage = totalFiles > 0 ? (double)(i + 1) / totalFiles * 100.0 : 100.0;
    if (progressCallback) {
      progressCallback(round(percentage));
    }
  }
}

- (void)downloadModel:(NSString*)modelId
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      NSDictionary* modelRecord = [self findModelById:modelId];
      
      if (!modelRecord) {
        reject(@"MLCEngine", @"There's no record for requested model", nil);
        return;
      }
      
      NSError* downloadError = nil;
      [self downloadModelFiles:modelRecord
                      progress:^(double percentage) {
        [self emitOnDownloadProgress:@{@"percentage" : @(percentage)}];
      }
                         error:&downloadError];
      
      if (downloadError) {
        reject(@"MLCEngine", @"Failed to download model", downloadError);
        return;
      }
      
      resolve(nil);
    } @catch (NSException* exception) {
      reject(@"MLCEngine", exception.reason, nil);
    }
  });
}

- (void)removeModel:(NSString*)modelId
            resolve:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelId];
      NSString* modelDirPath = [modelDirURL path];
      
      BOOL isDirectory;
      if ([[NSFileManager defaultManager] fileExistsAtPath:modelDirPath isDirectory:&isDirectory]) {
        if (isDirectory) {
          NSError* removeError;
          BOOL removed = [[NSFileManager defaultManager] removeItemAtPath:modelDirPath error:&removeError];
          
          if (removed) {
            resolve(nil);
          } else {
            reject(@"MLCEngine", [NSString stringWithFormat:@"Failed to clean model: %@", removeError.localizedDescription], removeError);
          }
        } else {
          reject(@"MLCEngine", @"Path exists but is not a directory", nil);
        }
      } else {
        resolve(nil);
      }
    } @catch (NSException* exception) {
      reject(@"MLCEngine", exception.reason, nil);
    }
  });
}

- (void)unloadModel:(RCTPromiseResolveBlock)resolve
             reject:(RCTPromiseRejectBlock)reject {
  [self.engine unload];
  resolve(nil);
}

- (void)cancelStream:(nonnull NSString *)streamId resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [self.engine cancelRequest:streamId];
  resolve(nil);
}


@end
