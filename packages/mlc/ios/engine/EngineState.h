//
//  MLCEngine.h
//  Pods
//
//  Created by Szymon Rybczak on 19/07/2024.
//

#import "JSONFFIEngine.h"
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface EngineState : NSObject
@property(nonatomic, strong) NSMutableDictionary<NSString *, id> *requestStateMap;

- (NSString*)chatCompletionWithJSONFFIEngine:(JSONFFIEngine *)jsonFFIEngine
                                request:(NSDictionary *)request
                             completion:(void (^)(NSDictionary* response))completion;
- (void)streamCallbackWithResult:(NSString *)result;
- (void)cancelRequest:(NSString *)requestId
    withJSONFFIEngine:(JSONFFIEngine *)jsonFFIEngine;
@end

NS_ASSUME_NONNULL_END
