import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import {
  getModel,
  type AiModelSettings,
  prepareModel,
  downloadModel,
} from 'react-native-ai';
import { generateText, type CoreMessage } from 'ai';
import { v4 as uuid } from 'uuid';
import NetworkInfo from './NetworkInfo';
import { ModelSelection } from './ModelSelection';

const aiBot = {
  _id: 2,
  name: 'AI Chat Bot',
  avatar: require('./../assets/avatar.png'),
};

export default function Example() {
  const [modelId, setModelId] = useState<string>();
  const [displayedMessages, setDisplayedMessages] = useState<IMessage[]>([]);

  const onSendMessage = useCallback(
    async (messages: IMessage[]) => {
      if (modelId) {
        const { text } = await generateText({
          model: getModel(modelId),
          temperature: 0.6,
          messages: messages
            .slice(0, -1)
            .toReversed()
            .map((message): CoreMessage => {
              return {
                content: message.text,
                role: message.user._id === 2 ? 'assistant' : 'user',
              };
            }),
        });

        setDisplayedMessages((previousMessages) =>
          GiftedChat.append(previousMessages, {
            // @ts-ignore
            _id: uuid(),
            text,
            createdAt: new Date(),
            user: aiBot,
          })
        );
      }
    },
    [modelId]
  );

  const addAiBotMessage = useCallback((text: string) => {
    setDisplayedMessages((previousMessages) =>
      GiftedChat.append(previousMessages, {
        // @ts-ignore
        _id: uuid(),
        text,
        createdAt: new Date(),
        user: aiBot,
      })
    );
  }, []);

  const selectModel = useCallback(
    async (modelSettings: AiModelSettings) => {
      if (modelSettings.model_id) {
        setModelId(modelSettings.model_id);

        addAiBotMessage('Downloading model...');
        await downloadModel(modelSettings.model_id, {
          onStart: () => {
            addAiBotMessage('Starting model download...');
          },
          onProgress: (progress) => {
            addAiBotMessage(`Downloading: ${progress.percentage.toFixed(2)}%`);
          },
          onComplete: () => {
            addAiBotMessage('Model download complete!');
          },
          onError: (error) => {
            addAiBotMessage(`Error downloading model: ${error.message}`);
          },
        });

        await prepareModel(modelSettings.model_id);

        addAiBotMessage('Model ready for conversation.');
      }
    },
    [addAiBotMessage]
  );

  const onSend = useCallback(
    (newMessage: IMessage[]) => {
      if (newMessage[0]) {
        setDisplayedMessages((previousMessages) =>
          GiftedChat.append(previousMessages, newMessage)
        );

        onSendMessage([newMessage[0], ...displayedMessages]);
      }
    },
    [onSendMessage, displayedMessages]
  );

  return (
    <SafeAreaView style={styles.container}>
      <NetworkInfo />
      <ModelSelection onModelIdSelected={selectModel} />
      <GiftedChat
        messages={displayedMessages}
        onSend={onSend}
        user={{
          _id: 1,
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
