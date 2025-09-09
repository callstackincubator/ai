//
//  LLMEngine.mm
//  Pods
//

#import "JSONFFIEngine.h"
#import "BackgroundWorker.h"
#import "EngineState.h"
#import "LLMEngine.h"

/**
 * LLMEngine is the high-level orchestrator for MLC language model operations.
 * This class coordinates between the JSON FFI engine, background workers, and state management
 * to provide a clean API for React Native integration. It initializes background threads
 * for processing, manages model loading/unloading, and handles chat completion requests.
 * The engine runs two background workers: one for the main processing loop and another
 * for streaming responses back to the client, ensuring non-blocking operations.
 */
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

- (void)chatCompletionWithMessages:(NSArray*)messages completion:(void (^)(NSString* response))completion {
  NSDictionary* request = @{@"messages" : messages, @"temperature" : @0.6};

  [self.state chatCompletionWithJSONFFIEngine:self.jsonFFIEngine request:request completion:completion];
}

@end
