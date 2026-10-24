import { Button, ContextMenu, Host } from '@expo/ui/swift-ui'
import { buttonStyle, foregroundStyle } from '@expo/ui/swift-ui/modifiers'
import React from 'react'

export function AttachmentMenu() {
  return (
    <Host matchContents>
      <ContextMenu>
        <ContextMenu.Items>
          <Button
            label="Take Photo"
            systemImage="camera"
            onPress={() => console.log('Take Photo')}
          />
          <Button
            label="Photo Library"
            systemImage="photo.on.rectangle"
            onPress={() => console.log('Photo Library')}
          />
        </ContextMenu.Items>
        <ContextMenu.Trigger>
          <Button
            systemImage="plus"
            modifiers={[
              buttonStyle('borderless'),
              foregroundStyle({ type: 'hierarchical', style: 'tertiary' }),
            ]}
          />
        </ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  )
}
