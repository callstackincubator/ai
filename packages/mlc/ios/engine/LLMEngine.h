/*
 * Copyright (c) MLC-AI
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * This file is derived from the MLC-LLM project:
 * https://github.com/mlc-ai/mlc-llm
 */

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
