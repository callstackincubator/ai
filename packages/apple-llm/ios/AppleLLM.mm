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
  return @"NativeAppleLLM";
}

static NSError *AppleLLMToolError(NSString *message) {
  return [NSError errorWithDomain:@"AppleLLM"
                             code:1
                         userInfo:@{NSLocalizedDescriptionKey: message}];
}

static NSString *AppleLLMToolRejectionMessage(jsi::Runtime &rt, const jsi::Value *args, size_t count) {
  NSString *fallback = @"There was an error calling tool";
  if (count == 0) {
    return fallback;
  }

  try {
    const jsi::Value &reason = args[0];
    if (reason.isObject()) {
      auto message = reason.asObject(rt).getProperty(rt, "message");
      if (message.isString()) {
        return [NSString stringWithUTF8String:message.asString(rt).utf8(rt).c_str()] ?: fallback;
      }
    }
    return [NSString stringWithUTF8String:reason.toString(rt).utf8(rt).c_str()] ?: fallback;
  } catch (...) {
    return fallback;
  }
}

- (void)callToolWithId:(NSString *)toolId
             arguments:(NSString *)arguments
            completion:(void (^)(id result, NSError *error))completion {
  [self.callInvoker callInvoker]->invokeAsync([toolId, arguments, completion](jsi::Runtime& rt) {
    // JSI throws C++ exceptions, which @try/@catch does not catch
    try {
      // The tool is gone when its generation was cleaned up, e.g. after a stream was cancelled
      auto tools = rt.global().getProperty(rt, "__APPLE_LLM_TOOLS__");
      auto tool = tools.isObject()
        ? tools.asObject(rt).getProperty(rt, [toolId UTF8String])
        : jsi::Value::undefined();
      if (!tool.isObject() || !tool.asObject(rt).isFunction(rt)) {
        completion(nil, AppleLLMToolError([NSString stringWithFormat:@"Tool not found: %@", toolId]));
        return;
      }

      auto args = jsi::String::createFromUtf8(rt, [arguments UTF8String]);
      
      auto result = tool.asObject(rt).asFunction(rt).call(rt, args);
      
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
        id response = count > 0
          ? react::TurboModuleConvertUtils::convertJSIValueToObjCObject(rt, args[0], nullptr, false)
          : nil;
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
        completion(nil, AppleLLMToolError(AppleLLMToolRejectionMessage(rt, args, count)));
        return jsi::Value::undefined();
      });
      
      promiseObj.getPropertyAsFunction(rt, "then").callWithThis(rt, promiseObj, onResolve, onReject);
    } catch (const std::exception &exception) {
      completion(nil, AppleLLMToolError([NSString stringWithUTF8String:exception.what()] ?: @"There was an error calling tool"));
    } catch (...) {
      completion(nil, AppleLLMToolError(@"There was an error calling tool"));
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
    @"seed": options.seed().has_value() ? @(options.seed().value()) : [NSNull null],
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
    @"seed": options.seed().has_value() ? @(options.seed().value()) : [NSNull null],
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
            onComplete:^(NSString *streamId, NSDictionary *usage) {
    NSMutableDictionary *payload = [@{@"streamId": streamId} mutableCopy];
    if (usage != nil) {
      payload[@"usage"] = usage;
    }
    [self emitOnStreamComplete:payload];
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
