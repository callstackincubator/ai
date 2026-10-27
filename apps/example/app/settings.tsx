import {
  Button,
  Form,
  Host,
  LabeledContent,
  Link,
  Picker,
  ProgressView,
  Section,
  Text,
  Toggle,
} from '@expo/ui/swift-ui'
import { pickerStyle, tag, tint } from '@expo/ui/swift-ui/modifiers'
import Constants from 'expo-constants'
import React from 'react'
import { Alert, StyleSheet } from 'react-native'

import type { Runtime } from '../src/adapters/types'
import { useUserNotes } from '../src/search/useSemanticSearch'
import { useChats } from '../src/store/chats'
import {
  features,
  useEnabledFeatures,
  useOnboarding,
} from '../src/store/features'
import {
  chatModels,
  formatSize,
  runtimes,
  useDownloadProgress,
  useModels,
} from '../src/store/models'
import { accent } from '../src/theme/brand'

function confirm(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: onConfirm },
  ])
}

function ModelRow({ index }: { index: number }) {
  const adapter = chatModels[index]
  const { availability, downloadModel, deleteModel } = useModels()
  const progress = useDownloadProgress(adapter.modelId)
  const status = availability.get(adapter.modelId)
  const label = adapter.sizeBytes
    ? `${adapter.label} · ${formatSize(adapter.sizeBytes)}`
    : adapter.label

  if (adapter.builtIn) {
    return (
      <LabeledContent label={label}>
        <Text>{status === 'yes' ? 'Ready' : 'Not available'}</Text>
      </LabeledContent>
    )
  }

  return (
    <LabeledContent label={label}>
      {progress !== undefined ? (
        <ProgressView value={progress / 100} />
      ) : status === 'yes' ? (
        <Button
          label="Delete"
          role="destructive"
          onPress={() =>
            confirm(
              `Delete ${adapter.label}?`,
              'You can download it again later.',
              () => deleteModel(adapter)
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

function RuntimeSection({ runtime }: { runtime: Runtime }) {
  return (
    <Section
      title={runtimes[runtime].title}
      footer={<Text>{runtimes[runtime].subtitle}</Text>}
    >
      {chatModels.map((adapter, index) =>
        adapter.runtime === runtime ? (
          <ModelRow key={adapter.modelId} index={index} />
        ) : null
      )}
    </Section>
  )
}

export default function Settings() {
  const { isEnabled, toggleFeature } = useEnabledFeatures()
  const { setOnboarded } = useOnboarding()
  const { readyModels, selectedModel, selectModel } = useModels()
  const { chats, deleteAllChats } = useChats()
  const [userNotes, setUserNotes] = useUserNotes()

  return (
    <Host style={styles.host}>
      <Form modifiers={[tint(accent)]}>
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
        <RuntimeSection runtime="apple" />
        <RuntimeSection runtime="llama" />
        <Section
          title="Your data"
          footer={<Text>Chats and notes are stored only on this iPhone.</Text>}
        >
          <Button
            label={`Delete All Chats (${chats.length})`}
            role="destructive"
            onPress={() =>
              confirm(
                'Delete all chats?',
                'This cannot be undone.',
                deleteAllChats
              )
            }
          />
          <Button
            label={`Delete My Notes (${userNotes.length})`}
            role="destructive"
            onPress={() =>
              confirm('Delete your notes?', 'Sample notes stay.', () =>
                setUserNotes([])
              )
            }
          />
        </Section>
        <Section title="About">
          <LabeledContent label="Version">
            <Text>{Constants.expoConfig?.version ?? '1.0.0'}</Text>
          </LabeledContent>
          <Link
            label="Built with React Native AI"
            destination="https://github.com/callstackincubator/ai"
          />
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
