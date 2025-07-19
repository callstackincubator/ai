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

#import <React/RCTCallInvokerModule.h>
#import <React/RCTCallInvoker.h>
#import <jsi/jsi.h>

#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleLLM : NativeAppleLLMSpecBase <NativeAppleLLMSpec, RCTCallInvokerModule>
@property (strong, nonatomic) AppleLLMImpl *llm;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleLLM

@synthesize callInvoker;

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

- (NSString *)callFunctionWithName:(NSString *)name {
  NSString *response;
  [self.callInvoker callInvoker]->invokeSync([&response](jsi::Runtime& rt) {
    auto global = rt.global();
    
    auto tools = global.getPropertyAsObject(rt, "__APPLE_LLM_TOOLS__");
    
    auto func = tools.getPropertyAsFunction(rt, [@"test" UTF8String]);
    
    auto result = func.call(rt).getString(rt);
    
    auto str = result.utf8(rt);
    response = [NSString stringWithUTF8String:str.c_str()];
  });
  return response;
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleLLMSpecJSI>(params);
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
