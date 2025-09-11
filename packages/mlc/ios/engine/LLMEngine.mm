//
//  LLMEngine.mm
//  Pods
//

#import "LLMEngine.h"
#import "BackgroundWorker.h"
#import "EngineState.h"

@interface LLMEngine ()

@property(nonatomic, strong) EngineState* state;
@property(nonatomic, strong) JSONFFIEngine* jsonFFIEngine;
@property(nonatomic, strong) NSMutableArray<NSThread*>* threads;

@end

@implementation LLMEngine

- (instancetype)init {
  self = [super init];
  if (self) {
    _state = [[EngineState alloc] init];
    _jsonFFIEngine = [[JSONFFIEngine alloc] init];
    _threads = [NSMutableArray array];
    
    [_jsonFFIEngine initBackgroundEngine:^(NSString* _Nullable result) {
      [self.state streamCallbackWithResult:result];
    }];
    
    BackgroundWorker* backgroundWorker = [[BackgroundWorker alloc] initWithTask:^{
      [NSThread setThreadPriority:1.0];
      [self.jsonFFIEngine runBackgroundLoop];
    }];
    
    BackgroundWorker* backgroundStreamBackWorker = [[BackgroundWorker alloc] initWithTask:^{
      [self.jsonFFIEngine runBackgroundStreamBackLoop];
    }];
    
    backgroundWorker.qualityOfService = NSQualityOfServiceUserInteractive;
    [_threads addObject:backgroundWorker];
    [_threads addObject:backgroundStreamBackWorker];
    [backgroundWorker start];
    [backgroundStreamBackWorker start];
  }
  return self;
}

- (void)dealloc {
  [self.jsonFFIEngine exitBackgroundLoop];
}

- (void)reloadWithModelPath:(NSString*)modelPath modelLib:(NSString*)modelLib {
  NSString* engineConfig =
  [NSString stringWithFormat:@"{\"model\": \"%@\", \"model_lib\": \"system://%@\", \"mode\": \"interactive\"}", modelPath, modelLib];
  [self.jsonFFIEngine reload:engineConfig];
}

- (void)reset {
  [self.jsonFFIEngine reset];
}

- (void)unload {
  [self.jsonFFIEngine unload];
}

- (void)chatCompletionWithMessages:(NSArray*)messages options:(NSDictionary*)options completion:(void (^)(id response))completion {
  NSMutableDictionary* request = [@{@"messages" : messages, @"stream": @YES} mutableCopy];
  
  // Add generation options if provided
  if (options[@"temperature"] && ![options[@"temperature"] isEqual:[NSNull null]]) {
    request[@"temperature"] = options[@"temperature"];
  }
  if (options[@"maxTokens"] && ![options[@"maxTokens"] isEqual:[NSNull null]]) {
    request[@"max_tokens"] = options[@"maxTokens"];
  }
  if (options[@"topP"] && ![options[@"topP"] isEqual:[NSNull null]]) {
    request[@"top_p"] = options[@"topP"];
  }
  if (options[@"topK"] && ![options[@"topK"] isEqual:[NSNull null]]) {
    request[@"top_k"] = options[@"topK"];
  }
  
  [self.state chatCompletionWithJSONFFIEngine:self.jsonFFIEngine request:request completion:completion];
}

@end
