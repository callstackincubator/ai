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
  return @[ @"onChatUpdate", @"onChatComplete" ];
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
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    _bundleURL = [NSURL fileURLWithPath:[documentsDirectory stringByAppendingPathComponent:@"bundle"]];
    
    // Create bundle directory if it doesn't exist
    NSError *dirError;
    [[NSFileManager defaultManager] createDirectoryAtPath:[_bundleURL path]
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                 error:&dirError];
    if (dirError) {
        NSLog(@"Error creating bundle directory: %@", dirError);
    }
    
    // Copy the config file from the app bundle to Documents if it doesn't exist yet
    NSURL* bundleConfigURL = [[[NSBundle mainBundle] bundleURL] URLByAppendingPathComponent:@"bundle/mlc-app-config.json"];
    NSURL* configURL = [_bundleURL URLByAppendingPathComponent:@"mlc-app-config.json"];
    
    if (![[NSFileManager defaultManager] fileExistsAtPath:[configURL path]]) {
        NSError *copyError;
        [[NSFileManager defaultManager] copyItemAtURL:bundleConfigURL toURL:configURL error:&copyError];
        if (copyError) {
            NSLog(@"Error copying config file: %@", copyError);
        }
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

RCT_EXPORT_METHOD(doStream : (NSString*)instanceId text : (NSString*)text resolve : (RCTPromiseResolveBlock)
                      resolve reject : (RCTPromiseRejectBlock)reject) {

  NSLog(@"Streaming for instance ID: %@, with text: %@", instanceId, text);

  dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
    __block BOOL hasResolved = NO;

    NSURL* modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];
    NSString* modelLocalPath = [modelLocalURL path];

    [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];

    NSDictionary* message = @{@"role" : @"user", @"content" : text};

    [self.engine chatCompletionWithMessages:@[ message ]
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
  NSLog(@"Getting model: %@", name);
  // TODO: add a logic for fetching models if they're not presented in the `bundle/` directory.
  NSDictionary* modelInfo = @{@"path" : self.modelPath, @"lib" : self.modelLib};

  resolve(modelInfo);
}

RCT_EXPORT_METHOD(getModels : (RCTPromiseResolveBlock)resolve reject : (RCTPromiseRejectBlock)reject) {
  _bundleURL = [[[NSBundle mainBundle] bundleURL] URLByAppendingPathComponent:@"bundle"];
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

RCT_EXPORT_METHOD(prepareModel:(NSString *)instanceId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
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
            NSDictionary* appConfig = [NSJSONSerialization JSONObjectWithData:jsonData 
                                                                    options:0 
                                                                      error:&error];
            
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
                     NSString* modelPath = modelConfig[@"model_path"];
                     NSString* modelLib = modelConfig[@"model_lib"];
                     
                     if (!modelPath || !modelLib) {
                         dispatch_async(dispatch_get_main_queue(), ^{
                             reject(@"MODEL_ERROR", @"Invalid model config - missing required fields", nil);
                         });
                         return;
                     }
                     
                     self.modelPath = modelPath;
                     self.modelLib = modelLib;

            // Initialize engine with model
            // Get Documents directory path
            NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
            NSString *documentsDirectory = [paths firstObject];
            NSURL *documentsURL = [NSURL fileURLWithPath:documentsDirectory];
            NSURL *bundleURL = [documentsURL URLByAppendingPathComponent:@"bundle"];
            NSURL* modelLocalURL = [bundleURL URLByAppendingPathComponent:self.modelPath];
            
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
            
        } @catch (NSException *exception) {
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
    
    // Get Documents directory path - same as in downloadModelConfig
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSURL *documentsURL = [NSURL fileURLWithPath:documentsDirectory];
    NSURL *bundleURL = [documentsURL URLByAppendingPathComponent:@"bundle"];
    
    // Use the same path construction as downloadModelConfig
    NSURL* modelDirURL = [bundleURL URLByAppendingPathComponent:modelId];
    NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];
    
    NSData* jsonData = [NSData dataWithContentsOfURL:modelConfigURL];
    if (!jsonData) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:1
                                   userInfo:@{NSLocalizedDescriptionKey: @"Requested model config not found"}];
        }
        return nil;
    }
    
    return [NSJSONSerialization JSONObjectWithData:jsonData
                                         options:0
                                           error:error];
}

- (void)downloadModelConfig:(NSDictionary*)modelRecord error:(NSError**)error {
    NSString* modelId = modelRecord[@"model_id"];
    NSString* modelUrl = modelRecord[@"model_url"];
    
    if (!modelId || !modelUrl) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:3
                                   userInfo:@{NSLocalizedDescriptionKey: @"Missing required model record fields"}];
        }
        return;
    }
    
    // Get Documents directory path
    NSArray *paths = NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES);
    NSString *documentsDirectory = [paths firstObject];
    NSURL *documentsURL = [NSURL fileURLWithPath:documentsDirectory];
    NSURL *bundleURL = [documentsURL URLByAppendingPathComponent:@"bundle"];
    
    // Check if config already exists
    NSURL* modelDirURL = [bundleURL URLByAppendingPathComponent:modelId];
    NSURL* modelConfigURL = [modelDirURL URLByAppendingPathComponent:@"mlc-chat-config.json"];
    
    if (!modelDirURL || !modelConfigURL) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:4
                                   userInfo:@{NSLocalizedDescriptionKey: @"Failed to construct config URLs"}];
        }
        return;
    }
    
    if ([[NSFileManager defaultManager] fileExistsAtPath:[modelConfigURL path]]) {
        return;
    }
    
    // Create model directory if it doesn't exist
    NSError *dirError;
    [[NSFileManager defaultManager] createDirectoryAtPath:[modelDirURL path]
                             withIntermediateDirectories:YES
                                              attributes:nil
                                                 error:&dirError];
    if (dirError) {
        *error = dirError;
        return;
    }
    
    // Download config file
    NSString* configUrlString = [NSString stringWithFormat:@"%@/resolve/main/mlc-chat-config.json", modelUrl];
    NSURL* configUrl = [NSURL URLWithString:configUrlString];
    
    if (!configUrl) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:5
                                   userInfo:@{NSLocalizedDescriptionKey: @"Failed to construct config download URL"}];
        }
        return;
    }
    
    NSData* configData = [NSData dataWithContentsOfURL:configUrl];
    if (!configData) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:2
                                   userInfo:@{NSLocalizedDescriptionKey: @"Failed to download model config"}];
        }
        return;
    }
    
    // Parse and update config
    NSError* jsonError;
    NSMutableDictionary* modelConfig = [[NSJSONSerialization JSONObjectWithData:configData
                                                                      options:NSJSONReadingMutableContainers
                                                                        error:&jsonError] mutableCopy];
    if (jsonError) {
        *error = jsonError;
        return;
    }
    
    // Update config with model record data - with null checks
    if (modelId) modelConfig[@"model_id"] = modelId;
    if (modelRecord[@"model_lib"]) modelConfig[@"model_lib"] = modelRecord[@"model_lib"];
    if (modelRecord[@"estimated_vram_bytes"]) modelConfig[@"estimated_vram_bytes"] = modelRecord[@"estimated_vram_bytes"];
    
    // Save updated config
    NSData* updatedConfigData = [NSJSONSerialization dataWithJSONObject:modelConfig
                                                              options:0
                                                                error:error];
    if (*error != nil) {
        return;
    }
    
    if (![updatedConfigData writeToURL:modelConfigURL atomically:YES]) {
        if (error) {
            *error = [NSError errorWithDomain:@"AiModule"
                                       code:6
                                   userInfo:@{NSLocalizedDescriptionKey: @"Failed to write config file"}];
        }
        return;
    }
}


// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams&)params {
  return std::make_shared<facebook::react::NativeAiSpecJSI>(params);
}
#endif

@end
