/*
 * Copyright (c) MLC-AI
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * This file is derived from the MLC-LLM project:
 * https://github.com/mlc-ai/mlc-llm
 */

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

- (NSString*)chatCompletionWithMessages:(NSArray*)messages options:(NSDictionary*)options completion:(void (^)(NSDictionary* response))completion {
  return [self.state chatCompletionWithJSONFFIEngine:self.jsonFFIEngine request:options completion:completion];
}

- (void)cancelRequest:(NSString *)requestId {
  [self.state cancelRequest:requestId withJSONFFIEngine:self.jsonFFIEngine];
}

@end
