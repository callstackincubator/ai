//
//  AppleTranscription.mm
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

@interface AppleTranscription : NativeAppleTranscriptionSpecBase <NativeAppleTranscriptionSpec, RCTCallInvokerModule>
@property (strong, nonatomic) AppleTranscriptionImpl *transcription;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleTranscription

@synthesize callInvoker;

- (instancetype)init {
  self = [super init];
  if (self) {
    _transcription = [AppleTranscriptionImpl new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeAppleTranscription";
}

- (void)installTranscribeFunc:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker {
  AppleTranscriptionImpl *transcriptionModule = _transcription;
  
  auto runOnJS = [jsInvoker](std::function<void()>&& f) {
    jsInvoker->invokeAsync(std::move(f));
  };
  
  jsInvoker->invokeAsync([transcriptionModule, runOnJS](jsi::Runtime& rt) {
    @try {
      auto global = rt.global();
      
      auto transcribeFunc = jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "transcribe"),
        2,
        [transcriptionModule, runOnJS](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
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
            [transcriptionModule, audioData, language, runOnJS](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
              auto resolve = std::make_shared<jsi::Function>(args[0].asObject(rt).asFunction(rt));
              auto reject = std::make_shared<jsi::Function>(args[1].asObject(rt).asFunction(rt));
              
              [transcriptionModule transcribe:audioData
                                     language:language
                                      resolve:^(id result) {
                                        runOnJS([resolve, result, &rt]() {
                                          auto jsResult = react::TurboModuleConvertUtils::convertObjCObjectToJSIValue(rt, result);
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
  return std::make_shared<react::NativeAppleTranscriptionSpecJSI>(params);
}

- (nonnull NSNumber *)isAvailable:(nonnull NSString *)language { 
  return @([_transcription isAvailable:language]);
}

- (void)prepare:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_transcription prepare:language resolve:resolve reject:reject];
}

@end
