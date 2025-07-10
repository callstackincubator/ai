//
//  BackgroundWorker.h
//  Pods
//
//  Created by Szymon Rybczak on 19/07/2024.
//

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface BackgroundWorker : NSThread
- (instancetype)initWithTask:(void (^)(void))task;
@end

NS_ASSUME_NONNULL_END
