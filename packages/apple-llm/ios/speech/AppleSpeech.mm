//
//  AppleSpeech.mm
//  AppleLLM
//
//  Created by Mike Grabowski on 04/08/2025.
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
#import <react/bridging/Function.h>

#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleSpeech : NativeAppleSpeechSpecBase <NativeAppleSpeechSpec, RCTCallInvokerModule>
@property (strong, nonatomic) AppleSpeechImpl *speech;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;
using namespace react;

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

- (void)installGenerateFunc:(std::shared_ptr<facebook::react::CallInvoker>)jsInvoker {
  AppleSpeechImpl *speechModule = _speech;
  
  jsInvoker->invokeAsync([speechModule, jsInvoker](jsi::Runtime& rt) {
    @try {
      auto global = rt.global();
      
      auto generateAudioFunc = jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "generateAudio"),
        2,
        [speechModule, jsInvoker](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
          if (count < 1 || !args[0].isString()) {
            throw jsi::JSError(rt, "First argument must be a string (text)");
          }
          
          auto textStr = args[0].asString(rt).utf8(rt);
          NSString *text = [NSString stringWithUTF8String:textStr.c_str()];
          
          auto *options = [NSMutableDictionary new];
          if (count > 1 && args[1].isObject()) {
            auto opts = args[1].asObject(rt);
            
            if (opts.hasProperty(rt, "language")) {
              auto langProp = opts.getProperty(rt, "language");
              if (langProp.isString()) {
                auto langStr = langProp.asString(rt).utf8(rt);
                options[@"language"] = [NSString stringWithUTF8String:langStr.c_str()];
              }
            }
            
            if (opts.hasProperty(rt, "voice")) {
              auto voiceProp = opts.getProperty(rt, "voice");
              if (voiceProp.isString()) {
                auto voiceStr = voiceProp.asString(rt).utf8(rt);
                options[@"voice"] = [NSString stringWithUTF8String:voiceStr.c_str()];
              }
            }
          }
          
          auto Promise = rt.global().getPropertyAsFunction(rt, "Promise");
          
          return Promise.callAsConstructor(rt, jsi::Function::createFromHostFunction(
            rt,
            jsi::PropNameID::forAscii(rt, "executor"),
            2,
            [speechModule, text, options, jsInvoker](jsi::Runtime& rt, const jsi::Value& thisVal, const jsi::Value* args, size_t count) -> jsi::Value {
              using ResolveCallback = facebook::react::AsyncCallback<NSData*>;
              using RejectCallback = facebook::react::AsyncCallback<NSString*, NSString*, NSError*>;
              
              auto resolve = ResolveCallback(rt, args[0].asObject(rt).asFunction(rt), jsInvoker);
              auto reject = RejectCallback(rt, args[1].asObject(rt).asFunction(rt), jsInvoker);
              
              [speechModule generateAudio:text options:options resolve:^(NSData *audioData) {
                resolve.call([audioData](jsi::Runtime& rt, jsi::Function& resolveFunc) {
                  class NSDataMutableBuffer : public facebook::jsi::MutableBuffer {
                  public:
                    NSDataMutableBuffer(uint8_t* data, size_t size) : _data(data), _size(size) {}
                    uint8_t* data() override { return _data; }
                    size_t size() const override { return _size; }
                  private:
                    uint8_t* _data;
                    size_t _size;
                  };

                  uint8_t* data = (uint8_t*)[audioData bytes];
                  size_t size = [audioData length];
                  
                  auto mutableBuffer = std::make_shared<NSDataMutableBuffer>(data, size);
                  auto arrayBuffer = jsi::ArrayBuffer(rt, mutableBuffer);

                  resolveFunc.call(rt, std::move(arrayBuffer));
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
      
      global.setProperty(rt, "__apple__llm__generate_audio__", generateAudioFunc);
    } @catch (NSException *exception) {
      throw jsi::JSError(rt, [[NSString stringWithFormat:@"Failed to install generateAudio handler: %@", exception.reason] UTF8String]);
    }
  });
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  [self installGenerateFunc:params.jsInvoker];
  return std::make_shared<react::NativeAppleSpeechSpecJSI>(params);
}

- (void)getVoices:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_speech getVoices:resolve reject:reject];
}

@end
