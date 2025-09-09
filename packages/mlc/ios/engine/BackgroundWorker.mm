//
//  BackgroundWorker.mm
//  Pods
//

#import "BackgroundWorker.h"

/**
 * BackgroundWorker manages background thread execution for the MLC engine.
 * This class provides a simple interface to run long-running tasks on separate threads,
 * ensuring the main thread remains responsive while the LLM engine processes requests.
 * It's used to run the engine's background loop and stream processing loop concurrently.
 */
@implementation BackgroundWorker {
  void (^_task)(void);
}

- (instancetype)initWithTask:(void (^)(void))task {
  self = [super init];
  if (self) {
    _task = [task copy];
  }
  return self;
}

- (void)main {
  if (_task) {
    _task();
  }
}

@end
