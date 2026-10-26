//
//  AppleUtils.mm
//  AppleLLM
//
//  Created by Mike Grabowski on 03/08/2025.
//

#if __has_include("AppleLLM/AppleLLM-Swift.h")
#import "AppleLLM/AppleLLM-Swift.h"
#else
#import "AppleLLM-Swift.h"
#endif

#import <ReactCommon/RCTTurboModule.h>
#import <NativeAppleLLM/NativeAppleLLM.h>

@interface AppleUtils : NativeAppleUtilsSpecBase <NativeAppleUtilsSpec>
@end

using namespace facebook;

@implementation AppleUtils

+ (NSString *)moduleName {
  return @"NativeAppleUtils";
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleUtilsSpecJSI>(params);
}

// A BCP 47 code such as en-US or zh-Hans-CN. The locale identifier can carry
// keywords such as "@rg=plzzzz" (when language and region differ), which
// AVSpeechSynthesisVoice and other APIs taking a language code do not accept
- (NSString *)getCurrentLocale {
  NSLocale *locale = [NSLocale currentLocale];
  NSMutableArray<NSString *> *parts = [NSMutableArray arrayWithObject:locale.languageCode];
  if (locale.scriptCode != nil) {
    [parts addObject:locale.scriptCode];
  }
  if (locale.countryCode != nil) {
    [parts addObject:locale.countryCode];
  }
  return [parts componentsJoinedByString:@"-"];
}

@end
