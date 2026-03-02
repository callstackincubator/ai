#import <Foundation/Foundation.h>
#import <ReactCommon/CallInvoker.h>
#import <ReactCommon/RCTTurboModule.h>
#import <ReactCommon/TurboModule.h>
#import "../cpp/NcnnWrapperModule.h"

@interface NativeNcnnWrapperProvider : NSObject <RCTModuleProvider>

@end

@implementation NativeNcnnWrapperProvider

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NcnnWrapperModule>(params.jsInvoker);
}

@end
