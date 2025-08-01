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

@interface AppleSpeech : NativeAppleSpeechSpecBase <NativeAppleSpeechSpec>
@property (strong, nonatomic) AppleSpeechImpl *speech;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleSpeech

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

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleSpeechSpecJSI>(params);
}

- (nonnull NSNumber *)isAvailable:(nonnull NSString *)language { 
  return @([_speech isAvailable:language]);
}

- (void)prepare:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_speech prepare:language resolve:resolve reject:reject];
}

- (void)transcribe:(nonnull NSString *)audio language:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  [_speech transcribe:audio language:language resolve:resolve reject:reject];
}

@end
