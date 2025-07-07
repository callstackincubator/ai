//
//  AppleLLM.m
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

#import "AppleLLM-Swift.h"
#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleLLM : NSObject <NativeAppleLLMSpec>
@property (strong, nonatomic) AppleLLMImpl *llm;
@end

using namespace JS::NativeAppleLLM;

@implementation AppleLLM

- (instancetype)init {
  self = [super init];
  if (self) {
    _llm = [AppleLLMImpl new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"AppleLLM";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativeAppleLLMSpecJSI>(params);
}

- (void)cancelStream:(nonnull NSString *)streamId
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm cancelStream:streamId resolve:resolve reject:reject];
}

- (void)generateText:(nonnull NSArray *)messages
             options:(AppleGenerationOptions &)options
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  // TODO: Consider direct C++ struct passing to avoid NSDictionary conversion overhead.
  // Current approach converts C++ optional values to NSNull/NSNumber for Swift interop,
  // but direct struct marshalling could eliminate this bridge layer entirely.
  NSDictionary *opts = @{
    @"temperature": options.temperature().has_value() ? @(options.temperature().value()) : [NSNull null],
    @"maxTokens": options.maxTokens().has_value() ? @(options.maxTokens().value()) : [NSNull null],
    @"topP": options.topP().has_value() ? @(options.topP().value()) : [NSNull null],
    @"topK": options.topK().has_value() ? @(options.topK().value()) : [NSNull null],
  };
  [_llm generateText:messages options:opts resolve:resolve reject:reject];
}

- (void)isAvailable:(nonnull RCTPromiseResolveBlock)resolve
             reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm isAvailable:resolve reject:reject];
}

- (void)isModelAvailable:(nonnull NSString *)modelId
                 resolve:(nonnull RCTPromiseResolveBlock)resolve
                  reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm isModelAvailable:modelId resolve:resolve reject:reject];
}

- (void)startStream:(nonnull NSArray *)messages
            options:(AppleGenerationOptions &)options
            resolve:(nonnull RCTPromiseResolveBlock)resolve
             reject:(nonnull RCTPromiseRejectBlock)reject {
  NSDictionary *opts = @{
    @"temperature": options.temperature().has_value() ? @(options.temperature().value()) : [NSNull null],
    @"maxTokens": options.maxTokens().has_value() ? @(options.maxTokens().value()) : [NSNull null],
    @"topP": options.topP().has_value() ? @(options.topP().value()) : [NSNull null],
    @"topK": options.topK().has_value() ? @(options.topK().value()) : [NSNull null],
  };
  [_llm startStream:messages options:opts resolve:resolve reject:reject];
}

@end
  
  
