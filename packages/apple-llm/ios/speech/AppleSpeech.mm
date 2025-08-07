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

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleSpeechSpecJSI>(params);
}

- (nonnull NSNumber *)isAvailable { 
  return @([_speech isAvailable]);
}

- (void)generate:(nonnull NSString *)text options:(JS::NativeAppleLLM::SpeechOptions &)options resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject { 
  NSDictionary *opts = @{
    @"language": options.language().has_value() ? @(options.language().value().c_str()) : [NSNull null],
    @"voice": options.voice().has_value() ? @(options.voice().value().c_str()) : [NSNull null]
  };
  
  [_speech generate:text options:opts resolve:resolve reject:reject];
}

@end
