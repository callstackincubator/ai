#import <React/RCTEventEmitter.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import "RNAiSpec.h"

@interface Ai : RCTEventEmitter <NativeAiSpec>
#else
#import <React/RCTBridgeModule.h>

@interface Ai : RCTEventEmitter <RCTBridgeModule>
#endif

@end
