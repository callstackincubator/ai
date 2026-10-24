//
//  CoreAI.mm
//  ReactNativeAICoreAI
//

#if __has_include("ReactNativeAICoreAI/ReactNativeAICoreAI-Swift.h")
#import "ReactNativeAICoreAI/ReactNativeAICoreAI-Swift.h"
#else
#import "ReactNativeAICoreAI-Swift.h"
#endif

#import <React/RCTCallInvokerModule.h>
#import <React/RCTCallInvoker.h>
#import <ReactCommon/RCTTurboModule.h>

#import <NativeCoreAI/NativeCoreAI.h>

@interface ReactNativeAICoreAI : NativeCoreAISpecBase <NativeCoreAISpec, RCTCallInvokerModule>
@property (strong, nonatomic) CoreAIImpl *coreAI;
@end

using namespace facebook;
using namespace JS::NativeCoreAI;

static NSDictionary *CoreAIConfigToDictionary(NativeCoreAIModelConfig &config) {
  NSMutableDictionary *dict = [NSMutableDictionary new];
  dict[@"id"] = config.id_();
  dict[@"sourceType"] = config.sourceType();
  if (config.sourceUri()) {
    dict[@"sourceUri"] = config.sourceUri();
  }
  if (config.bundleName()) {
    dict[@"bundleName"] = config.bundleName();
  }
  if (config.bundleExtension()) {
    dict[@"bundleExtension"] = config.bundleExtension();
  }
  if (config.bundleSubdirectory()) {
    dict[@"bundleSubdirectory"] = config.bundleSubdirectory();
  }
  if (config.task()) {
    dict[@"task"] = config.task();
  }
  if (config.family()) {
    dict[@"family"] = config.family();
  }
  if (config.variant()) {
    dict[@"variant"] = config.variant();
  }
  return dict;
}

@implementation ReactNativeAICoreAI

@synthesize callInvoker;

- (instancetype)init {
  self = [super init];
  if (self) {
    _coreAI = [CoreAIImpl new];
  }
  return self;
}

+ (NSString *)moduleName {
  return @"NativeCoreAI";
}

- (std::shared_ptr<react::TurboModule>)getTurboModule:(const react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<react::NativeCoreAISpecJSI>(params);
}

- (void)getCapabilities:(nonnull RCTPromiseResolveBlock)resolve reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI getCapabilities:resolve reject:reject];
}

- (void)inspectModel:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI inspectModel:CoreAIConfigToDictionary(config) resolve:resolve reject:reject];
}

- (void)loadModel:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
          options:(nonnull NSDictionary *)options
          resolve:(nonnull RCTPromiseResolveBlock)resolve
           reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI loadModel:CoreAIConfigToDictionary(config) options:options resolve:resolve reject:reject];
}

- (void)unloadModel:(nonnull NSString *)modelHandle
            resolve:(nonnull RCTPromiseResolveBlock)resolve
             reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI unloadModel:modelHandle resolve:resolve reject:reject];
}

- (void)removeModel:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
            resolve:(nonnull RCTPromiseResolveBlock)resolve
             reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI removeModel:CoreAIConfigToDictionary(config) resolve:resolve reject:reject];
}

- (void)specializeModel:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
                options:(nonnull NSDictionary *)options
                resolve:(nonnull RCTPromiseResolveBlock)resolve
                 reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI specializeModel:CoreAIConfigToDictionary(config) options:options resolve:resolve reject:reject];
}

- (void)createLanguageSession:(nonnull NSString *)modelHandle
                      options:(nonnull NSDictionary *)options
                      resolve:(nonnull RCTPromiseResolveBlock)resolve
                       reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI createLanguageSession:modelHandle options:options resolve:resolve reject:reject];
}

- (void)releaseLanguageSession:(nonnull NSString *)sessionHandle
                       resolve:(nonnull RCTPromiseResolveBlock)resolve
                        reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI releaseLanguageSession:sessionHandle resolve:resolve reject:reject];
}

- (void)respondToLanguageSession:(nonnull NSString *)sessionHandle
                          prompt:(nonnull NSString *)prompt
                         options:(nonnull NSDictionary *)options
                         resolve:(nonnull RCTPromiseResolveBlock)resolve
                          reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI respondToLanguageSession:sessionHandle prompt:prompt options:options resolve:resolve reject:reject];
}

- (void)streamLanguageSession:(nonnull NSString *)streamId
                sessionHandle:(nonnull NSString *)sessionHandle
                       prompt:(nonnull NSString *)prompt
                      options:(nonnull NSDictionary *)options {
  [_coreAI streamLanguageSession:streamId
                   sessionHandle:sessionHandle
                          prompt:prompt
                         options:options
                        onUpdate:^(NSString *streamId, NSString *content) {
    [self emitOnStreamUpdate:@{@"streamId": streamId, @"content": content}];
  }
                      onComplete:^(NSString *streamId) {
    [self emitOnStreamComplete:@{@"streamId": streamId}];
  }
                         onError:^(NSString *streamId, NSString *code, NSString *error) {
    NSMutableDictionary *payload = [@{@"streamId": streamId, @"error": error} mutableCopy];
    if (code.length > 0) {
      payload[@"code"] = code;
    }
    [self emitOnStreamError:payload];
  }];
}

- (void)generateText:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
            messages:(nonnull NSArray *)messages
             options:(nonnull NSDictionary *)options
             resolve:(nonnull RCTPromiseResolveBlock)resolve
              reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI generateText:CoreAIConfigToDictionary(config) messages:messages options:options resolve:resolve reject:reject];
}

- (void)streamText:(nonnull NSString *)streamId
            config:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
          messages:(nonnull NSArray *)messages
           options:(nonnull NSDictionary *)options {
  [_coreAI streamText:streamId
               config:CoreAIConfigToDictionary(config)
             messages:messages
              options:options
             onUpdate:^(NSString *streamId, NSString *content) {
    [self emitOnStreamUpdate:@{@"streamId": streamId, @"content": content}];
  }
           onComplete:^(NSString *streamId) {
    [self emitOnStreamComplete:@{@"streamId": streamId}];
  }
              onError:^(NSString *streamId, NSString *code, NSString *error) {
    NSMutableDictionary *payload = [@{@"streamId": streamId, @"error": error} mutableCopy];
    if (code.length > 0) {
      payload[@"code"] = code;
    }
    [self emitOnStreamError:payload];
  }];
}

- (void)cancelStream:(nonnull NSString *)streamId {
  [_coreAI cancelStream:streamId];
}

- (void)embed:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
       values:(nonnull NSArray *)values
      options:(nonnull NSDictionary *)options
      resolve:(nonnull RCTPromiseResolveBlock)resolve
       reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI embed:CoreAIConfigToDictionary(config) values:values options:options resolve:resolve reject:reject];
}

- (void)transcribe:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
       audioBase64:(nonnull NSString *)audioBase64
         mediaType:(nonnull NSString *)mediaType
           options:(nonnull NSDictionary *)options
           resolve:(nonnull RCTPromiseResolveBlock)resolve
            reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI transcribe:CoreAIConfigToDictionary(config) audioBase64:audioBase64 mediaType:mediaType options:options resolve:resolve reject:reject];
}

- (void)generateImage:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
               prompt:(nonnull NSString *)prompt
              options:(nonnull NSDictionary *)options
              resolve:(nonnull RCTPromiseResolveBlock)resolve
               reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI generateImage:CoreAIConfigToDictionary(config) prompt:prompt options:options resolve:resolve reject:reject];
}

- (void)runTask:(nonnull NSString *)task
         config:(JS::NativeCoreAI::NativeCoreAIModelConfig &)config
          input:(nonnull NSDictionary *)input
        options:(nonnull NSDictionary *)options
        resolve:(nonnull RCTPromiseResolveBlock)resolve
         reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI runTask:task config:CoreAIConfigToDictionary(config) input:input options:options resolve:resolve reject:reject];
}

- (void)runRawFunction:(nonnull NSString *)modelHandle
          functionName:(nonnull NSString *)functionName
                inputs:(nonnull NSDictionary *)inputs
               options:(nonnull NSDictionary *)options
               resolve:(nonnull RCTPromiseResolveBlock)resolve
                reject:(nonnull RCTPromiseRejectBlock)reject {
  [_coreAI runRawFunction:modelHandle functionName:functionName inputs:inputs options:options resolve:resolve reject:reject];
}

@end
