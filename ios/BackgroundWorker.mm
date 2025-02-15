//
//  BackgroundWorker.mm
//  Pods
//
//  Created by Szymon Rybczak on 19/07/2024.
//

#import "BackgroundWorker.h"

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
