//
//  EngineState.mm
//  Pods
//

#import "EngineState.h"
#import "JSONFFIEngine.h"

/**
 * EngineState manages the request lifecycle and callback routing for chat completions.
 * It maintains a mapping between request IDs and their corresponding completion handlers,
 * ensuring that streaming responses are properly routed back to the correct caller.
 * This class handles JSON serialization/deserialization and coordinates between
 * the high-level API and the low-level JSON FFI engine.
 */
@implementation EngineState

- (instancetype)init {
  self = [super init];
  if (self) {
    _requestStateMap = [NSMutableDictionary new];
  }
  return self;
}

- (void)chatCompletionWithJSONFFIEngine:(JSONFFIEngine*)jsonFFIEngine
                                request:(NSDictionary*)request
                             completion:(void (^)(id response))completion {
  NSError* error;
  NSData* jsonData = [NSJSONSerialization dataWithJSONObject:request options:0 error:&error];
  if (error) {
    NSLog(@"Error encoding JSON: %@", error);
    return;
  }

  NSString* jsonRequest = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
  NSString* requestID = [[NSUUID UUID] UUIDString];

  // Store the completion handler in the requestStateMap
  self.requestStateMap[requestID] = completion;

  [jsonFFIEngine chatCompletion:jsonRequest requestID:requestID];
}

- (void)streamCallbackWithResult:(NSString*)result {
  NSError* error;
  NSArray* responses = [NSJSONSerialization JSONObjectWithData:[result dataUsingEncoding:NSUTF8StringEncoding] options:0 error:&error];
  if (error) {
    NSLog(@"Error decoding JSON: %@", error);
    return;
  }

  for (NSDictionary* res in responses) {
    NSString* requestID = res[@"id"];
    void (^completion)(NSString*) = self.requestStateMap[requestID];
    if (completion) {
      completion(result);
      if (res[@"usage"]) {
        [self.requestStateMap removeObjectForKey:requestID];
      }
    }
  }
}

@end
