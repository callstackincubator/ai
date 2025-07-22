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
#import <ReactCommon/RCTTurboModule.h>

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

- (void)callToolWithName:(NSString *)toolName
               arguments:(NSDictionary *)arguments
              completion:(void (^)(id result, NSError *error))completion {
  [self.callInvoker callInvoker]->invokeAsync([toolName, arguments, completion](jsi::Runtime& rt) {
    @try {
      auto global = rt.global();
      auto tools = global.getPropertyAsObject(rt, "__APPLE_LLM_TOOLS__");
      auto tool = tools.getPropertyAsFunction(rt, [toolName UTF8String]);
      
      auto args = react::TurboModuleConvertUtils::convertObjCObjectToJSIValue(rt, arguments).getObject(rt);
      
      auto result = tool.call(rt, args);
      
      auto isPromise = result.isObject() && result.asObject(rt).hasProperty(rt, "then");
      
      if (!isPromise) {
        id response = react::TurboModuleConvertUtils::convertJSIValueToObjCObject(rt, result, nullptr, false);
        completion(response, nil);
        return;
      }
      
      auto promiseObj = result.asObject(rt);
      
      auto onResolve = jsi::Function::createFromHostFunction(rt,
                                                             jsi::PropNameID::forAscii(rt, "resolve"),
                                                             1,
                                                             [completion](jsi::Runtime& rt,
                                                                          const jsi::Value&,
                                                                          const jsi::Value* args,
                                                                          size_t count) {
        id response = react::TurboModuleConvertUtils::convertJSIValueToObjCObject(rt, args[0], nullptr, false);
        completion(response, nil);
        return jsi::Value::undefined();
      });
      
      auto onReject = jsi::Function::createFromHostFunction(rt,
                                                            jsi::PropNameID::forAscii(rt, "reject"),
                                                            1,
                                                            [completion](jsi::Runtime& rt,
                                                                         const jsi::Value&,
                                                                         const jsi::Value* args,
                                                                         size_t count) {
        NSError *error = [NSError errorWithDomain:@"AppleLLM"
                                             code:1
                                         userInfo:@{NSLocalizedDescriptionKey: @"There was an error calling tool"}];
        completion(nil, error);
        return jsi::Value::undefined();
      });
      
      promiseObj.getPropertyAsFunction(rt, "then").callWithThis(rt, promiseObj, onResolve, onReject);
    } @catch (NSException *exception) {
      NSError *error = [NSError errorWithDomain:@"AppleLLM"
                                           code:1
                                       userInfo:@{NSLocalizedDescriptionKey: exception.reason}];
      completion(nil, error);
    }
  });
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
    @"tools": options.tools() ?: [NSNull null]
  };
  
  auto callToolBlock = ^(NSString *toolName, id parameters, void (^completion)(id, NSError *)) {
    [self callToolWithName:toolName arguments:(NSDictionary *)parameters completion:completion];
  };
  
  [_llm generateText:messages options:opts resolve:resolve reject:reject toolInvoker:callToolBlock];
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
    @"schema": options.schema() ?: [NSNull null]
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
