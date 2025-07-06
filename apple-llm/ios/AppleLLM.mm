//
//  AppleLLM.m
//  AppleLLM
//
//  Created by Mike Grabowski on 06/07/2025.
//

#import "AppleLLM.h"

@interface RCT_EXTERN_MODULE(AppleLLM, NSObject)

- (NSArray<NSString*>*)supportedEvents {
  return @[ @"onStreamUpdate", @"onStreamComplete", @"onStreamError"];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams&)params {
  return std::make_shared<facebook::react::NativeAppleLLMSpecJSI>(params);
}

RCT_EXTERN_METHOD(generateText:(NSArray *)messages options:(NSDictionary *)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(isModelAvailable:(NSString *)modelId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(startStream:(NSArray *)messages options:(NSDictionary *)options resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(cancelStream:(NSString *)streamId resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)

@end
