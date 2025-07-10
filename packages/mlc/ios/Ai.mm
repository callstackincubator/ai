#import "Ai.h"
#import "MLCEngine.h"
#import <SafariServices/SafariServices.h>

@interface Ai ()

@property(nonatomic, strong) MLCEngine* engine;
@property(nonatomic, strong) NSURL* bundleURL;
@property(nonatomic, strong) NSString* modelPath;
@property(nonatomic, strong) NSString* modelLib;
@property(nonatomic, strong) NSString* displayText;

@end

@implementation Ai

{
  bool hasListeners;
}

RCT_EXPORT_MODULE()

+ (BOOL)requiresMainQueueSetup {
  return YES;
}

- (NSArray<NSString*>*)supportedEvents {
  return @[ @"onChatUpdate", @"onChatComplete", @"onDownloadStart", @"onDownloadComplete", @"onDownloadProgress" ];
}

- (void)startObserving {
  hasListeners = YES;
}

- (void)stopObserving {
  hasListeners = NO;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _engine = [[MLCEngine alloc] init];

    // Get the Documents directory path
    NSArray* paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString* documentsDirectory = [paths firstObject];
    _bundleURL = [NSURL fileURLWithPath:[documentsDirectory stringByAppendingPathComponent:@"bundle"]];

    // Create bundle directory if it doesn't exist
    NSError* dirError;
    [[NSFileManager defaultManager] createDirectoryAtPath:[_bundleURL path] withIntermediateDirectories:YES attributes:nil error:&dirError];
    if (dirError) {
      NSLog(@"Error creating bundle directory: %@", dirError);
    }

    // Copy the config file from the app bundle to Documents if it doesn't exist yet
    NSURL* bundleConfigURL = [[[NSBundle mainBundle] bundleURL] URLByAppendingPathComponent:@"bundle/mlc-app-config.json"];
    NSURL* configURL = [_bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];

    NSError* copyError;
    [[NSFileManager defaultManager] removeItemAtURL:configURL error:nil]; // Remove existing file if it exists
    [[NSFileManager defaultManager] copyItemAtURL:bundleConfigURL toURL:configURL error:&copyError];
    if (copyError) {
      NSLog(@"Error copying config file: %@", copyError);
    }

    // Read and parse JSON
    NSData* jsonData = [NSData dataWithContentsOfURL:configURL];
    if (jsonData) {
      NSError* error;
      NSDictionary* jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

      if (!error && [jsonDict isKindOfClass:[NSDictionary class]]) {
        NSArray* modelList = jsonDict[@"model_list"];
        if ([modelList isKindOfClass:[NSArray class]] && modelList.count > 0) {
          NSDictionary* firstModel = modelList[0];
          _modelPath = firstModel[@"model_path"];
          _modelLib = firstModel[@"model_lib"];
        }
      }
    }
  }
  return self;
}

- (NSDictionary*)parseResponseString:(NSString*)responseString {
  NSData* jsonData = [responseString dataUsingEncoding:NSUTF8StringEncoding];
  NSError* error;
  NSArray* jsonArray = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

  if (error) {
    NSLog(@"Error parsing JSON: %@", error);
    return nil;
  }

  if (jsonArray.count > 0) {
    NSDictionary* responseDict = jsonArray[0];
    NSArray* choices = responseDict[@"choices"];
    if (choices.count > 0) {
      NSDictionary* choice = choices[0];
      NSDictionary* delta = choice[@"delta"];
      NSString* content = delta[@"content"];
      NSString* finishReason = choice[@"finish_reason"];

      BOOL isFinished = (finishReason != nil && ![finishReason isEqual:[NSNull null]]);

      return @{@"content" : content ?: @"", @"isFinished" : @(isFinished)};
    }
  }

  return nil;
}

RCT_EXPORT_METHOD(doGenerate : (NSString*)instanceId messages : (NSArray<NSDictionary*>*)messages resolve : (RCTPromiseResolveBlock)
                      resolve reject : (RCTPromiseRejectBlock)reject) {
  NSLog(@"Generating for instance ID: %@, with text: %@", instanceId, messages);
  _displayText = @"";
  __block BOOL hasResolved = NO;

  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    NSURL* modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];
    NSString* modelLocalPath = [modelLocalURL path];

    [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];

    [self.engine chatCompletionWithMessages:messages
                                 completion:^(id response) {
                                   if ([response isKindOfClass:[NSString class]]) {
                                     NSDictionary* parsedResponse = [self parseResponseString:response];
                                     if (parsedResponse) {
                                       NSString* content = parsedResponse[@"content"];
                                       BOOL isFinished = [parsedResponse[@"isFinished"] boolValue];

                                       if (content) {
                                         self.displayText = [self.displayText stringByAppendingString:content];
                                       }

                                       if (isFinished && !hasResolved) {
                                         hasResolved = YES;
                                         resolve(self.displayText);
                                       }

                                     } else {
                                       if (!hasResolved) {
                                         hasResolved = YES;
                                         reject(@"PARSE_ERROR", @"Failed to parse response", nil);
                                       }
                                     }
                                   } else {
                                     if (!hasResolved) {
                                       hasResolved = YES;
                                       reject(@"INVALID_RESPONSE", @"Received an invalid response type", nil);
                                     }
                                   }
                                 }];
  });
}

RCT_EXPORT_METHOD(doStream : (NSString*)instanceId messages : (NSArray<NSDictionary*>*)messages resolve : (RCTPromiseResolveBlock)
                      resolve reject : (RCTPromiseRejectBlock)reject) {

  NSLog(@"Streaming for instance ID: %@, with messages: %@", instanceId, messages);

  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    __block BOOL hasResolved = NO;

    NSURL* modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];
    NSString* modelLocalPath = [modelLocalURL path];

    [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];

    [self.engine chatCompletionWithMessages:messages
                                 completion:^(id response) {
                                   if ([response isKindOfClass:[NSString class]]) {
                                     NSDictionary* parsedResponse = [self parseResponseString:response];
                                     if (parsedResponse) {
                                       NSString* content = parsedResponse[@"content"];
                                       BOOL isFinished = [parsedResponse[@"isFinished"] boolValue];

                                       if (content) {
                                         self.displayText = [self.displayText stringByAppendingString:content];
                                         if (self->hasListeners) {
                                           [self sendEventWithName:@"onChatUpdate" body:@{@"content" : content}];
                                         }
                                       }

                                       if (isFinished && !hasResolved) {
                                         hasResolved = YES;
                                         if (self->hasListeners) {
                                           [self sendEventWithName:@"onChatComplete" body:nil];
                                         }

                                         resolve(@"");

                                         return;
                                       }
                                     } else {
                                       if (!hasResolved) {
                                         hasResolved = YES;
                                         reject(@"PARSE_ERROR", @"Failed to parse response", nil);
                                       }
                                     }
                                   } else {
                                     if (!hasResolved) {
                                       hasResolved = YES;
                                       reject(@"INVALID_RESPONSE", @"Received an invalid response type", nil);
                                     }
                                   }
                                 }];
  });
}

RCT_EXPORT_METHOD(getModel : (NSString*)name resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject) {
  // Read app config from Documents directory
  NSURL* configURL = [self.bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];
  NSData* jsonData = [NSData dataWithContentsOfURL:configURL];

  if (!jsonData) {
    reject(@"Model not found", @"Failed to read app config", nil);
    return;
  }

  NSError* error;
  NSDictionary* appConfig = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

  if (error) {
    reject(@"Model not found", @"Failed to parse app config", error);
    return;
  }

  // Find model record
  NSArray* modelList = appConfig[@"model_list"];
  NSDictionary* modelConfig = nil;

  for (NSDictionary* model in modelList) {
    if ([model[@"model_id"] isEqualToString:name]) {
      modelConfig = model;
      break;
    }
  }

  if (!modelConfig) {
    reject(@"Model not found", @"Didn't find the model", nil);
    return;
  }

  // Return a JSON object with details
  NSDictionary* modelInfo = @{@"modelId" : modelConfig[@"model_id"], @"modelLib" : modelConfig[@"model_lib"]};

  resolve(modelInfo);
}

RCT_EXPORT_METHOD(getModels : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject) {
  NSURL* configURL = [_bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];

  // Read and parse JSON
  NSData* jsonData = [NSData dataWithContentsOfURL:configURL];
  if (!jsonData) {
    reject(@"error", @"Failed to read JSON data", nil);
    return;
  }

  NSError* error;
  NSDictionary* jsonDict = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

  if (error || ![jsonDict isKindOfClass:[NSDictionary class]]) {
    reject(@"error", @"Failed to parse JSON", error);
    return;
  }

  NSArray* modelList = jsonDict[@"model_list"];
  if (![modelList isKindOfClass:[NSArray class]]) {
    reject(@"error", @"model_list is missing or invalid", nil);
    return;
  }
  NSLog(@"models: %@", modelList);
  resolve(modelList);
}

RCT_EXPORT_METHOD(prepareModel : (NSString*)instanceId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      // Read app config
      NSURL* configURL = [self.bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];
      NSData* jsonData = [NSData dataWithContentsOfURL:configURL];

      if (!jsonData) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to read app config", nil);
        });
        return;
      }

      NSError* error;
      NSDictionary* appConfig = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

      if (error) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to parse app config", error);
        });
        return;
      }

      // Find model record
      NSArray* modelList = appConfig[@"model_list"];
      NSDictionary* modelRecord = nil;

      for (NSDictionary* model in modelList) {
        if ([model[@"model_id"] isEqualToString:instanceId]) {
          modelRecord = model;
          break;
        }
      }

      if (!modelRecord) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"There's no record for requested model", nil);
        });
        return;
      }

      // Get model config
      NSError* configError;
      NSDictionary* modelConfig = [self getModelConfig:modelRecord error:&configError];

      if (configError || !modelConfig) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to get model config", configError);
        });
        return;
      }

      // Update model properties - with null checks
      NSString* modelLib = modelRecord[@"model_lib"];

      if (!modelLib) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Invalid model config - missing required fields", nil);
        });
        return;
      }

      // Set model path to just use Documents directory and modelId
      NSString* modelId = modelRecord[@"model_id"];
      self.modelPath = modelId;
      self.modelLib = modelLib;

      // Initialize engine with model
      NSURL* modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];

      if (!modelLocalURL) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to construct model path", nil);
        });
        return;
      }
      NSString* modelLocalPath = [modelLocalURL path];

      [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([NSString stringWithFormat:@"Model prepared: %@", instanceId]);
      });

    } @catch (NSException* exception) {
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"MODEL_ERROR", exception.reason, nil);
      });
    }
  });
}

- (NSDictionary*)getModelConfig:(NSDictionary*)modelRecord error:(NSError**)error {
  [self downloadModelConfig:modelRecord error:error];
  if (*error != nil) {
    return nil;
  }

  NSString* modelId = modelRecord[@"model_id"];

  // Use the same path construction as downloadModelConfig
  NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelId];
  NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];

  NSData* jsonData = [NSData dataWithContentsOfURL:modelConfigURL];
  if (!jsonData) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule" code:1 userInfo:@{NSLocalizedDescriptionKey : @"Requested model config not found"}];
    }
    return nil;
  }

  return [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:error];
}

- (void)downloadModelConfig:(NSDictionary*)modelRecord error:(NSError**)error {
  NSString* modelId = modelRecord[@"model_id"];
  NSString* modelUrl = modelRecord[@"model_url"];

  if (!modelId || !modelUrl) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule" code:3 userInfo:@{NSLocalizedDescriptionKey : @"Missing required model record fields"}];
    }
    return;
  }

  // Check if config already exists
  NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelId];
  NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];
  NSURL* ndarrayCacheURL = [modelDirURL URLByAppendingPathComponent:@"ndarray-cache.json"];

  if (!modelDirURL || !modelConfigURL) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule" code:4 userInfo:@{NSLocalizedDescriptionKey : @"Failed to construct config URLs"}];
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

  // Download and save model config if it doesn't exist
  if (![[NSFileManager defaultManager] fileExistsAtPath:[modelConfigURL path]]) {
    [self downloadAndSaveConfig:modelUrl configName:@"mlc-chat-config.json" toURL:modelConfigURL error:error];
    if (*error != nil)
      return;
  }

  // Download and save ndarray-cache if it doesn't exist
  if (![[NSFileManager defaultManager] fileExistsAtPath:[ndarrayCacheURL path]]) {
    [self downloadAndSaveConfig:modelUrl configName:@"ndarray-cache.json" toURL:ndarrayCacheURL error:error];
    if (*error != nil)
      return;
  }

  // Read and parse ndarray cache
  NSData* ndarrayCacheData = [NSData dataWithContentsOfURL:ndarrayCacheURL];
  if (!ndarrayCacheData) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule" code:2 userInfo:@{NSLocalizedDescriptionKey : @"Failed to read ndarray cache"}];
    }
    return;
  }

  NSError* ndarrayCacheJsonError;
  NSDictionary* ndarrayCache = [NSJSONSerialization JSONObjectWithData:ndarrayCacheData options:0 error:&ndarrayCacheJsonError];
  if (ndarrayCacheJsonError) {
    *error = ndarrayCacheJsonError;
    return;
  }

  // Download parameter files from ndarray cache
  NSArray* records = ndarrayCache[@"records"];
  if ([records isKindOfClass:[NSArray class]]) {
    for (NSDictionary* record in records) {
      NSString* dataPath = record[@"dataPath"];
      if (dataPath) {
        NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:dataPath];
        if (![[NSFileManager defaultManager] fileExistsAtPath:[fileURL path]]) {
          [self downloadModelFile:modelUrl filename:dataPath toURL:fileURL error:error];
          if (*error != nil)
            return;
        }
      }
    }
  }

  // Read and parse model config
  NSData* modelConfigData = [NSData dataWithContentsOfURL:modelConfigURL];
  if (!modelConfigData) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule" code:2 userInfo:@{NSLocalizedDescriptionKey : @"Failed to read model config"}];
    }
    return;
  }

  NSError* modelConfigJsonError;
  NSDictionary* modelConfig = [NSJSONSerialization JSONObjectWithData:modelConfigData options:0 error:&modelConfigJsonError];
  if (modelConfigJsonError) {
    *error = modelConfigJsonError;
    return;
  }

  // Download tokenizer files
  NSArray* tokenizerFiles = modelConfig[@"tokenizer_files"];
  for (NSString* filename in tokenizerFiles) {
    NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:filename];
    if (![[NSFileManager defaultManager] fileExistsAtPath:[fileURL path]]) {
      [self downloadModelFile:modelUrl filename:filename toURL:fileURL error:error];
      if (*error != nil)
        return;
    }
  }

  // Download model file
  NSString* modelPath = modelConfig[@"model_path"];
  if (modelPath) {
    NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:modelPath];
    if (![[NSFileManager defaultManager] fileExistsAtPath:[fileURL path]]) {
      [self downloadModelFile:modelUrl filename:modelPath toURL:fileURL error:error];
      if (*error != nil)
        return;
    }
  }
}

- (void)downloadAndSaveConfig:(NSString*)modelUrl configName:(NSString*)configName toURL:(NSURL*)destURL error:(NSError**)error {
  NSString* urlString = [NSString stringWithFormat:@"%@/resolve/main/%@", modelUrl, configName];
  NSURL* url = [NSURL URLWithString:urlString];

  NSData* configData = [NSData dataWithContentsOfURL:url];
  if (!configData) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule"
                                   code:2
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to download %@", configName]}];
    }
    return;
  }

  if (![configData writeToURL:destURL atomically:YES]) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule"
                                   code:6
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to write %@", configName]}];
    }
    return;
  }
}

- (void)downloadModelFile:(NSString*)modelUrl filename:(NSString*)filename toURL:(NSURL*)destURL error:(NSError**)error {
  NSString* urlString = [NSString stringWithFormat:@"%@/resolve/main/%@", modelUrl, filename];
  NSURL* url = [NSURL URLWithString:urlString];

  NSData* fileData = [NSData dataWithContentsOfURL:url];
  if (!fileData) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule"
                                   code:2
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to download %@", filename]}];
    }
    return;
  }

  if (![fileData writeToURL:destURL atomically:YES]) {
    if (error) {
      *error = [NSError errorWithDomain:@"AiModule"
                                   code:6
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"Failed to write %@", filename]}];
    }
    return;
  }
}

RCT_EXPORT_METHOD(downloadModel : (NSString*)instanceId resolve : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject) {
  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    @try {
      // Read app config
      NSURL* configURL = [self.bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];
      NSData* jsonData = [NSData dataWithContentsOfURL:configURL];

      if (!jsonData) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to read app config", nil);
        });
        return;
      }

      NSError* error;
      NSDictionary* appConfig = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];

      if (error) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to parse app config", error);
        });
        return;
      }

      // Find model record
      NSArray* modelList = appConfig[@"model_list"];
      NSDictionary* modelRecord = nil;

      for (NSDictionary* model in modelList) {
        if ([model[@"model_id"] isEqualToString:instanceId]) {
          modelRecord = model;
          break;
        }
      }

      if (!modelRecord) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"There's no record for requested model", nil);
        });
        return;
      }

      // Send download start event
      if (self->hasListeners) {
        [self sendEventWithName:@"onDownloadStart" body:nil];
      }

      // Get model config and download files
      NSError* configError;
      NSDictionary* modelConfig = [self getModelConfig:modelRecord error:&configError];

      if (configError || !modelConfig) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to get model config", configError);
        });
        return;
      }

      // Calculate total files to download
      NSInteger totalFiles = 0;
      __block NSInteger downloadedFiles = 0;

      // Count files from ndarray cache
      NSURL* modelDirURL = [self.bundleURL URLByAppendingPathComponent:modelRecord[@"model_id"]];
      NSURL* ndarrayCacheURL = [modelDirURL URLByAppendingPathComponent:@"ndarray-cache.json"];
      NSData* ndarrayCacheData = [NSData dataWithContentsOfURL:ndarrayCacheURL];
      if (ndarrayCacheData) {
        NSDictionary* ndarrayCache = [NSJSONSerialization JSONObjectWithData:ndarrayCacheData options:0 error:nil];
        NSArray* records = ndarrayCache[@"records"];
        if ([records isKindOfClass:[NSArray class]]) {
          totalFiles += records.count;
        }
      }

      // Count tokenizer files
      NSArray* tokenizerFiles = modelConfig[@"tokenizer_files"];
      if ([tokenizerFiles isKindOfClass:[NSArray class]]) {
        totalFiles += tokenizerFiles.count;
      }

      // Add model file
      if (modelConfig[@"model_path"]) {
        totalFiles += 1;
      }

      // Add config files
      totalFiles += 2; // mlc-chat-config.json and ndarray-cache.json

      // Send progress updates during download
      void (^updateProgress)(void) = ^{
        downloadedFiles++;
        if (self->hasListeners) {
          double percentage = (double)downloadedFiles / totalFiles * 100.0;
          [self sendEventWithName:@"onDownloadProgress" body:@{@"percentage" : @(percentage)}];
        }
      };

      // Download config files
      [self downloadAndSaveConfig:modelRecord[@"model_url"]
                       configName:@"mlc-chat-config.json"
                            toURL:[modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"]
                            error:&error];
      if (error) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to download config files", error);
        });
        return;
      }
      updateProgress();

      [self downloadAndSaveConfig:modelRecord[@"model_url"] configName:@"ndarray-cache.json" toURL:ndarrayCacheURL error:&error];
      if (error) {
        dispatch_async(dispatch_get_main_queue(), ^{
          reject(@"MODEL_ERROR", @"Failed to download config files", error);
        });
        return;
      }
      updateProgress();

      // Download parameter files
      NSDictionary* ndarrayCache = [NSJSONSerialization JSONObjectWithData:ndarrayCacheData options:0 error:nil];
      NSArray* records = ndarrayCache[@"records"];
      if ([records isKindOfClass:[NSArray class]]) {
        for (NSDictionary* record in records) {
          NSString* dataPath = record[@"dataPath"];
          if (dataPath) {
            NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:dataPath];
            [self downloadModelFile:modelRecord[@"model_url"] filename:dataPath toURL:fileURL error:&error];
            if (error) {
              dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"MODEL_ERROR", @"Failed to download parameter files", error);
              });
              return;
            }
            updateProgress();
          }
        }
      }

      // Download tokenizer files
      for (NSString* filename in tokenizerFiles) {
        NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:filename];
        [self downloadModelFile:modelRecord[@"model_url"] filename:filename toURL:fileURL error:&error];
        if (error) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"MODEL_ERROR", @"Failed to download tokenizer files", error);
          });
          return;
        }
        updateProgress();
      }

      // Download model file
      NSString* modelPath = modelConfig[@"model_path"];
      if (modelPath) {
        NSURL* fileURL = [modelDirURL URLByAppendingPathComponent:modelPath];
        [self downloadModelFile:modelRecord[@"model_url"] filename:modelPath toURL:fileURL error:&error];
        if (error) {
          dispatch_async(dispatch_get_main_queue(), ^{
            reject(@"MODEL_ERROR", @"Failed to download model file", error);
          });
          return;
        }
        updateProgress();
      }

      // Send download complete event
      if (self->hasListeners) {
        [self sendEventWithName:@"onDownloadComplete" body:nil];
      }

      dispatch_async(dispatch_get_main_queue(), ^{
        resolve([NSString stringWithFormat:@"Model downloaded: %@", instanceId]);
      });

    } @catch (NSException* exception) {
      if (self->hasListeners) {
        [self sendEventWithName:@"onDownloadError" body:@{@"message" : exception.reason ?: @"Unknown error"}];
      }
      dispatch_async(dispatch_get_main_queue(), ^{
        reject(@"MODEL_ERROR", exception.reason, nil);
      });
    }
  });
}

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams&)params {
  return std::make_shared<facebook::react::NativeAiSpecJSI>(params);
}
#endif

@end
