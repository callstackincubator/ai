import { Button, Host, Menu } from '@expo/ui/swift-ui'
import {
  buttonStyle,
  foregroundStyle,
  labelStyle,
} from '@expo/ui/swift-ui/modifiers'
import React from 'react'

// Menu opens on a single tap; ContextMenu would require a long press
export function AttachmentMenu() {
  return (
    <Host matchContents>
      <Menu
        label="Add attachment"
        systemImage="plus"
        modifiers={[
          labelStyle('iconOnly'),
          buttonStyle('borderless'),
          foregroundStyle({ type: 'hierarchical', style: 'tertiary' }),
        ]}
      >
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
      </Menu>
    </Host>
  )
}
