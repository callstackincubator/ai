import React, { useCallback, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { getModel, type AiModelSettings } from 'react-native-ai';
import { generateText } from 'ai';
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
  const [messages, setMessages] = useState<IMessage[]>([]);

  const onSendMessage = useCallback(
    async (prompt: string) => {
      console.log('MODEL: ', modelId);
      if (modelId) {
        console.log('Working on it!');
        const { text } = await generateText({
          model: getModel(modelId),
          prompt,
        });

        setMessages((previousMessages) =>
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

  const selectModel = useCallback((modelSettings: AiModelSettings) => {
    if (modelSettings.model_id) {
      setModelId(modelSettings.model_id);
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, {
          // @ts-ignore
          _id: uuid(),
          text: 'Model ready for conversation.',
          createdAt: new Date(),
          user: aiBot,
        })
      );
    }
  }, []);

  const onSend = useCallback(
    (newMessage: IMessage[]) => {
      setMessages((previousMessages) =>
        GiftedChat.append(previousMessages, newMessage)
      );

      onSendMessage(newMessage[0]!.text);
    },
    [onSendMessage]
  );

  return (
    <SafeAreaView style={styles.container}>
      <NetworkInfo />
      <ModelSelection onModelIdSelected={selectModel} />
      <GiftedChat
        messages={messages}
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
