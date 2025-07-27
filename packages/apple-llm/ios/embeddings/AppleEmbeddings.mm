//
//  AppleEmbeddings.mm
//  AppleLLM
//
//  Created by Mike Grabowski on 27/07/2025.
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

@interface AppleEmbeddings : NativeAppleEmbeddingsSpecBase <NativeAppleEmbeddingsSpec>
@property (strong, nonatomic) AppleEmbeddingsImpl *embeddings;
@end

using namespace facebook;
using namespace JS::NativeAppleLLM;

@implementation AppleEmbeddings

- (instancetype)init {
  self = [super init];
  if (self) {
    _embeddings = [AppleEmbeddingsImpl new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeAppleEmbeddings";
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeAppleEmbeddingsSpecJSI>(params);
}

- (void)getInfo:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject {
  [_embeddings getInfo:language resolve:resolve reject:reject];
}

- (void)prepare:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject {
  [_embeddings prepare:language resolve:resolve reject:reject];
}

- (void)generateEmbeddings:(nonnull NSArray *)sentences language:(nonnull NSString *)language resolve:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject {
  [_embeddings generateEmbeddings:sentences language:language resolve:resolve reject:reject];
}

@end
