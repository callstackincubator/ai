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

- (NSString *)getCurrentLocale {
  // Drop keywords such as "@rg=plzzzz" (set when language and region differ),
  // which Speech and other locale-matching APIs do not accept
  NSString *identifier = [NSLocale currentLocale].localeIdentifier;
  return [identifier componentsSeparatedByString:@"@"].firstObject;
}

@end
