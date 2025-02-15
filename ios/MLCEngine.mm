//
//  MLCEngine.mm
//  Pods
//
//  Created by Szymon Rybczak on 19/07/2024.
//

#import "MLCEngine.h"
#import "BackgroundWorker.h"
#import "EngineState.h"
#import "LLMEngine.h"

// Private class extension for MLCEngine
@interface MLCEngine ()
@property(nonatomic, strong) EngineState* state;
@property(nonatomic, strong) JSONFFIEngine* jsonFFIEngine;
@property(nonatomic, strong) NSMutableArray<NSThread*>* threads;
@end

@implementation MLCEngine

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
  NSDictionary* request = @{@"messages" : messages};
  [self.state chatCompletionWithJSONFFIEngine:self.jsonFFIEngine request:request completion:completion];
}

@end
