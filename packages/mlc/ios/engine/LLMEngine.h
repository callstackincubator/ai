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

NS_ASSUME_NONNULL_BEGIN

@interface LLMEngine : NSObject

- (instancetype)init;

- (void)reloadWithModelPath:(NSString *)modelPath modelLib:(NSString *)modelLib;
- (void)reset;
- (void)unload;

- (NSString*)chatCompletionWithMessages:(NSArray *)messages options:(NSDictionary *)options completion:(void (^)(NSDictionary* response))completion;
- (void)cancelRequest:(NSString *)requestId;

@end

NS_ASSUME_NONNULL_END
