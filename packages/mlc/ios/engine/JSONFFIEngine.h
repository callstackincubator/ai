//
//  LLMEngine.h
//  Pods
//

#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

/**
 * This is an internal Raw JSON FFI Engine that redirects request to internal JSON FFI Engine in C++
 */
@interface JSONFFIEngine : NSObject

- (void)initBackgroundEngine:(void (^)(NSString *))streamCallback;

- (void)reload:(NSString *)engineConfig;

- (void)unload;

- (void)reset;

- (void)chatCompletion:(NSString *)requestJSON requestID:(NSString *)requestID;

- (void)abort:(NSString *)requestID;

- (void)runBackgroundLoop;

- (void)runBackgroundStreamBackLoop;

- (void)exitBackgroundLoop;

@end
