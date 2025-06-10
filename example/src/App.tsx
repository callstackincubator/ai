import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { getModel } from 'react-native-ai';
import { generateText, type CoreMessage } from 'ai';
import { v4 as uuid } from 'uuid';
import NetworkInfo from './NetworkInfo';

const aiBot = {
  _id: 2,
  name: 'AI Chat Bot',
  avatar: require('./../assets/avatar.png'),
};

export default function Example() {
  const [displayedMessages, setDisplayedMessages] = useState<IMessage[]>([
    {
      _id: uuid(),
      text: 'Hello',
      createdAt: new Date(),
      user: aiBot,
    },
  ]);

  const onSendMessage = useCallback(async (messages: IMessage[]) => {
    try {
      console.log('messages', messages);
      const { text } = await generateText({
        model: getModel('apple-on-device'),
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
          text: text,
          createdAt: new Date(),
          user: aiBot,
        })
      );
    } catch (error) {
      console.log('ERROR');
      console.log('Error:', error);
    }
  }, []);

  const onSend = useCallback(
    (newMessage: IMessage[]) => {
      setDisplayedMessages((previousMessages) =>
        GiftedChat.append(previousMessages, newMessage)
      );

      if (newMessage[0]) {
        onSendMessage([newMessage[0], ...displayedMessages]);
      }
    },
    [onSendMessage, displayedMessages]
  );

  return (
    <SafeAreaView style={styles.container}>
      <NetworkInfo />
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
  footerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  progressContainer: {
    height: 28,
    backgroundColor: '#2A2A2A',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#34C759',
    borderRadius: 14,
  },
  progressText: {
    position: 'absolute',
    width: '100%',
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    lineHeight: 28,
  },
});
