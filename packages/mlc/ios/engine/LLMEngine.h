//
//  LLMEngine.h
//  Pods
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface LLMEngine : NSObject

- (instancetype)init;

- (void)reloadWithModelPath:(NSString *)modelPath modelLib:(NSString *)modelLib;
- (void)reset;
- (void)unload;

- (void)chatCompletionWithMessages:(NSArray *)messages completion:(void (^)(id response))completion;
@end

NS_ASSUME_NONNULL_END
