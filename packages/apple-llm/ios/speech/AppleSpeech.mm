//
//  AppleSpeech.mm
//  AppleLLM
//
//  Created by Mike Grabowski on 01/08/2025.
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

@interface AppleSpeech : NativeAppleSpeechSpecBase <NativeAppleSpeechSpec, RCTCallInvokerModule>
@property (strong, nonatomic) AppleSpeechImpl *speech;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleSpeech

@synthesize callInvoker;

- (instancetype)init {
  self = [super init];
  if (self) {
    _speech = [AppleSpeechImpl new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeAppleSpeech";
}

- (void)installTranscribeFunc:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker {
  AppleSpeechImpl *speechModule = _speech;
  
  auto runOnJS = [jsInvoker](std::function<void()>&& f) {
    jsInvoker->invokeAsync(std::move(f));
  };
  
  jsInvoker->invokeAsync([speechModule, runOnJS](jsi::Runtime& rt) {
    @try {
      auto global = rt.global();
      
      auto transcribeFunc = jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "transcribe"),
        2,
        [speechModule, runOnJS](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
          auto arrayBuffer = args[0].asObject(rt);
          if (!arrayBuffer.isArrayBuffer(rt)) {
            throw jsi::JSError(rt, "First argument must be an ArrayBuffer");
          }
          
          auto buffer = arrayBuffer.getArrayBuffer(rt);
          NSData *audioData = [NSData dataWithBytes:buffer.data(rt) length:buffer.size(rt)];
          
          auto languageStr = args[1].asString(rt).utf8(rt);
          NSString *language = [NSString stringWithUTF8String:languageStr.c_str()];
          
          auto Promise = rt.global().getPropertyAsFunction(rt, "Promise");
          
          return Promise.callAsConstructor(rt, jsi::Function::createFromHostFunction(
            rt,
            jsi::PropNameID::forAscii(rt, "executor"),
            2,
            [speechModule, audioData, language, runOnJS](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
              auto resolve = std::make_shared<jsi::Function>(args[0].asObject(rt).asFunction(rt));
              auto reject = std::make_shared<jsi::Function>(args[1].asObject(rt).asFunction(rt));
              
              [speechModule transcribe:audioData
                              language:language
                               resolve:^(NSString* result) {
                                 runOnJS([resolve, result, &rt]() {
                                   auto jsResult = jsi::String::createFromUtf8(rt, [result UTF8String]);
                                   resolve->call(rt, jsResult);
                                 });
                              } reject:^(NSString *code, NSString *message, NSError *error) {
                                 runOnJS([reject, message, &rt]() {
                                   auto jsError = jsi::String::createFromUtf8(rt, [message UTF8String]);
                                   reject->call(rt, jsError);
                                 });
                              }];
              
              return jsi::Value::undefined();
            }
          ));
        }
      );
      
      global.setProperty(rt, "__apple__llm__transcribe__", transcribeFunc);
    } @catch (NSException *exception) {
      throw jsi::JSError(rt, [[NSString stringWithFormat:@"Failed to install transcribe handler: %@", exception.reason] UTF8String]);
    }
  });
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  [self installTranscribeFunc:params.jsInvoker];
  return std::make_shared<react::NativeAppleSpeechSpecJSI>(params);
}

- (nonnull NSNumber *)isAvailable:(nonnull NSString *)language { 
  return @([_speech isAvailable:language]);
}

- (void)prepare:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_speech prepare:language resolve:resolve reject:reject];
}

@end
