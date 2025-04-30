import React, { useCallback, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  Text,
} from 'react-native';
import { GiftedChat, type IMessage } from 'react-native-gifted-chat';
import {
  getModel,
  type AiModelSettings,
  prepareModel,
  downloadModel,
} from 'react-native-ai';
import { streamText, type CoreMessage } from 'ai';
import { v4 as uuid } from 'uuid';
import NetworkInfo from './NetworkInfo';
import { ModelSelection } from './ModelSelection';

const aiBot = {
  _id: 2,
  name: 'AI Chat Bot',
  avatar: require('./../assets/avatar.png'),
};

const ProgressBar = ({ progress }: { progress: number }) => {
  if (progress === 100) return null;
  
  return (
    <View style={styles.progressContainer}>
      <View style={[styles.progressBar, { width: `${progress}%` }]} />
      <Text style={styles.progressText}>{progress.toFixed(1)}%</Text>
    </View>
  );
};

export default function Example() {
  const [modelId, setModelId] = useState<string>();
  const [displayedMessages, setDisplayedMessages] = useState<IMessage[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);

  const onSendMessage = useCallback(
    async (messages: IMessage[]) => {
      if (modelId) {
        try {
          const { textStream } = streamText({
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

          let firstChunk = true;
          for await (const chunk of textStream) {
            if (firstChunk) {
              setDisplayedMessages((previousMessages) =>
                GiftedChat.append(previousMessages, {
                  // @ts-ignore
                  _id: uuid(),
                  text: chunk,
                  createdAt: new Date(),
                  user: aiBot,
                })
              );
            } else {
              setDisplayedMessages((previousMessages) => {
                let newMessages = [...previousMessages];
                const prevMessage = newMessages.shift();
                return [
                  {
                    _id: prevMessage?._id ?? uuid(),
                    text: prevMessage?.text ? prevMessage.text + chunk : chunk,
                    createdAt: prevMessage?.createdAt ?? new Date(),
                    user: aiBot,
                  },
                  ...newMessages,
                ];
              });
            }
            firstChunk = false;
          }
        } catch (error) {
          console.log('Error:', error);
        }
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
            setDownloadProgress(progress.percentage);
          },
          onComplete: () => {
            setDownloadProgress(100);
            addAiBotMessage('Model download complete!');
          },
          onError: (error) => {
            setDownloadProgress(0);
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
        renderFooter={() => (
          <View style={styles.footerContainer}>
            <ProgressBar progress={downloadProgress} />
          </View>
        )}
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
