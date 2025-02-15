//
//  EngineState.mm
//  Pods
//
//  Created by Szymon Rybczak on 19/07/2024.
//

#import "EngineState.h"
#import "LLMEngine.h"

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
                             completion:(void (^)(NSString* response))completion {
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
