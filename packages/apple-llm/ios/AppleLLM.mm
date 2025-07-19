//
//  AppleLLM.m
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

#if __has_include("AppleLLM/AppleLLM-Swift.h")
#import "AppleLLM/AppleLLM-Swift.h"
#else
#import "AppleLLM-Swift.h"
#endif

#import <React/RCTBridge+Private.h>
#import <React/RCTUtils.h>
#import <jsi/jsi.h>

#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleLLM : NativeAppleLLMSpecBase <NativeAppleLLMSpec>
@property (strong, nonatomic) AppleLLMImpl *llm;
@property (nonatomic) facebook::react::CallInvoker *callInvoker;
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

- (facebook::jsi::Runtime *)runtime {
  RCTBridge* bridge = [RCTBridge currentBridge];
  RCTCxxBridge* cxxBridge = (RCTCxxBridge*)bridge;
  
  facebook::jsi::Runtime *runtime = (facebook::jsi::Runtime*)cxxBridge.runtime;
  if (runtime == nullptr) {
    @throw [NSException exceptionWithName:@"AppleLLM"
                                   reason:@"No runtime available"
                                 userInfo:nil];
  }
  
  return runtime;
}

- (NSString *)callFunctionWithName:(NSString *)name {
  NSString *response;
  self.callInvoker->invokeSync([&response](facebook::jsi::Runtime& rt) {
    auto global = rt.global();
    
    auto tools = global.getPropertyAsObject(rt, "__APPLE_LLM_TOOLS__");
    
    auto func = tools.getPropertyAsFunction(rt, [@"test" UTF8String]);
    
    auto result = func.call(rt).getString(rt);
    
    auto str = result.utf8(rt);
    response = [NSString stringWithUTF8String:str.c_str()];
  });
  return response;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  self.callInvoker = params.jsInvoker.get();
  return std::make_shared<facebook::react::NativeAppleLLMSpecJSI>(params);
}

- (void)generateText:(nonnull NSArray *)messages
             options:(AppleGenerationOptions &)options
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  NSDictionary *opts = @{
    @"temperature": options.temperature().has_value() ? @(options.temperature().value()) : [NSNull null],
    @"maxTokens": options.maxTokens().has_value() ? @(options.maxTokens().value()) : [NSNull null],
    @"topP": options.topP().has_value() ? @(options.topP().value()) : [NSNull null],
    @"topK": options.topK().has_value() ? @(options.topK().value()) : [NSNull null],
    @"schema": options.schema()
  };
  
  // Call and print result
  NSString *rest = [self callFunctionWithName:@"test"];
  
  [_llm generateText:messages options:opts resolve:resolve reject:reject];
}

- (void)cancelStream:(nonnull NSString *)streamId {
  [_llm cancelStream:streamId];
}


- (nonnull NSString *)generateStream:(nonnull NSArray *)messages options:(JS::NativeAppleLLM::AppleGenerationOptions &)options {
  NSDictionary *opts = @{
    @"temperature": options.temperature().has_value() ? @(options.temperature().value()) : [NSNull null],
    @"maxTokens": options.maxTokens().has_value() ? @(options.maxTokens().value()) : [NSNull null],
    @"topP": options.topP().has_value() ? @(options.topP().value()) : [NSNull null],
    @"topK": options.topK().has_value() ? @(options.topK().value()) : [NSNull null],
    @"schema": options.schema()
  };
  
  NSError *error;
  
  NSString *streamId = [_llm generateStream:messages
                                    options:opts
                                      error: &error
                                   onUpdate:^(NSString *streamId, NSString *content) {
    [self emitOnStreamUpdate:@{@"streamId": streamId, @"content": content}];
  }
                                 onComplete:^(NSString *streamId) {
    [self emitOnStreamComplete:@{@"streamId": streamId}];
  }
                                    onError:^(NSString *streamId, NSString *error) {
    [self emitOnStreamError:@{@"streamId": streamId, @"error": error}];
  }];
  
  if (error) {
    @throw [NSException exceptionWithName:@"AppleLLM"
                                   reason:error.localizedDescription
                                 userInfo:nil];
  }
  
  return streamId;
  
}

- (nonnull NSNumber *)isAvailable {
  return @([_llm isAvailable]);
}

@end
