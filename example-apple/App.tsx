import React, { useState } from 'react';

import { StatusBar } from 'expo-status-bar';
import { Alert, Button, StyleSheet, Text, TextInput, View } from 'react-native';

import { foundationModels } from '@react-native-ai/apple';

export default function App() {
  const [text, setText] = useState('What is the meaning of life?');
  const isAvailable = foundationModels.isAvailable();

  return (
    <View style={styles.container}>
      <Text>Is Apple Intelligence available: {isAvailable ? 'Yes' : 'No'}</Text>
      <TextInput value={text} onChangeText={setText} />
      <Button
        title="Generate"
        onPress={async () => {
          const result = await foundationModels.generateText(
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
          const stream = foundationModels.generateStream(
            [
              {
                role: 'user',
                content: text,
              },
            ],
            {}
          );
          for await (const chunk of stream) {
            console.log(chunk);
          }
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
