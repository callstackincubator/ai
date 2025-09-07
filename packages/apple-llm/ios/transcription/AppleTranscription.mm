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
#import <ReactCommon/RCTTurboModuleWithJSIBindings.h>

#import <jsi/jsi.h>
#import <react/bridging/Function.h>

#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleTranscription : NativeAppleTranscriptionSpecBase <NativeAppleTranscriptionSpec, RCTCallInvokerModule, RCTTurboModuleWithJSIBindings>
@property (strong, nonatomic) AppleTranscriptionImpl *transcription;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;
using namespace react;

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

- (void)installJSIBindingsWithRuntime:(facebook::jsi::Runtime &)rt callInvoker:(const std::shared_ptr<facebook::react::CallInvoker> &)jsInvoker {
  AppleTranscriptionImpl *transcriptionModule = _transcription;
  
  @try {
    auto global = rt.global();
    
    auto transcribeFunc = jsi::Function::createFromHostFunction(
      rt,
      jsi::PropNameID::forAscii(rt, "transcribe"),
      2,
      [transcriptionModule, jsInvoker](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
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
          [transcriptionModule, audioData, language, jsInvoker](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
            using ResolveCallback = facebook::react::AsyncCallback<>;
            using RejectCallback = facebook::react::AsyncCallback<NSString*, NSString*, NSError*>;
            
            auto resolve = ResolveCallback(rt, args[0].asObject(rt).asFunction(rt), jsInvoker);
            auto reject = RejectCallback(rt, args[1].asObject(rt).asFunction(rt), jsInvoker);
            
            [transcriptionModule transcribe:audioData language:language resolve:^(id result) {
              resolve.call([result](jsi::Runtime& rt, jsi::Function& resolveFunc) {
                auto jsResult = react::TurboModuleConvertUtils::convertObjCObjectToJSIValue(rt, result);
                resolveFunc.call(rt, jsResult);
              });
            } reject:^(NSString *code, NSString *message, NSError *error) {
              reject.call([message](jsi::Runtime& rt, jsi::Function& rejectFunc) {
                auto jsError = jsi::String::createFromUtf8(rt, [message UTF8String]);
                rejectFunc.call(rt, jsError);
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
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleTranscriptionSpecJSI>(params);
}

- (nonnull NSNumber *)isAvailable:(nonnull NSString *)language { 
  return @([_transcription isAvailable:language]);
}

- (void)prepare:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_transcription prepare:language resolve:resolve reject:reject];
}

@end
