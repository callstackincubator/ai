import React, { useState } from 'react';

import { StatusBar } from 'expo-status-bar';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { NativeAppleLLM } from '@react-native-ai/apple';

export default function App() {
  const [text, setText] = useState('What is the meaning of life?');
  const isAvailable = NativeAppleLLM.isAvailable();

  return (
    <View style={styles.container}>
      <Text>Is Apple Intelligence available: {isAvailable ? 'Yes' : 'No'}</Text>
      <TextInput value={text} onChangeText={setText} />
      <Button
        title="Generate"
        onPress={async () => {
          const result = await NativeAppleLLM.generateText(
            [
              {
                role: 'user',
                content: text,
              },
            ],
            {}
          );
          Alert.alert(result);
        }}
      />
      <Button
        title="Stream"
        onPress={async () => {
          NativeAppleLLM.generateStream(
            [
              {
                role: 'user',
                content: text,
              },
            ],
            {}
          );

          NativeAppleLLM.onStreamUpdate((data) => {
            console.log(data);
          });

          NativeAppleLLM.onStreamComplete((data) => {
            console.log(data);
          });
        }}
      />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
