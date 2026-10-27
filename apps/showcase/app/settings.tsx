import {
  Button,
  Form,
  Host,
  LabeledContent,
  Picker,
  ProgressView,
  Section,
  Text,
  Toggle,
} from '@expo/ui/swift-ui'
import { pickerStyle, tag } from '@expo/ui/swift-ui/modifiers'
import Constants from 'expo-constants'
import React from 'react'
import { Alert, StyleSheet } from 'react-native'

import {
  features,
  useEnabledFeatures,
  useOnboarding,
} from '../src/store/features'
import { chatModels, useDownloadProgress, useModels } from '../src/store/models'

function ModelRow({ index }: { index: number }) {
  const adapter = chatModels[index]
  const { availability, downloadModel, deleteModel } = useModels()
  const progress = useDownloadProgress(adapter.modelId)
  const downloaded = availability.get(adapter.modelId) === 'yes'

  return (
    <LabeledContent label={adapter.label}>
      {progress !== undefined ? (
        <ProgressView value={progress / 100} />
      ) : downloaded ? (
        <Button
          label="Delete"
          role="destructive"
          onPress={() =>
            Alert.alert(
              `Delete ${adapter.label}?`,
              'You can download it again later.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => deleteModel(adapter),
                },
              ]
            )
          }
        />
      ) : (
        <Button
          label="Download"
          onPress={() =>
            downloadModel(adapter).catch((error) =>
              Alert.alert('Download failed', error?.message)
            )
          }
        />
      )}
    </LabeledContent>
  )
}

export default function Settings() {
  const { isEnabled, toggleFeature } = useEnabledFeatures()
  const { setOnboarded } = useOnboarding()
  const { readyModels, selectedModel, selectModel } = useModels()

  return (
    <Host style={styles.host}>
      <Form>
        <Section title="Features">
          {features.map((feature) => (
            <Toggle
              key={feature.id}
              label={feature.title}
              systemImage={feature.symbol}
              isOn={isEnabled(feature.id)}
              onIsOnChange={() => toggleFeature(feature.id)}
            />
          ))}
        </Section>
        <Section
          title="Chat model"
          footer={<Text>Used by Chat and Voice.</Text>}
        >
          <Picker
            label="Model"
            selection={selectedModel?.modelId ?? null}
            onSelectionChange={selectModel}
            modifiers={[pickerStyle('menu')]}
          >
            {readyModels.map((adapter) => (
              <Text key={adapter.modelId} modifiers={[tag(adapter.modelId)]}>
                {adapter.label}
              </Text>
            ))}
          </Picker>
        </Section>
        <Section
          title="Downloads"
          footer={<Text>Open models run fully offline once downloaded.</Text>}
        >
          {chatModels.map((adapter, index) =>
            adapter.builtIn ? null : (
              <ModelRow key={adapter.modelId} index={index} />
            )
          )}
        </Section>
        <Section title="About">
          <LabeledContent label="Version">
            <Text>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </LabeledContent>
          <Button
            label="Show Welcome Again"
            onPress={() => setOnboarded(false)}
          />
        </Section>
      </Form>
    </Host>
  )
}

const styles = StyleSheet.create({
  host: {
    flex: 1,
  },
})
