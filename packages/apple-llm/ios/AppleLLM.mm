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

#import <ReactCommon/RCTTurboModule.h>

#import <jsi/jsi.h>

#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleLLM : NativeAppleLLMSpecBase <NativeAppleLLMSpec>
@property (strong, nonatomic) AppleLLMImpl *llm;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleLLM {
  // Completions of tool calls waiting for submitToolResult, keyed by call id
  NSMutableDictionary<NSString *, void (^)(id, NSError *)> *_pendingToolCalls;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _llm = [AppleLLMImpl new];
    _pendingToolCalls = [NSMutableDictionary new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeAppleLLM";
}

- (void)callToolWithId:(NSString *)toolId
             arguments:(NSString *)arguments
            completion:(void (^)(id result, NSError *error))completion {
  NSString *callId = [[NSUUID UUID] UUIDString];
  @synchronized (_pendingToolCalls) {
    _pendingToolCalls[callId] = completion;
  }
  [self emitOnToolCall:@{@"callId": callId, @"toolId": toolId, @"arguments": arguments}];
}

- (void)submitToolResult:(NSString *)callId result:(NSString *)result isError:(BOOL)isError {
  void (^completion)(id, NSError *);
  @synchronized (_pendingToolCalls) {
    completion = _pendingToolCalls[callId];
    [_pendingToolCalls removeObjectForKey:callId];
  }

  if (completion == nil) {
    return;
  }

  if (isError) {
    completion(nil, [NSError errorWithDomain:@"AppleLLM"
                                        code:1
                                    userInfo:@{NSLocalizedDescriptionKey: result}]);
  } else {
    completion(result, nil);
  }
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
    @"schema": options.schema() ?: [NSNull null],
    @"tools": options.tools() ?: [NSNull null],
    @"toolCallingMode": options.toolCallingMode() ?: [NSNull null],
    @"providerOptions": options.providerOptions() ?: [NSNull null]
  };
  
  auto callToolBlock = ^(NSString *toolId, NSString *arguments, void (^completion)(id, NSError *)) {
    [self callToolWithId:toolId arguments:arguments completion:completion];
  };
  
  [_llm generateText:messages options:opts resolve:resolve reject:reject toolInvoker:callToolBlock];
}

- (void)countTokens:(nonnull NSString *)text
            resolve:(nonnull RCTPromiseResolveBlock)resolve
             reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm countTokens:text resolve:resolve reject:reject];
}

- (void)getModelInfo:(NSString *)locale
               model:(NSString *)model
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm getModelInfo:locale model:model resolve:resolve reject:reject];
}

- (void)generateImages:(nonnull NSDictionary *)options
               resolve:(nonnull RCTPromiseResolveBlock)resolve
                reject:(nonnull RCTPromiseRejectBlock)reject {
  [_llm generateImages:options resolve:resolve reject:reject];
}

- (void)cancelStream:(nonnull NSString *)streamId {
  [_llm cancelStream:streamId];
}


- (void)generateStream:(nonnull NSString *)streamId messages:(nonnull NSArray *)messages options:(JS::NativeAppleLLM::AppleGenerationOptions &)options {
  NSDictionary *opts = @{
    @"temperature": options.temperature().has_value() ? @(options.temperature().value()) : [NSNull null],
    @"maxTokens": options.maxTokens().has_value() ? @(options.maxTokens().value()) : [NSNull null],
    @"topP": options.topP().has_value() ? @(options.topP().value()) : [NSNull null],
    @"topK": options.topK().has_value() ? @(options.topK().value()) : [NSNull null],
    @"schema": options.schema() ?: [NSNull null],
    @"tools": options.tools() ?: [NSNull null],
    @"toolCallingMode": options.toolCallingMode() ?: [NSNull null],
    @"providerOptions": options.providerOptions() ?: [NSNull null],
  };
  
  auto callToolBlock = ^(NSString *toolId, NSString *arguments, void (^completion)(id, NSError *)) {
    [self callToolWithId:toolId arguments:arguments completion:completion];
  };

  [_llm generateStream:streamId
              messages:messages
               options:opts
              onUpdate:^(NSString *streamId, NSString *content, NSArray *entries) {
    NSMutableDictionary *payload = [@{@"streamId": streamId, @"content": content} mutableCopy];
    if (entries != nil) {
      payload[@"entries"] = entries;
    }
    [self emitOnStreamUpdate:payload];
  }
            onComplete:^(NSString *streamId) {
    [self emitOnStreamComplete:@{@"streamId": streamId}];
  }
               onError:^(NSString *streamId, NSString *code, NSString *error) {
    NSMutableDictionary *payload = [@{@"streamId": streamId, @"error": error} mutableCopy];
    if (code.length > 0) {
      payload[@"code"] = code;
    }
    [self emitOnStreamError:payload];
  }
           toolInvoker:callToolBlock];
  
}

- (nonnull NSNumber *)isAvailable {
  return @([_llm isAvailable]);
}


@end
