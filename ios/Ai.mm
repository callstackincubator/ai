#import "Ai.h"
#import "MLCEngine.h"

@interface Ai ()

@property (nonatomic, strong) MLCEngine *engine;
@property (nonatomic, strong) NSURL *bundleURL;
@property (nonatomic, strong) NSString *modelPath;
@property (nonatomic, strong) NSString *modelLib;
@property (nonatomic, strong) NSString *displayText;

@end

@implementation Ai

{
    bool hasListeners;
}

RCT_EXPORT_MODULE()

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onChatUpdate", @"onChatComplete"];
}

-(void)startObserving {
    hasListeners = YES;

}

-(void)stopObserving {
    hasListeners = NO;
}


- (instancetype)init {
    self = [super init];
    if (self) {
        _engine = [[MLCEngine alloc] init];
        _bundleURL = [[[NSBundle mainBundle] bundleURL] URLByAppendingPathComponent:@"bundle"];
        _modelPath = @"Phi-3-mini-4k-instruct-q4f16_1-MLC";
        _modelLib = @"phi3_q4f16_1_5c8034316e4d4f818718cf6bf5bf5e89";
    }
    return self;
}

- (NSDictionary *)parseResponseString:(NSString *)responseString {
    NSData *jsonData = [responseString dataUsingEncoding:NSUTF8StringEncoding];
    NSError *error;
    NSArray *jsonArray = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
    
    if (error) {
        NSLog(@"Error parsing JSON: %@", error);
        return nil;
    }
    
    if (jsonArray.count > 0) {
        NSDictionary *responseDict = jsonArray[0];
        NSArray *choices = responseDict[@"choices"];
        if (choices.count > 0) {
            NSDictionary *choice = choices[0];
            NSDictionary *delta = choice[@"delta"];
            NSString *content = delta[@"content"];
            NSString *finishReason = choice[@"finish_reason"];
            
            BOOL isFinished = (finishReason != nil && ![finishReason isEqual:[NSNull null]]);
            
            return @{
                @"content": content ?: @"",
                @"isFinished": @(isFinished)
            };
        }
    }
    
    return nil;
}

RCT_EXPORT_METHOD(doGenerate:(NSString *)instanceId
                  text:(NSString *)text
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"Generating for instance ID: %@, with text: %@", instanceId, text);
    _displayText = @"";
    __block BOOL hasResolved = NO;
    
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        NSURL *modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];
        NSString *modelLocalPath = [modelLocalURL path];
        
        [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];
        
        NSDictionary *message = @{
            @"role": @"user",
            @"content": text
        };
        
        [self.engine chatCompletionWithMessages:@[message] completion:^(id response) {
            if ([response isKindOfClass:[NSString class]]) {
                NSDictionary *parsedResponse = [self parseResponseString:response];
                if (parsedResponse) {
                    NSString *content = parsedResponse[@"content"];
                    BOOL isFinished = [parsedResponse[@"isFinished"] boolValue];
                    
                    if (content) {
                        self.displayText = [self.displayText stringByAppendingString:content];
                    }
                    
                    if (isFinished && !hasResolved) {
                        hasResolved = YES;
                        resolve(self.displayText);
                    }

                } else {
                    if (!hasResolved) {
                        hasResolved = YES;
                        reject(@"PARSE_ERROR", @"Failed to parse response", nil);
                    }
                }
            } else {
                if (!hasResolved) {
                    hasResolved = YES;
                    reject(@"INVALID_RESPONSE", @"Received an invalid response type", nil);
                }
            }
        }];
    });
}

RCT_EXPORT_METHOD(doStream:(NSString *)instanceId
                  text:(NSString *)text
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
        
    NSLog(@"Streaming for instance ID: %@, with text: %@", instanceId, text);
    
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        __block BOOL hasResolved = NO;
        
        NSURL *modelLocalURL = [self.bundleURL URLByAppendingPathComponent:self.modelPath];
        NSString *modelLocalPath = [modelLocalURL path];
        
        [self.engine reloadWithModelPath:modelLocalPath modelLib:self.modelLib];
        
        NSDictionary *message = @{
            @"role": @"user",
            @"content": text
        };
        
        [self.engine chatCompletionWithMessages:@[message] completion:^(id response) {
            if ([response isKindOfClass:[NSString class]]) {
                NSDictionary *parsedResponse = [self parseResponseString:response];
                if (parsedResponse) {
                    NSString *content = parsedResponse[@"content"];
                    BOOL isFinished = [parsedResponse[@"isFinished"] boolValue];
                    
                    if (content) {
                        self.displayText = [self.displayText stringByAppendingString:content];
                        if (self->hasListeners) {
                             [self sendEventWithName:@"onChatUpdate" body:@{@"content": content}];
                         }
                    }
                    
                    if (isFinished && !hasResolved) {
                        hasResolved = YES;
                        if (self->hasListeners) {
                             [self sendEventWithName:@"onChatComplete" body:nil];
                         }
                        
                        resolve(@"");
                        
                        return;
                    }
                } else {
                    if (!hasResolved) {
                        hasResolved = YES;
                        reject(@"PARSE_ERROR", @"Failed to parse response", nil);
                    }
                }
            } else {
                if (!hasResolved) {
                    hasResolved = YES;
                    reject(@"INVALID_RESPONSE", @"Received an invalid response type", nil);
                }
            }
        }];
    });
}


RCT_EXPORT_METHOD(getModel:(NSString *)name
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
    NSLog(@"Getting model: %@", name);
    // TODO: add a logic for fetching models if they're not presented in the `bundle/` directory.
    NSDictionary *modelInfo = @{
        @"path": self.modelPath,
        @"lib": self.modelLib
    };
    
    resolve(modelInfo);
}

// Don't compile this code when we build for the old architecture.
#ifdef RCT_NEW_ARCH_ENABLED
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
    return std::make_shared<facebook::react::NativeAiSpecJSI>(params);
}
#endif

@end
